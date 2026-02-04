// Sync Metrics
// Logging and observability for sync and push operations

import { prisma } from '../db/client.js';
import type { SyncResult, EntityType } from './types.js';

export interface SyncMetrics {
  entityType: EntityType;
  durationMs: number;
  recordsProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface PushMetrics {
  appointmentId: string;
  operation: 'push' | 'cancel';
  success: boolean;
  isConflict: boolean;
  retryCount: number;
  durationMs: number;
  error?: string;
  timestamp: Date;
}

/**
 * Log sync metrics.
 */
export function logSyncMetrics(result: SyncResult): void {
  const level = result.success ? 'info' : 'error';
  const metrics: SyncMetrics = {
    entityType: result.entityType,
    durationMs: result.durationMs,
    recordsProcessed: result.recordsProcessed,
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
    conflicts: result.conflicts,
    success: result.success,
    error: result.error,
    timestamp: result.completedAt,
  };

  console.log(`[SyncMetrics] [${level.toUpperCase()}]`, JSON.stringify(metrics));
}

/**
 * Log push metrics.
 */
export function logPushMetrics(metrics: PushMetrics): void {
  const level = metrics.success ? 'info' : 'error';
  console.log(`[PushMetrics] [${level.toUpperCase()}]`, JSON.stringify(metrics));
}

/**
 * Get sync health status for all entity types.
 */
export async function getSyncHealth(): Promise<{
  entities: Record<EntityType, {
    lastSyncAt: Date | null;
    nextSyncAt: Date | null;
    status: string;
    consecutiveFailures: number;
    isHealthy: boolean;
  }>;
  overallHealthy: boolean;
}> {
  const states = await prisma.syncState.findMany();
  const FAILURE_THRESHOLD = 5;

  const entities: Record<string, {
    lastSyncAt: Date | null;
    nextSyncAt: Date | null;
    status: string;
    consecutiveFailures: number;
    isHealthy: boolean;
  }> = {};

  let overallHealthy = true;

  const entityTypes: EntityType[] = ['patients', 'providers', 'locations', 'availability', 'appointments'];

  for (const entityType of entityTypes) {
    const state = states.find(s => s.entityType === entityType);

    if (state) {
      const isHealthy = state.consecutiveFailures < FAILURE_THRESHOLD;
      entities[entityType] = {
        lastSyncAt: state.lastSyncAt,
        nextSyncAt: state.nextSyncAt,
        status: state.syncStatus,
        consecutiveFailures: state.consecutiveFailures,
        isHealthy,
      };
      if (!isHealthy) overallHealthy = false;
    } else {
      entities[entityType] = {
        lastSyncAt: null,
        nextSyncAt: null,
        status: 'never_run',
        consecutiveFailures: 0,
        isHealthy: true,
      };
    }
  }

  return {
    entities: entities as Record<EntityType, typeof entities[string]>,
    overallHealthy,
  };
}

/**
 * Get push job statistics.
 */
export async function getPushStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgRetries: number;
}> {
  const stats = await prisma.job.groupBy({
    by: ['status'],
    where: {
      type: { in: ['push_appointment_to_mrs', 'push_cancellation_to_mrs'] },
    },
    _count: true,
    _avg: { attempts: true },
  });

  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    avgRetries: 0,
  };

  let totalJobs = 0;
  let totalAttempts = 0;

  for (const stat of stats) {
    result[stat.status as keyof typeof result] = stat._count;
    totalJobs += stat._count;
    totalAttempts += (stat._avg.attempts ?? 0) * stat._count;
  }

  result.avgRetries = totalJobs > 0 ? totalAttempts / totalJobs : 0;

  return result;
}

/**
 * Alert for consecutive sync failures.
 */
export async function checkAndAlertFailures(threshold = 5): Promise<string[]> {
  const states = await prisma.syncState.findMany({
    where: {
      consecutiveFailures: { gte: threshold },
    },
  });

  const alerts: string[] = [];

  for (const state of states) {
    const message = `ALERT: ${state.entityType} sync has failed ${state.consecutiveFailures} consecutive times. Last error: ${state.lastError ?? 'Unknown'}`;
    console.warn(`[SyncAlert] ${message}`);
    alerts.push(message);
  }

  return alerts;
}
