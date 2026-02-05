// Appointment Push Service
// Pushes locally-created appointments to MRS

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { SlotConflictError, MRSError } from '../../mrs/errors.js';
import { logConflict } from '../conflict-resolution.js';
import type { PushJobPayload } from '../types.js';

const BASE_BACKOFF_MS = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

/** Extended payload with idempotency key for push jobs */
interface ExtendedPushJobPayload extends PushJobPayload {
  idempotencyKey?: string;
}

export interface PushResult {
  success: boolean;
  appointmentId: string;
  mrsId?: string;
  error?: string;
  isConflict?: boolean;
}

/**
 * Push a local appointment to MRS.
 * @param adapter - The MRS adapter to use
 * @param appointmentId - The local appointment ID to push
 * @param idempotencyKey - Optional idempotency key for duplicate detection
 * @param jobId - Optional job ID to update atomically with appointment on success
 */
export async function pushAppointmentToMRS(
  adapter: MRSAdapter,
  appointmentId: string,
  idempotencyKey?: string,
  jobId?: string
): Promise<PushResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      slot: {
        include: {
          provider: true,
          appointmentType: true,
          location: true,
        },
      },
    },
  });

  if (!appointment) {
    return {
      success: false,
      appointmentId,
      error: 'Appointment not found',
    };
  }

  if (appointment.syncedToMrs) {
    return {
      success: true,
      appointmentId,
      mrsId: appointment.mrsId ?? undefined,
    };
  }

  // Slot is optional - check if we have direct time fields or slot
  if (!appointment.slot) {
    // Datetime-based booking - use direct fields
    if (!appointment.serviceId) {
      return {
        success: false,
        appointmentId,
        error: 'Service ID not set - cannot push to Bahmni',
      };
    }

    // Look up service mrsId
    const service = appointment.serviceId
      ? await prisma.appointmentType.findUnique({ where: { id: appointment.serviceId } })
      : null;
    const provider = appointment.providerId
      ? await prisma.provider.findUnique({ where: { id: appointment.providerId } })
      : null;

    if (!service?.mrsId) {
      return {
        success: false,
        appointmentId,
        error: 'Service not found or has no MRS ID - cannot push to Bahmni',
      };
    }

    try {
      if (!appointment.patient.mrsId) {
        return {
          success: false,
          appointmentId,
          error: 'Patient not synced to MRS - cannot push',
        };
      }

      const mrsAppointment = await adapter.createAppointment({
        patientMrsId: appointment.patient.mrsId,
        providerId: provider?.mrsId ?? undefined,
        serviceId: service.mrsId,
        startDateTime: appointment.startTime,
        endDateTime: appointment.endTime,
        reason: appointment.reason ?? undefined,
        idempotencyKey,
      });

      // Update appointment and job in a transaction for consistency
      if (jobId) {
        await prisma.$transaction([
          prisma.appointment.update({
            where: { id: appointmentId },
            data: {
              mrsId: mrsAppointment.mrsId,
              syncedToMrs: true,
              syncedToMrsAt: new Date(),
              lastSyncError: null,
              syncAttempts: appointment.syncAttempts + 1,
            },
          }),
          prisma.job.update({
            where: { id: jobId },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          }),
        ]);
      } else {
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: {
            mrsId: mrsAppointment.mrsId,
            syncedToMrs: true,
            syncedToMrsAt: new Date(),
            lastSyncError: null,
            syncAttempts: appointment.syncAttempts + 1,
          },
        });
      }

      return {
        success: true,
        appointmentId,
        mrsId: mrsAppointment.mrsId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isConflict = error instanceof SlotConflictError;

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          lastSyncError: errorMessage,
          syncAttempts: appointment.syncAttempts + 1,
        },
      });

      return {
        success: false,
        appointmentId,
        error: errorMessage,
        isConflict,
      };
    }
  }

  // Legacy slot-based booking
  // Bahmni requires service (appointment type) for booking
  if (!appointment.slot.appointmentType?.mrsId) {
    return {
      success: false,
      appointmentId,
      error: 'Appointment type (service) not set - cannot push to Bahmni',
    };
  }

  try {
    if (!appointment.patient.mrsId) {
      return {
        success: false,
        appointmentId,
        error: 'Patient not synced to MRS - cannot push',
      };
    }

    const mrsAppointment = await adapter.createAppointment({
      patientMrsId: appointment.patient.mrsId,
      providerId: appointment.slot.provider.mrsId ?? undefined,
      serviceId: appointment.slot.appointmentType.mrsId,
      startDateTime: appointment.slot.startTime,
      endDateTime: appointment.slot.endTime,
      locationId: appointment.slot.location?.mrsId ?? undefined,
      reason: appointment.reason ?? undefined,
      idempotencyKey,
    });

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        mrsId: mrsAppointment.mrsId,
        syncedToMrs: true,
        syncedToMrsAt: new Date(),
        lastSyncError: null,
        syncAttempts: appointment.syncAttempts + 1,
      },
    });

    return {
      success: true,
      appointmentId,
      mrsId: mrsAppointment.mrsId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isConflict = error instanceof SlotConflictError;

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        lastSyncError: errorMessage,
        syncAttempts: appointment.syncAttempts + 1,
      },
    });

    if (isConflict) {
      await logConflict({
        entityType: 'appointments',
        entityId: appointmentId,
        conflictType: 'external_booking',
        localState: appointment as object,
      }, `Push failed: slot ${appointment.slot?.mrsId ?? 'N/A'} was booked in MRS`);
    }

    return {
      success: false,
      appointmentId,
      error: errorMessage,
      isConflict,
    };
  }
}

