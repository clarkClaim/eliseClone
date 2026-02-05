import { prisma } from '../../db/client.js';
import { parseDate, parseTime, formatTimeForSpeech, formatDateForSpeech } from '../../utils/date.js';
import { bookAppointmentByDatetime, cancelAppointment as cancelAppointmentService, isWithinSchedule } from '../../scheduling/index.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { getSuggestedAvailability, type SuggestedAvailability } from './suggested-availability.js';

export type AppointmentAction = 'book' | 'cancel' | 'reschedule';

export interface ManageAppointmentParams {
  action: AppointmentAction;
  appointmentId?: string; // Required for cancel/reschedule
  date?: string;          // Required for book/reschedule
  time?: string;          // Required for book/reschedule
  providerName?: string;  // Optional for book/reschedule
  reason?: string;        // Optional for cancel
}

export interface ManageAppointmentResult {
  success: boolean;
  action: AppointmentAction;
  appointment?: {
    id?: string;
    date: string;
    time: string;
    provider: string;
    service: string;
  };
  message: string;
  error?: string;
  suggestedAvailability?: SuggestedAvailability;
}

// MRS adapter instance
let mrsAdapter: MRSAdapter | null = null;

export function setMRSAdapterForManage(adapter: MRSAdapter | null): void {
  mrsAdapter = adapter;
}

export async function manageAppointment(
  params: ManageAppointmentParams,
  callId?: string
): Promise<ManageAppointmentResult> {
  const { action } = params;

  switch (action) {
    case 'book':
      return handleBook(params, callId);
    case 'cancel':
      return handleCancel(params);
    case 'reschedule':
      return handleReschedule(params);
    default:
      return {
        success: false,
        action,
        message: `Unknown action: ${action}. Use 'book', 'cancel', or 'reschedule'.`,
        error: 'invalid_action',
      };
  }
}

// ============================================
// Book Handler
// ============================================

async function handleBook(
  params: ManageAppointmentParams,
  callId?: string
): Promise<ManageAppointmentResult> {
  const { date, time, providerName } = params;

  if (!date || !time) {
    return {
      success: false,
      action: 'book',
      message: 'Please specify the date and time for the appointment.',
      error: 'missing_params',
    };
  }

  // Get patient from conversation
  const patientId = await getPatientFromConversation(callId);
  if (!patientId) {
    return {
      success: false,
      action: 'book',
      message: 'I need to verify your identity first. Could you please confirm your date of birth?',
      error: 'patient_not_identified',
    };
  }

  // Parse date and time
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      success: false,
      action: 'book',
      message: 'I didn\'t understand that date. Could you say it again?',
      error: 'invalid_date',
    };
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return {
      success: false,
      action: 'book',
      message: 'I didn\'t understand that time. Could you say it again?',
      error: 'invalid_time',
    };
  }

  const startTime = new Date(parsedDate);
  startTime.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

  if (startTime < new Date()) {
    return {
      success: false,
      action: 'book',
      message: 'That time has already passed. Please choose a future time.',
      error: 'time_in_past',
    };
  }

  // Find service
  const service = await findDefaultService();
  if (!service) {
    return {
      success: false,
      action: 'book',
      message: 'No services are available for booking.',
      error: 'service_not_found',
    };
  }

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + service.durationMinutes);

  // Find provider
  const provider = providerName
    ? await findProviderByName(providerName)
    : await findAvailableProvider(startTime, endTime);

  if (!provider) {
    const suggestedAvailability = await getSuggestedAvailability();
    return {
      success: false,
      action: 'book',
      message: providerName
        ? `I couldn't find a provider named ${providerName}.`
        : `No providers are available at that time. ${suggestedAvailability.summary}`,
      error: 'provider_not_found',
      suggestedAvailability,
    };
  }

  // Attempt to book
  const result = await bookAppointmentByDatetime(mrsAdapter, {
    patientId,
    providerId: provider.id,
    serviceId: service.id,
    startTime,
    endTime,
  });

  if (!result.success) {
    const suggestedAvailability = await getSuggestedAvailability();
    return {
      success: false,
      action: 'book',
      message: `That time isn't available. ${suggestedAvailability.summary}`,
      error: result.error,
      suggestedAvailability,
    };
  }

  const dateStr = formatDateForSpeech(startTime);
  const timeStr = formatTimeForSpeech(startTime);
  const isProviderKnown = !provider.name.toLowerCase().includes('unknown');

  return {
    success: true,
    action: 'book',
    appointment: {
      id: result.appointmentId,
      date: dateStr,
      time: timeStr,
      provider: isProviderKnown ? provider.name : '',
      service: service.name,
    },
    message: isProviderKnown
      ? `Booked ${service.name} with ${provider.name} for ${dateStr} at ${timeStr}.`
      : `Booked ${service.name} for ${dateStr} at ${timeStr}.`,
  };
}

