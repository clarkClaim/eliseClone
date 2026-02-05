import { prisma } from '../../db/client.js';
import { parseDate, parseTime, formatTimeForSpeech, formatDateForSpeech } from '../../utils/date.js';
import { bookAppointmentByDatetime, cancelAppointment } from '../../scheduling/index.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { getSuggestedAvailability, type SuggestedAvailability } from './suggested-availability.js';

export interface RescheduleAppointmentParams {
  appointmentId: string; // ID of the appointment to reschedule
  date: string; // e.g., "tomorrow", "Monday", "March 5th"
  time: string; // e.g., "10am", "2:30 PM"
  providerName?: string; // Optional: change provider
}

export interface RescheduleAppointmentResult {
  success: boolean;
  appointment?: {
    date: string;
    time: string;
    provider: string;
    service: string;
  };
  message: string;
  error?: string;
  /** On failure, provides alternative times so assistant can suggest them */
  suggestedAvailability?: SuggestedAvailability;
}

// MRS adapter instance - can be set by the server
let mrsAdapter: MRSAdapter | null = null;

export function setMRSAdapterForReschedule(adapter: MRSAdapter | null): void {
  mrsAdapter = adapter;
}

export async function rescheduleAppointment(
  params: RescheduleAppointmentParams,
  callId?: string
): Promise<RescheduleAppointmentResult> {
  const { appointmentId, date, time, providerName } = params;

  // Get the existing appointment
  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      provider: true,
      service: true,
    },
  });

  if (!existingAppointment || !existingAppointment.provider || !existingAppointment.providerId) {
    return {
      success: false,
      message: "I couldn't find that appointment. Could you tell me which appointment you'd like to reschedule?",
      error: 'appointment_not_found',
    };
  }

  // Narrow types after null checks
  const originalProviderId = existingAppointment.providerId;
  const originalProvider = existingAppointment.provider;
  const originalService = existingAppointment.service;

  // Service may be null for appointments synced from MRS - find a default if needed
  let originalServiceId = existingAppointment.serviceId;
  if (!originalServiceId) {
    // Try to find a general/default service, or just use any available one
    const defaultService = await prisma.appointmentType.findFirst({
      where: {
        OR: [
          { name: { contains: 'General', mode: 'insensitive' } },
          { name: { contains: 'Checkup', mode: 'insensitive' } },
        ],
      },
    }) ?? await prisma.appointmentType.findFirst();

    if (!defaultService) {
      // This shouldn't happen if the system is set up correctly
      console.error('[Reschedule] No appointment types found in database');
      return {
        success: false,
        message: "I'm having trouble rescheduling right now. Would you like to cancel this appointment and book a new one instead?",
        error: 'no_services_available',
      };
    }
    originalServiceId = defaultService.id;
  }

  if (existingAppointment.status === 'cancelled') {
    return {
      success: false,
      message: 'That appointment has already been cancelled. Would you like to book a new appointment instead?',
      error: 'already_cancelled',
    };
  }

  // Parse new date and time
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      success: false,
      message: 'I didn\'t understand that date. Could you say it again? For example, "tomorrow" or "next Monday".',
      error: 'invalid_date',
    };
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return {
      success: false,
      message: 'I didn\'t understand that time. Could you say it again? For example, "10 AM" or "2:30 PM".',
      error: 'invalid_time',
    };
  }

  // Build new start and end times
  const newStartTime = new Date(parsedDate);
  newStartTime.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

  // Don't allow booking in the past
  if (newStartTime < new Date()) {
    return {
      success: false,
      message: 'That time has already passed. Please choose a future time.',
      error: 'time_in_past',
    };
  }

  // Calculate duration from original appointment
  const originalDuration = existingAppointment.endTime.getTime() - existingAppointment.startTime.getTime();
  const newEndTime = new Date(newStartTime.getTime() + originalDuration);

  // Determine provider - use new if specified, otherwise keep the same
  let providerId: string = originalProviderId;
  let providerNameForMessage: string = originalProvider.name;

  if (providerName) {
    const newProvider = await findProvider(providerName);
    if (!newProvider) {
      return {
        success: false,
        message: `I couldn't find a provider named ${providerName}. Would you like to keep your appointment with ${originalProvider.name}?`,
        error: 'provider_not_found',
      };
    }
    providerId = newProvider.id;
    providerNameForMessage = newProvider.name;
  }

  // Try to book the new slot first (before canceling the old one)
  const bookingResult = await bookAppointmentByDatetime(mrsAdapter, {
    patientId: existingAppointment.patientId,
    providerId,
    serviceId: originalServiceId,
    startTime: newStartTime,
    endTime: newEndTime,
  });

  if (!bookingResult.success) {
    // Booking failed - the original appointment is still intact
    // Get suggested availability so assistant can offer alternatives
    const suggestedAvailability = await getSuggestedAvailability();

    const errorMessages: Record<string, string> = {
      conflict: 'That time slot isn\'t available.',
      outside_schedule: 'That time is outside our available hours.',
      validation_error: 'I couldn\'t reschedule to that time.',
    };

    const baseMessage = bookingResult.error ? errorMessages[bookingResult.error] || bookingResult.message : bookingResult.message;

    return {
      success: false,
      message: `${baseMessage} ${suggestedAvailability.summary}`,
      error: bookingResult.error,
      suggestedAvailability,
    };
  }

  // New appointment booked successfully - now cancel the old one
  const cancelResult = await cancelAppointment(mrsAdapter, {
    appointmentId: existingAppointment.id,
    reason: 'Rescheduled',
  });

  if (!cancelResult.success) {
    // This is a rare edge case - we booked the new one but couldn't cancel the old
    // We should still tell the user about the new appointment, but warn them
    console.error(`[Reschedule] Warning: Booked new appointment but failed to cancel old: ${cancelResult.message}`);
  }

  // Format success response
  const dateStr = formatDateForSpeech(newStartTime);
  const timeStr = formatTimeForSpeech(newStartTime);

  // Check if provider name is known
  const providerNameLower = providerNameForMessage.toLowerCase();
  const isProviderKnown = !providerNameLower.includes('unknown') && !providerNameLower.includes('placeholder');

  const confirmationMessage = isProviderKnown
    ? `Done! I've moved your appointment to ${dateStr} at ${timeStr} with ${providerNameForMessage}. Is there anything else I can help you with?`
    : `Done! I've moved your appointment to ${dateStr} at ${timeStr}. Is there anything else I can help you with?`;

  return {
    success: true,
    appointment: {
      date: dateStr,
      time: timeStr,
      provider: isProviderKnown ? providerNameForMessage : '',
      service: originalService?.name ?? '',
    },
    message: confirmationMessage,
  };
}

async function findProvider(name: string): Promise<{ id: string; name: string } | null> {
  const normalizedName = name.toLowerCase().trim();
  const providers = await prisma.provider.findMany({
    where: {
      scheduleTemplates: { some: {} },
    },
  });

  for (const provider of providers) {
    const providerNameLower = provider.name.toLowerCase();
    if (
      providerNameLower.includes(normalizedName) ||
      normalizedName.includes(providerNameLower) ||
      providerNameLower.includes(normalizedName.replace(/^dr\.?\s*/i, ''))
    ) {
      return provider;
    }
  }

  return null;
}
