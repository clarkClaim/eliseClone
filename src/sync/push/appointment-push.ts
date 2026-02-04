// Appointment Push Service
// Pushes locally-created appointments to MRS

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { SlotConflictError, MRSError } from '../../mrs/errors.js';
import { logConflict } from '../conflict-resolution.js';
import type { PushJobPayload } from '../types.js';

const BASE_BACKOFF_MS = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

export interface PushResult {
  success: boolean;
  appointmentId: string;
  mrsId?: string;
  error?: string;
  isConflict?: boolean;
}

/**
 * Push a local appointment to MRS.
 */
export async function pushAppointmentToMRS(
  adapter: MRSAdapter,
  appointmentId: string
): Promise<PushResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      slot: {
        include: {
          provider: true,
          appointmentType: true,
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

  if (!appointment.slot.mrsId) {
    return {
      success: false,
      appointmentId,
      error: 'Slot has no MRS ID - cannot push',
    };
  }

  try {
    const mrsAppointment = await adapter.createAppointment({
      patientMrsId: appointment.patient.mrsId,
      providerMrsId: appointment.slot.provider.mrsId,
      slotMrsId: appointment.slot.mrsId,
      appointmentTypeMrsId: appointment.slot.appointmentType?.mrsId,
      reason: appointment.reason ?? undefined,
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
      }, `Push failed: slot ${appointment.slot.mrsId} was booked in MRS`);
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
 * Create a push job for an appointment.
 */
export async function createPushJob(
  appointmentId: string,
  options?: { priority?: number; runAt?: Date }
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type: 'push_appointment_to_mrs',
      payload: { appointmentId } satisfies PushJobPayload,
      priority: options?.priority ?? 10, // High priority
      runAt: options?.runAt ?? new Date(),
      maxAttempts: MAX_ATTEMPTS,
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

    const payload = job.payload as PushJobPayload;
    const result = await pushAppointmentToMRS(adapter, payload.appointmentId);

    if (result.success) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
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
