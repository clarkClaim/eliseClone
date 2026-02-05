// BookingService
// Datetime-based booking flow without slot dependency

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import type { MRSAppointment } from '../mrs/types.js';
import { isTimeAvailable, isWithinSchedule } from './availability-service.js';
import {
  MRSError,
  SlotConflictError,
  MRSValidationError,
  TimeoutError,
  MRSUnavailableError,
} from '../mrs/errors.js';

// ============================================
// Types
// ============================================

export interface DatetimeBookingRequest {
  patientId: string;
  providerId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  locationId?: string;
  reason?: string;
}

export interface BookingResult {
  success: boolean;
  appointmentId?: string;
  mrsId?: string;
  confirmation?: {
    date: string;
    time: string;
    provider: string;
    service: string;
    location?: string;
  };
  syncStatus: 'synced' | 'pending';
  message: string;
  error?: 'conflict' | 'outside_schedule' | 'mrs_unavailable' | 'validation_error';
}

export interface ConflictInfo {
  hasConflict: boolean;
  reason?: string;
}

// ============================================
// Conflict Detection
// ============================================

/**
 * Check for local conflicts using database query.
 * This is a fast local check before calling MRS.
 */
export async function checkLocalConflicts(
  startTime: Date,
  endTime: Date,
  providerId?: string,
  excludeAppointmentId?: string
): Promise<ConflictInfo> {
  const conflicting = await prisma.appointment.findFirst({
    where: {
      status: { notIn: ['cancelled', 'no_show'] },
      ...(providerId ? { providerId } : {}),
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      // Overlap condition
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (conflicting) {
    return {
      hasConflict: true,
      reason: 'Time slot conflicts with existing appointment',
    };
  }

  return { hasConflict: false };
}

// ============================================
// Datetime-Based Booking
// ============================================

/**
 * Book an appointment using datetime-based flow.
 * No slot ID required - uses direct start/end times.
 */
export async function bookAppointmentByDatetime(
  adapter: MRSAdapter | null,
  request: DatetimeBookingRequest
): Promise<BookingResult> {
  // Validate required fields
  if (!request.patientId || !request.providerId || !request.serviceId) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Missing required fields: patientId, providerId, and serviceId are required.',
      error: 'validation_error',
    };
  }

  // Get patient
  const patient = await prisma.patient.findUnique({
    where: { id: request.patientId },
  });

  if (!patient) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Patient not found.',
      error: 'validation_error',
    };
  }

  // Get provider
  const provider = await prisma.provider.findUnique({
    where: { id: request.providerId },
  });

  if (!provider) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Provider not found.',
      error: 'validation_error',
    };
  }

  // Get service (appointment type)
  const service = await prisma.appointmentType.findUnique({
    where: { id: request.serviceId },
  });

  if (!service) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Service not found.',
      error: 'validation_error',
    };
  }

  // Get location if specified
  const location = request.locationId
    ? await prisma.location.findUnique({ where: { id: request.locationId } })
    : null;

  // Check if time is within provider's schedule
  const withinSchedule = await isWithinSchedule(
    request.startTime,
    request.endTime,
    request.providerId
  );

  if (!withinSchedule) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'The requested time is outside the provider\'s available hours.',
      error: 'outside_schedule',
    };
  }

  // Check for local conflicts first (fast)
  const localConflict = await checkLocalConflicts(
    request.startTime,
    request.endTime,
    request.providerId
  );

  if (localConflict.hasConflict) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Sorry, that time is no longer available. Please choose another time.',
      error: 'conflict',
    };
  }

  // Check MRS availability if adapter is available
  if (adapter) {
    try {
      const healthCheck = await adapter.healthCheck();

      if (healthCheck.healthy) {
        // Check conflicts in MRS
        const mrsConflict = await adapter.checkConflicts({
          startDateTime: request.startTime,
          endDateTime: request.endTime,
          providerId: provider.mrsId,
        });

        if (mrsConflict.hasConflict) {
          return {
            success: false,
            syncStatus: 'synced',
            message: 'Sorry, that time was just taken. Please choose another time.',
            error: 'conflict',
          };
        }

        // Create appointment in MRS
        const mrsAppointment = await adapter.createAppointment({
          patientMrsId: patient.mrsId,
          providerId: provider.mrsId,
          serviceId: service.mrsId,
          startDateTime: request.startTime,
          endDateTime: request.endTime,
          locationId: location?.mrsId,
          reason: request.reason,
        });

        // Store locally with MRS sync complete
        const appointment = await prisma.appointment.create({
          data: {
            mrsId: mrsAppointment.mrsId,
            patientId: request.patientId,
            providerId: request.providerId,
            serviceId: request.serviceId,
            startTime: request.startTime,
            endTime: request.endTime,
            status: 'scheduled',
            reason: request.reason,
            bookedVia: 'voice',
            syncedToMrs: true,
            syncedToMrsAt: new Date(),
            mrsUpdatedAt: new Date(),
          },
        });

        return {
          success: true,
          appointmentId: appointment.id,
          mrsId: mrsAppointment.mrsId,
          confirmation: formatConfirmation(request, provider.name, service.name, location?.name),
          syncStatus: 'synced',
          message: formatSuccessMessage(request, provider.name),
        };
      }
    } catch (error) {
      // Handle MRS errors - distinguish between "unavailable" and "rejected"
      if (error instanceof SlotConflictError) {
        // Conflict detected during booking - do NOT fall back to local
        console.log(`[BookingService] MRS conflict error: ${error.message}`);
        return {
          success: false,
          syncStatus: 'synced',
          message: 'Sorry, that time was just taken. Please choose another time.',
          error: 'conflict',
        };
      }

      if (error instanceof MRSValidationError) {
        // MRS rejected the booking due to validation - do NOT fall back to local
        console.log(`[BookingService] MRS validation error: ${error.message}`);
        return {
          success: false,
          syncStatus: 'synced',
          message: 'There was a problem with that booking. Please try a different time.',
          error: 'validation_error',
        };
      }

      // For retryable errors (timeout, unavailable), fall back to local booking
      if (error instanceof TimeoutError || error instanceof MRSUnavailableError) {
        console.log(`[BookingService] MRS unavailable, falling back to local booking: ${error.message}`);
        // Fall through to local booking
      } else if (error instanceof MRSError && !error.retryable) {
        // Other non-retryable MRS errors - don't fall back to local
        console.log(`[BookingService] MRS non-retryable error: ${error.message}`);
        return {
          success: false,
          syncStatus: 'synced',
          message: 'Unable to complete the booking. Please try again or choose a different time.',
          error: 'validation_error',
        };
      } else {
        // Unknown error - log and fall back to local for resilience
        console.log(`[BookingService] MRS unknown error, falling back to local booking: ${error}`);
      }
    }
  }

  // MRS unavailable or not configured - book locally
  return bookLocally(request, patient, provider, service, location);
}

