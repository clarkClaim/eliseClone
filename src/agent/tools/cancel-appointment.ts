import { prisma } from '../../db/client.js';
import { cancelAppointment as cancelAppointmentService } from '../../scheduling/index.js';
import { formatTimeForSpeech, formatDateForSpeech } from '../../utils/date.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { getSuggestedAvailability, type SuggestedAvailability } from './suggested-availability.js';

export interface CancelAppointmentParams {
  appointmentId: string; // ID of the appointment to cancel
  reason?: string; // Optional cancellation reason
}

export interface CancelAppointmentResult {
  success: boolean;
  message: string;
  error?: string;
  /** Pre-fetched availability so assistant can offer to rebook */
  suggestedAvailability?: SuggestedAvailability;
}

// MRS adapter instance - can be set by the server
let mrsAdapter: MRSAdapter | null = null;

export function setMRSAdapterForCancel(adapter: MRSAdapter | null): void {
  mrsAdapter = adapter;
}

export async function cancelAppointmentTool(
  params: CancelAppointmentParams,
  _callId?: string
): Promise<CancelAppointmentResult> {
  const { appointmentId, reason } = params;

  // Get appointment details for the confirmation message
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      provider: true,
      service: true,
    },
  });

  if (!appointment || !appointment.provider) {
    return {
      success: false,
      message: "I couldn't find that appointment. Could you tell me which appointment you'd like to cancel?",
      error: 'appointment_not_found',
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      success: true,
      message: 'That appointment has already been cancelled. Is there anything else I can help you with?',
    };
  }

  // Cancel the appointment
  const result = await cancelAppointmentService(mrsAdapter, {
    appointmentId,
    reason: reason || 'Patient requested cancellation',
  });

  if (!result.success) {
    return {
      success: false,
      message: 'I had trouble cancelling that appointment. Would you like me to try again?',
      error: result.error,
    };
  }

  // Format a helpful confirmation message
  const dateStr = formatDateForSpeech(appointment.startTime);
  const timeStr = formatTimeForSpeech(appointment.startTime);

  // Check if provider name is known
  const providerNameLower = appointment.provider.name.toLowerCase();
  const isProviderKnown = !providerNameLower.includes('unknown') && !providerNameLower.includes('placeholder');

  // Get availability so assistant can offer to rebook
  const suggestedAvailability = await getSuggestedAvailability();

  const confirmationMessage = isProviderKnown
    ? `I've cancelled your appointment on ${dateStr} at ${timeStr} with ${appointment.provider.name}. Would you like to schedule a different appointment?`
    : `I've cancelled your appointment on ${dateStr} at ${timeStr}. Would you like to schedule a different appointment?`;

  return {
    success: true,
    message: confirmationMessage,
    suggestedAvailability,
  };
}