/**
 * Generate an idempotency key for an appointment push.
 * Format: push_appt_{appointmentId}_{timestamp}
 * This ensures that retries of the same job don't create duplicates,
 * but a new push job for the same appointment can be created.
 */
export function generateIdempotencyKey(appointmentId: string): string {
  return `push_appt_${appointmentId}_${Date.now()}`;
}

/**
 * Create a push job for an appointment.
 * Includes an idempotency key to prevent duplicate appointments on retry.
 */
export async function createPushJob(
  appointmentId: string,
  options?: { priority?: number; runAt?: Date }
): Promise<string> {
  const idempotencyKey = generateIdempotencyKey(appointmentId);

  const job = await prisma.job.create({
    data: {
      type: 'push_appointment_to_mrs',
      payload: { appointmentId } satisfies PushJobPayload,
      priority: options?.priority ?? 10, // High priority
      runAt: options?.runAt ?? new Date(),
      maxAttempts: MAX_ATTEMPTS,
      idempotencyKey,
    },
  });

  return job.id;
}

/**
 * Process pending appointment push jobs.
 */
export async function processPushJobs(adapter: MRSAdapter, limit = 10): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: {
      type: 'push_appointment_to_mrs',
      status: 'pending',
      runAt: { lte: new Date() },
    },
    orderBy: [
      { priority: 'desc' },
      { runAt: 'asc' },
    ],
    take: limit,
  });

  let processed = 0;

  for (const job of jobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
        attempts: job.attempts + 1,
      },
    });

    const payload = job.payload as unknown as ExtendedPushJobPayload;
    // Pass the idempotency key and job ID for transactional update on success
    const result = await pushAppointmentToMRS(
      adapter,
      payload.appointmentId,
      job.idempotencyKey ?? undefined,
      job.id // Job ID for transactional update
    );

    // On success, the job was already updated in the transaction within pushAppointmentToMRS
    if (result.success) {
      // Job already marked as completed in transaction
    } else if (result.isConflict || job.attempts + 1 >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          lastError: result.error,
        },
      });

      if (result.isConflict) {
        console.warn(`[PushService] Appointment ${payload.appointmentId} push failed due to conflict`);
      }
    } else {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, job.attempts);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          lastError: result.error,
          backoffExponent: job.attempts + 1,
          nextRetryAt,
          runAt: nextRetryAt,
        },
      });
    }

    processed++;
  }

  return processed;
}
