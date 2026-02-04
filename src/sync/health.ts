// Health Check Endpoint
// Provides MRS connection status and sync health

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import { getSyncHealth, getPushStats } from './metrics.js';

export interface MRSHealthStatus {
  connected: boolean;
  healthy: boolean;
  latencyMs: number;
  lastCheckAt: Date;
  systemType: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  mrs: MRSHealthStatus;
  sync: {
    overallHealthy: boolean;
    entities: Record<string, {
      lastSyncAt: Date | null;
      status: string;
      consecutiveFailures: number;
      isHealthy: boolean;
    }>;
  };
  push: {
    pending: number;
    failed: number;
    avgRetries: number;
  };
  timestamp: Date;
}

/**
 * Get comprehensive health check for MRS connection and sync status.
 */
export async function getHealthStatus(adapter: MRSAdapter): Promise<HealthCheckResponse> {
  const healthCheck = await adapter.healthCheck();

  await updateMrsConfigHealth(adapter.systemType, healthCheck.healthy, healthCheck.latencyMs);

  const syncHealth = await getSyncHealth();

  const pushStats = await getPushStats();

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (healthCheck.healthy && syncHealth.overallHealthy && pushStats.failed === 0) {
    status = 'healthy';
  } else if (healthCheck.healthy && (syncHealth.overallHealthy || pushStats.failed < 10)) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    mrs: {
      connected: healthCheck.healthy,
      healthy: healthCheck.healthy,
      latencyMs: healthCheck.latencyMs,
      lastCheckAt: new Date(),
      systemType: adapter.systemType,
    },
    sync: {
      overallHealthy: syncHealth.overallHealthy,
      entities: syncHealth.entities,
    },
    push: {
      pending: pushStats.pending,
      failed: pushStats.failed,
      avgRetries: pushStats.avgRetries,
    },
    timestamp: new Date(),
  };
}

/**
 * Update MRS config with health check results.
 */
async function updateMrsConfigHealth(
  systemType: string,
  isHealthy: boolean,
  latencyMs: number
): Promise<void> {
  const config = await prisma.mrsConfig.findFirst({
    where: { systemType: systemType as 'openmrs' },
  });

  if (config) {
    const existingLatency = config.avgLatencyMs ?? latencyMs;
    const newAvgLatency = Math.round((existingLatency * 0.7) + (latencyMs * 0.3));

    await prisma.mrsConfig.update({
      where: { id: config.id },
      data: {
        lastHealthCheckAt: new Date(),
        isHealthy,
        avgLatencyMs: newAvgLatency,
      },
    });
  }
}

/**
 * Quick health check - just MRS connectivity.
 */
export async function quickHealthCheck(adapter: MRSAdapter): Promise<{
  healthy: boolean;
  latencyMs: number;
}> {
  return adapter.healthCheck();
}

/**
 * Check if MRS is in a degraded state (recently unhealthy).
 */
export async function isMRSDegraded(): Promise<boolean> {
  const config = await prisma.mrsConfig.findFirst({
    where: { systemType: 'openmrs' },
  });

  if (!config) {
    return false;
  }

  return !config.isHealthy;
}
