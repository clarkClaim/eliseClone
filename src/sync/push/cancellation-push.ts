// Cancellation Push Service
// Pushes appointment cancellations to MRS

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { NotFoundError } from '../../mrs/errors.js';
import { logConflict } from '../conflict-resolution.js';
import type { CancellationPushPayload } from '../types.js';

const BASE_BACKOFF_MS = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

export interface CancellationResult {
  success: boolean;
  appointmentId: string;
  error?: string;
}

/**
 * Push a cancellation to MRS.
 */
export async function pushCancellationToMRS(
  adapter: MRSAdapter,
  appointmentId: string,
  mrsId: string,
  reason?: string
): Promise<CancellationResult> {
  try {
    await adapter.cancelAppointment(mrsId, reason);

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        syncedToMrs: true,  // Mark as synced - push succeeded
        syncedToMrsAt: new Date(),
        lastSyncError: null,
      },
    });

    return {
      success: true,
      appointmentId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound = error instanceof NotFoundError;

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        lastSyncError: errorMessage,
      },
    });

    if (isNotFound) {
      await logConflict({
        entityType: 'appointments',
        entityId: appointmentId,
        mrsId,
        conflictType: 'deleted_in_mrs',
        localState: { status: 'cancelled', reason },
      }, `Cancellation push: appointment ${mrsId} not found in MRS (may have been deleted)`);

      return {
        success: true,
        appointmentId,
      };
    }

    return {
      success: false,
      appointmentId,
      error: errorMessage,
    };
  }
}

/**
 * Create a cancellation push job.
 */
export async function createCancellationPushJob(
  appointmentId: string,
  mrsId: string,
  reason?: string,
  options?: { priority?: number; runAt?: Date }
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type: 'push_cancellation_to_mrs',
      payload: { appointmentId, mrsId, reason } satisfies CancellationPushPayload,
      priority: options?.priority ?? 10, // High priority
      runAt: options?.runAt ?? new Date(),
      maxAttempts: MAX_ATTEMPTS,
    },
  });

  return job.id;
}

/**
 * Process pending cancellation push jobs.
 */
export async function processCancellationJobs(adapter: MRSAdapter, limit = 10): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: {
      type: 'push_cancellation_to_mrs',
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

    const payload = job.payload as unknown as CancellationPushPayload;
    const result = await pushCancellationToMRS(
      adapter,
      payload.appointmentId,
      payload.mrsId,
      payload.reason
    );

    if (result.success) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    } else if (job.attempts + 1 >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          lastError: result.error,
        },
      });
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