// ============================================
// Cancel Handler
// ============================================

async function handleCancel(
  params: ManageAppointmentParams
): Promise<ManageAppointmentResult> {
  const { appointmentId, reason } = params;

  if (!appointmentId) {
    return {
      success: false,
      action: 'cancel',
      message: 'Please specify which appointment to cancel using the appointmentId.',
      error: 'missing_appointment_id',
    };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { provider: true, service: true },
  });

  if (!appointment || !appointment.provider) {
    return {
      success: false,
      action: 'cancel',
      message: 'I couldn\'t find that appointment.',
      error: 'appointment_not_found',
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      success: true,
      action: 'cancel',
      message: 'That appointment has already been cancelled.',
    };
  }

  const result = await cancelAppointmentService(mrsAdapter, {
    appointmentId,
    reason: reason || 'Patient requested cancellation',
  });

  if (!result.success) {
    return {
      success: false,
      action: 'cancel',
      message: 'I had trouble cancelling that appointment. Please try again.',
      error: result.error,
    };
  }

  const dateStr = formatDateForSpeech(appointment.startTime);
  const timeStr = formatTimeForSpeech(appointment.startTime);
  const suggestedAvailability = await getSuggestedAvailability();

  const isProviderKnown = !appointment.provider.name.toLowerCase().includes('unknown');

  return {
    success: true,
    action: 'cancel',
    appointment: {
      date: dateStr,
      time: timeStr,
      provider: isProviderKnown ? appointment.provider.name : '',
      service: appointment.service?.name || '',
    },
    message: isProviderKnown
      ? `Cancelled appointment on ${dateStr} at ${timeStr} with ${appointment.provider.name}.`
      : `Cancelled appointment on ${dateStr} at ${timeStr}.`,
    suggestedAvailability,
  };
}

// ============================================
// Reschedule Handler
// ============================================