/**
 * Book locally when MRS is unavailable.
 * Creates appointment locally and queues for MRS sync.
 */
async function bookLocally(
  request: DatetimeBookingRequest,
  patient: { id: string; mrsId: string },
  provider: { id: string; name: string; mrsId: string },
  service: { id: string; name: string; mrsId: string },
  location: { id: string; name: string; mrsId: string } | null
): Promise<BookingResult> {
  console.log('[BookingService] Booking locally (MRS unavailable)');

  const appointment = await prisma.appointment.create({
    data: {
      patientId: request.patientId,
      providerId: request.providerId,
      serviceId: request.serviceId,
      startTime: request.startTime,
      endTime: request.endTime,
      status: 'scheduled',
      reason: request.reason,
      bookedVia: 'voice',
      syncedToMrs: false,
    },
  });

  // Queue for MRS push
  await prisma.job.create({
    data: {
      type: 'push_appointment_to_mrs',
      payload: { appointmentId: appointment.id },
      priority: 10,
      runAt: new Date(),
      maxAttempts: 5,
    },
  });

  return {
    success: true,
    appointmentId: appointment.id,
    confirmation: formatConfirmation(request, provider.name, service.name, location?.name),
    syncStatus: 'pending',
    message: `${formatSuccessMessage(request, provider.name)} You'll receive confirmation once our system syncs.`,
  };
}

