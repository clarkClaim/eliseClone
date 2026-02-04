// Sync Job Handler
// Processes sync jobs from the job queue

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import {
  syncPatients,
  syncProviders,
  syncLocations,
  syncAvailability,
  syncAppointments,
} from '../entities/index.js';
import type { EntityType, SyncResult, SyncJobPayload } from '../types.js';

const BASE_BACKOFF_MS = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

export class SyncJobHandler {
  private readonly adapter: MRSAdapter;

  constructor(adapter: MRSAdapter) {
    this.adapter = adapter;
  }

  /**
   * Process a sync job from the queue.
   */
  async processJob(jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      console.error(`[SyncJobHandler] Job ${jobId} not found`);
      return;
    }

    if (job.status !== 'pending') {
      console.log(`[SyncJobHandler] Job ${jobId} not pending (status: ${job.status})`);
      return;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        attempts: job.attempts + 1,
      },
    });

    try {
      const payload = job.payload as SyncJobPayload;
      const result = await this.executeSyncJob(payload.entityType);

      if (result.success) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            lastError: null,
          },
        });
        console.log(`[SyncJobHandler] Job ${jobId} completed: ${result.recordsProcessed} records`);
      } else {
        await this.handleJobFailure(jobId, job.attempts + 1, result.error ?? 'Unknown error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.handleJobFailure(jobId, job.attempts + 1, errorMessage);
    }
  }

  /**
   * Execute the sync for a specific entity type.
   */
  private async executeSyncJob(entityType: EntityType): Promise<SyncResult> {
    switch (entityType) {
      case 'patients':
        return syncPatients(this.adapter);
      case 'providers':
        return syncProviders(this.adapter);
      case 'locations':
        return syncLocations(this.adapter);
      case 'availability':
        return syncAvailability(this.adapter);
      case 'appointments':
        return syncAppointments(this.adapter);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Handle a job failure with retry logic.
   */
  private async handleJobFailure(jobId: string, attempts: number, errorMessage: string): Promise<void> {
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          lastError: errorMessage,
        },
      });
      console.error(`[SyncJobHandler] Job ${jobId} failed permanently after ${attempts} attempts: ${errorMessage}`);
      return;
    }

    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        lastError: errorMessage,
        backoffExponent: attempts,
        nextRetryAt,
        runAt: nextRetryAt,
      },
    });

    console.warn(`[SyncJobHandler] Job ${jobId} failed, retry scheduled for ${nextRetryAt.toISOString()}`);
  }

  /**
   * Fetch and process the next pending sync job.
   */
  async processNextJob(): Promise<boolean> {
    const job = await prisma.job.findFirst({
      where: {
        status: 'pending',
        type: { startsWith: 'sync_' },
        runAt: { lte: new Date() },
      },
      orderBy: [
        { priority: 'desc' },
        { runAt: 'asc' },
      ],
    });

    if (!job) {
      return false;
    }

    await this.processJob(job.id);
    return true;
  }

  /**
   * Start a job processing loop.
   */
  async startProcessingLoop(intervalMs = 5000): Promise<NodeJS.Timeout> {
    const process = async () => {
      try {
        await this.processNextJob();
      } catch (error) {
        console.error('[SyncJobHandler] Error in processing loop:', error);
      }
    };

    await process();
    return setInterval(process, intervalMs);
  }
}

/**
 * Create a sync job for an entity type.
 */
export async function createSyncJob(
  entityType: EntityType,
  options?: {
    priority?: number;
    runAt?: Date;
    fullSync?: boolean;
  }
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type: `sync_${entityType}`,
      payload: { entityType, fullSync: options?.fullSync ?? false },
      priority: options?.priority ?? 5,
      runAt: options?.runAt ?? new Date(),
    },
  });

  return job.id;
}