async function handleReschedule(
  params: ManageAppointmentParams
): Promise<ManageAppointmentResult> {
  const { appointmentId, date, time, providerName } = params;

  if (!appointmentId) {
    return {
      success: false,
      action: 'reschedule',
      message: 'Please specify which appointment to reschedule using the appointmentId.',
      error: 'missing_appointment_id',
    };
  }

  if (!date || !time) {
    return {
      success: false,
      action: 'reschedule',
      message: 'Please specify the new date and time.',
      error: 'missing_params',
    };
  }

  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { provider: true, service: true },
  });

  if (!existingAppointment || !existingAppointment.provider || !existingAppointment.service || !existingAppointment.providerId || !existingAppointment.serviceId) {
    return {
      success: false,
      action: 'reschedule',
      message: 'I couldn\'t find that appointment.',
      error: 'appointment_not_found',
    };
  }

  if (existingAppointment.status === 'cancelled') {
    return {
      success: false,
      action: 'reschedule',
      message: 'That appointment has already been cancelled. Would you like to book a new one?',
      error: 'already_cancelled',
    };
  }

  // Parse new date and time
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      success: false,
      action: 'reschedule',
      message: 'I didn\'t understand that date. Could you say it again?',
      error: 'invalid_date',
    };
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return {
      success: false,
      action: 'reschedule',
      message: 'I didn\'t understand that time. Could you say it again?',
      error: 'invalid_time',
    };
  }

  const newStartTime = new Date(parsedDate);
  newStartTime.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

  if (newStartTime < new Date()) {
    return {
      success: false,
      action: 'reschedule',
      message: 'That time has already passed. Please choose a future time.',
      error: 'time_in_past',
    };
  }

  const originalDuration = existingAppointment.endTime.getTime() - existingAppointment.startTime.getTime();
  const newEndTime = new Date(newStartTime.getTime() + originalDuration);

  // Determine provider
  let providerId = existingAppointment.providerId;
  let providerNameForMessage = existingAppointment.provider.name;

  if (providerName) {
    const newProvider = await findProviderByName(providerName);
    if (!newProvider) {
      return {
        success: false,
        action: 'reschedule',
        message: `I couldn't find a provider named ${providerName}.`,
        error: 'provider_not_found',
      };
    }
    providerId = newProvider.id;
    providerNameForMessage = newProvider.name;
  }

  // Book new slot first
  const bookingResult = await bookAppointmentByDatetime(mrsAdapter, {
    patientId: existingAppointment.patientId,
    providerId,
    serviceId: existingAppointment.serviceId,
    startTime: newStartTime,
    endTime: newEndTime,
  });

  if (!bookingResult.success) {
    const suggestedAvailability = await getSuggestedAvailability();
    return {
      success: false,
      action: 'reschedule',
      message: `That time isn't available. ${suggestedAvailability.summary}`,
      error: bookingResult.error,
      suggestedAvailability,
    };
  }

  // Cancel old appointment
  await cancelAppointmentService(mrsAdapter, {
    appointmentId: existingAppointment.id,
    reason: 'Rescheduled',
  });

  const dateStr = formatDateForSpeech(newStartTime);
  const timeStr = formatTimeForSpeech(newStartTime);
  const isProviderKnown = !providerNameForMessage.toLowerCase().includes('unknown');

  return {
    success: true,
    action: 'reschedule',
    appointment: {
      id: bookingResult.appointmentId,
      date: dateStr,
      time: timeStr,
      provider: isProviderKnown ? providerNameForMessage : '',
      service: existingAppointment.service.name,
    },
    message: isProviderKnown
      ? `Moved appointment to ${dateStr} at ${timeStr} with ${providerNameForMessage}.`
      : `Moved appointment to ${dateStr} at ${timeStr}.`,
  };
}

// ============================================
// Helpers
// ============================================

async function getPatientFromConversation(callId?: string): Promise<string | null> {
  if (!callId) return null;
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: callId },
    select: { patientId: true },
  });
  return conversation?.patientId ?? null;
}

async function findDefaultService(): Promise<{ id: string; name: string; durationMinutes: number } | null> {
  const services = await prisma.appointmentType.findMany();
  if (services.length === 0) return null;

  const generalService = services.find(s =>
    s.name.toLowerCase().includes('general') ||
    s.name.toLowerCase().includes('checkup')
  );
  const service = generalService || services[0];
  return { ...service, durationMinutes: service.durationMinutes ?? 30 };
}

async function findProviderByName(name: string): Promise<{ id: string; name: string } | null> {
  const normalizedName = name.toLowerCase().trim();
  const providers = await prisma.provider.findMany({
    where: { scheduleTemplates: { some: {} } },
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

async function findAvailableProvider(
  startTime: Date,
  endTime: Date
): Promise<{ id: string; name: string } | null> {
  const providers = await prisma.provider.findMany({
    where: { scheduleTemplates: { some: {} } },
  });

  for (const provider of providers) {
    const available = await isWithinSchedule(startTime, endTime, provider.id);
    if (available) return provider;
  }
  return null;
}