// ============================================
// Helpers
// ============================================

function formatConfirmation(
  request: DatetimeBookingRequest,
  providerName: string,
  serviceName: string,
  locationName?: string
) {
  return {
    date: request.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    time: request.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
    provider: providerName,
    service: serviceName,
    location: locationName,
  };
}

function formatSuccessMessage(request: DatetimeBookingRequest, providerName: string): string {
  const dateStr = request.startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = request.startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `You're all set for ${dateStr} at ${timeStr} with ${providerName}!`;
}

// ============================================
// Cancellation
// ============================================

export interface CancellationRequest {
  appointmentId: string;
  reason?: string;
}

export interface CancellationResult {
  success: boolean;
  syncStatus: 'synced' | 'pending';
  message: string;
  error?: string;
}

/**
 * Cancel an appointment.
 */
export async function cancelAppointment(
  adapter: MRSAdapter | null,
  request: CancellationRequest
): Promise<CancellationResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: request.appointmentId },
  });

  if (!appointment) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Appointment not found.',
      error: 'Appointment not found',
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      success: true,
      syncStatus: 'synced',
      message: 'This appointment has already been cancelled.',
    };
  }

  // If not synced to MRS, just cancel locally
  if (!appointment.syncedToMrs || !appointment.mrsId) {
    await prisma.appointment.update({
      where: { id: request.appointmentId },
      data: {
        status: 'cancelled',
        cancelReason: request.reason,
      },
    });

    // Delete any pending push jobs for this appointment
    await prisma.job.deleteMany({
      where: {
        type: 'push_appointment_to_mrs',
        status: 'pending',
        payload: {
          path: ['appointmentId'],
          equals: request.appointmentId,
        },
      },
    });

    return {
      success: true,
      syncStatus: 'synced',
      message: 'Your appointment has been cancelled.',
    };
  }

  // Try to cancel in MRS
  if (adapter) {
    try {
      const healthCheck = await adapter.healthCheck();

      if (healthCheck.healthy) {
        await adapter.cancelAppointment(appointment.mrsId, request.reason);

        await prisma.appointment.update({
          where: { id: request.appointmentId },
          data: {
            status: 'cancelled',
            cancelReason: request.reason,
            syncedToMrsAt: new Date(),
          },
        });

        return {
          success: true,
          syncStatus: 'synced',
          message: 'Your appointment has been cancelled.',
        };
      }
    } catch (error) {
      console.log(`[BookingService] MRS cancellation failed, queuing for retry: ${error}`);
      // Fall through to local cancellation with push queue
    }
  }

  // MRS unavailable - cancel locally and queue for sync
  // Mark as unsynced so sync service doesn't overwrite this local change
  await prisma.appointment.update({
    where: { id: request.appointmentId },
    data: {
      status: 'cancelled',
      cancelReason: request.reason,
      syncedToMrs: false, // Mark as unsynced - local change pending push
    },
  });

  await prisma.job.create({
    data: {
      type: 'push_cancellation_to_mrs',
      payload: {
        appointmentId: request.appointmentId,
        mrsId: appointment.mrsId,
        reason: request.reason,
      },
      priority: 10,
      runAt: new Date(),
      maxAttempts: 5,
    },
  });

  return {
    success: true,
    syncStatus: 'pending',
    message: 'Your appointment has been cancelled. Confirmation pending system sync.',
  };
}
