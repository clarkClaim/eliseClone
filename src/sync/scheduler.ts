// Sync Scheduler
// Manages interval-based sync scheduling per entity type

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import { RateLimiter, calculateAdjustedInterval } from './rate-limiter.js';
import {
  syncPatients,
  syncProviders,
  syncLocations,
  syncAvailability,
  syncAppointments,
  syncAppointmentTypes,
} from './entities/index.js';
import type {
  EntityType,
  SyncSchedulerConfig,
  SyncResult,
  SyncPriority,
  JobType,
} from './types.js';
import { DEFAULT_SYNC_CONFIG } from './types.js';

const CONSECUTIVE_FAILURES_ALERT_THRESHOLD = 5;

interface ScheduledSync {
  entityType: EntityType;
  nextRunAt: Date;
  intervalMs: number;
  priority: SyncPriority;
  timerId?: NodeJS.Timeout;
}

export class SyncScheduler {
  private readonly adapter: MRSAdapter;
  private readonly config: SyncSchedulerConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly schedules: Map<EntityType, ScheduledSync> = new Map();
  private running = false;
  private fullSyncTimerId?: NodeJS.Timeout;

  constructor(adapter: MRSAdapter, config?: Partial<SyncSchedulerConfig>) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(adapter.capabilities.rateLimits);
  }

  /**
   * Start the sync scheduler.
   */
  start(): void {
    if (this.running) {
      console.log('[SyncScheduler] Already running');
      return;
    }

    console.log('[SyncScheduler] Starting...');
    this.running = true;

    for (const [entityType, scheduleConfig] of Object.entries(this.config.schedules)) {
      this.scheduleSync(entityType as EntityType, scheduleConfig.intervalMs, scheduleConfig.priority);
    }

    if (this.config.fullSyncTime) {
      this.scheduleFullSync();
    }

    console.log('[SyncScheduler] Started');
  }

  /**
   * Stop the sync scheduler.
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    console.log('[SyncScheduler] Stopping...');

    for (const schedule of this.schedules.values()) {
      if (schedule.timerId) {
        clearTimeout(schedule.timerId);
      }
    }
    this.schedules.clear();

    if (this.fullSyncTimerId) {
      clearTimeout(this.fullSyncTimerId);
    }

    this.running = false;
    console.log('[SyncScheduler] Stopped');
  }

  /**
   * Schedule a sync for an entity type.
   */
  private scheduleSync(entityType: EntityType, intervalMs: number, priority: SyncPriority): void {
    const adjustedInterval = calculateAdjustedInterval(
      intervalMs,
      this.rateLimiter.getState(),
      this.rateLimiter.isLowQuota()
    );

    const nextRunAt = new Date(Date.now() + adjustedInterval);

    const schedule: ScheduledSync = {
      entityType,
      nextRunAt,
      intervalMs: adjustedInterval,
      priority,
    };

    schedule.timerId = setTimeout(() => this.runSync(entityType), adjustedInterval);

    this.schedules.set(entityType, schedule);

    this.updateSyncStateNextRun(entityType, nextRunAt);
  }

  /**
   * Run sync for a specific entity type.
   */
  private async runSync(entityType: EntityType): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.rateLimiter.shouldWait()) {
      const waitTime = this.rateLimiter.getWaitTimeMs();
      console.log(`[SyncScheduler] Rate limited, waiting ${waitTime}ms before ${entityType} sync`);
      this.rescheduleSync(entityType, waitTime);
      return;
    }

    console.log(`[SyncScheduler] Running ${entityType} sync`);

    const result = await this.executeSyncForEntity(entityType);

    await this.updateSyncState(entityType, result);

    if (result.success) {
      this.rateLimiter.recordSuccess();
      console.log(`[SyncScheduler] ${entityType} sync complete: ${result.recordsProcessed} records`);
    } else {
      this.rateLimiter.recordFailure();
      console.error(`[SyncScheduler] ${entityType} sync failed: ${result.error}`);
    }

    await this.checkConsecutiveFailures(entityType);

    const baseInterval = this.config.schedules[entityType].intervalMs;
    this.scheduleSync(entityType, baseInterval, this.config.schedules[entityType].priority);
  }

  /**
   * Execute sync for a specific entity type.
   */
  private async executeSyncForEntity(entityType: EntityType): Promise<SyncResult> {
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
      case 'appointment_types':
        return syncAppointmentTypes(this.adapter);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Reschedule a sync after a delay.
   */
  private rescheduleSync(entityType: EntityType, delayMs: number): void {
    const schedule = this.schedules.get(entityType);
    if (!schedule) return;

    if (schedule.timerId) {
      clearTimeout(schedule.timerId);
    }

    schedule.nextRunAt = new Date(Date.now() + delayMs);
    schedule.timerId = setTimeout(() => this.runSync(entityType), delayMs);

    this.updateSyncStateNextRun(entityType, schedule.nextRunAt);
  }

  /**
   * Schedule the daily full sync.
   */
  private scheduleFullSync(): void {
    if (!this.config.fullSyncTime) return;

    const [hours, minutes] = this.config.fullSyncTime.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();

    this.fullSyncTimerId = setTimeout(async () => {
      console.log('[SyncScheduler] Running scheduled full sync');
      await this.triggerFullSync();
      this.scheduleFullSync();
    }, delayMs);

    console.log(`[SyncScheduler] Full sync scheduled for ${nextRun.toISOString()}`);
  }

  /**
   * Trigger a full sync of all entities.
   */
  async triggerFullSync(): Promise<void> {
    console.log('[SyncScheduler] Starting full sync');

    // Sync entities in dependency order: appointment_types and locations before appointments
    const entityOrder: EntityType[] = ['appointment_types', 'locations', 'providers', 'patients', 'availability', 'appointments'];

    for (const entityType of entityOrder) {
      const result = await this.executeSyncForEntity(entityType);
      await this.updateSyncState(entityType, result);

      if (!result.success) {
        console.error(`[SyncScheduler] Full sync failed at ${entityType}: ${result.error}`);
      }
    }

    console.log('[SyncScheduler] Full sync complete');
  }

  /**
   * Update sync state in the database.
   */
  private async updateSyncState(entityType: EntityType, result: SyncResult): Promise<void> {
    const currentState = await prisma.syncState.findUnique({
      where: { entityType },
    });

    const consecutiveFailures = result.success
      ? 0
      : (currentState?.consecutiveFailures ?? 0) + 1;

    await prisma.syncState.upsert({
      where: { entityType },
      create: {
        entityType,
        syncStatus: result.success ? 'idle' : 'failed',
        lastSyncAt: result.completedAt,
        lastSyncDuration: result.durationMs,
        recordsProcessed: result.recordsProcessed,
        consecutiveFailures,
        lastError: result.error ?? null,
      },
      update: {
        syncStatus: result.success ? 'idle' : 'failed',
        lastSyncAt: result.completedAt,
        lastSyncDuration: result.durationMs,
        recordsProcessed: result.recordsProcessed,
        consecutiveFailures,
        lastError: result.error ?? null,
      },
    });

    await this.rateLimiter.persistState(entityType);
  }

  /**
   * Update next sync time in the database.
   */
  private async updateSyncStateNextRun(entityType: EntityType, nextRunAt: Date): Promise<void> {
    await prisma.syncState.upsert({
      where: { entityType },
      create: {
        entityType,
        syncStatus: 'idle',
        nextSyncAt: nextRunAt,
      },
      update: {
        nextSyncAt: nextRunAt,
      },
    });
  }

  /**
   * Check consecutive failures and alert if threshold exceeded.
   */
  private async checkConsecutiveFailures(entityType: EntityType): Promise<void> {
    const state = await prisma.syncState.findUnique({
      where: { entityType },
    });

    if (state && state.consecutiveFailures >= CONSECUTIVE_FAILURES_ALERT_THRESHOLD) {
      console.warn(
        `[SyncScheduler] ALERT: ${entityType} sync has failed ${state.consecutiveFailures} consecutive times`
      );
    }
  }

  /**
   * Get status of all scheduled syncs.
   */
  getStatus(): { entityType: EntityType; nextRunAt: Date; intervalMs: number }[] {
    return Array.from(this.schedules.entries()).map(([entityType, schedule]) => ({
      entityType,
      nextRunAt: schedule.nextRunAt,
      intervalMs: schedule.intervalMs,
    }));
  }

  /**
   * Create a sync job in the database queue.
   */
  async createSyncJob(entityType: EntityType, priority: SyncPriority): Promise<string> {
    const jobType = `sync_${entityType}` as JobType;
    const priorityValue = priority === 'high' ? 10 : priority === 'medium' ? 5 : 1;

    const job = await prisma.job.create({
      data: {
        type: jobType,
        payload: { entityType },
        priority: priorityValue,
        runAt: new Date(),
      },
    });

    return job.id;
  }
}
