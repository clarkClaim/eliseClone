// Startup Sync
// Performs blocking initial sync of essential entities before accepting requests

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import {
  syncAppointmentTypes,
  syncLocations,
  syncProviders,
  syncPatients,
  syncAppointments,
} from './entities/index.js';
import type { EntityType, SyncResult } from './types.js';

/** Default startup timeout: 5 minutes */
const DEFAULT_STARTUP_TIMEOUT_MS = 5 * 60 * 1000;

/** Server readiness state - shared across modules */
export interface ServerReadiness {
  ready: boolean;
  degraded: boolean;
  degradedReason?: string;
  initialSyncComplete: boolean;
  initialSyncStartedAt?: Date;
  initialSyncCompletedAt?: Date;
}

// Global readiness state
let readinessState: ServerReadiness = {
  ready: false,
  degraded: false,
  initialSyncComplete: false,
};

/**
 * Get current server readiness state
 */
export function getReadinessState(): ServerReadiness {
  return { ...readinessState };
}

/**
 * Set server to degraded mode
 */
export function setDegradedMode(reason: string): void {
  readinessState.degraded = true;
  readinessState.degradedReason = reason;
  readinessState.ready = true; // Can still handle requests in degraded mode
  console.warn(`[Startup] Server entering degraded mode: ${reason}`);
}

/**
 * Set server ready state
 */
export function setReady(ready: boolean): void {
  readinessState.ready = ready;
}

/**
 * Set server ready and degraded state (for testing)
 */
export function setReadyState(ready: boolean, degraded: boolean, reason?: string): void {
  readinessState.ready = ready;
  readinessState.degraded = degraded;
  readinessState.degradedReason = reason;
}

export interface InitialSyncOptions {
  /** Timeout in milliseconds before entering degraded mode (default: 5 minutes) */
  timeoutMs?: number;
  /** Skip validation of essential data (for testing) */
  skipValidation?: boolean;
}

export interface InitialSyncResult {
  success: boolean;
  degraded: boolean;
  degradedReason?: string;
  durationMs: number;
  entityResults: Record<EntityType, SyncResult | null>;
  validationErrors?: string[];
}

/**
 * Perform blocking initial sync of all essential entities.
 * Must complete before the server starts accepting VAPI requests.
 *
 * Sync order (respecting dependencies):
 * 1. Appointment types (services) - needed for appointment matching
 * 2. Locations - needed for availability
 * 3. Providers - needed for scheduling
 * 4. Patients (known patients only)
 * 5. Appointments
 *
 * @param adapter - The MRS adapter to use for sync
 * @param options - Configuration options
 * @returns Result of the initial sync operation
 */
export async function initialSync(
  adapter: MRSAdapter,
  options: InitialSyncOptions = {}
): Promise<InitialSyncResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const startTime = Date.now();

  readinessState.initialSyncStartedAt = new Date();
  readinessState.initialSyncComplete = false;
  readinessState.ready = false;
  readinessState.degraded = false;

  console.log('[Startup] Beginning initial sync...');

  const entityResults: Record<EntityType, SyncResult | null> = {
    appointment_types: null,
    locations: null,
    providers: null,
    patients: null,
    availability: null,
    appointments: null,
  };

  // Entity sync order (dependencies first)
  const syncOrder: Array<{ type: EntityType; fn: (a: MRSAdapter) => Promise<SyncResult> }> = [
    { type: 'appointment_types', fn: syncAppointmentTypes },
    { type: 'locations', fn: syncLocations },
    { type: 'providers', fn: syncProviders },
    { type: 'patients', fn: syncPatients },
    { type: 'appointments', fn: syncAppointments },
  ];

  let timedOut = false;

  for (const { type, fn } of syncOrder) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      timedOut = true;
      console.warn(`[Startup] Timeout exceeded at ${type} sync`);
      break;
    }

    console.log(`[Startup] Syncing ${type}...`);

    try {
      const result = await fn(adapter);
      entityResults[type] = result;

      if (result.success) {
        console.log(`[Startup] ${type} sync complete: ${result.recordsProcessed} records in ${result.durationMs}ms`);
      } else {
        console.error(`[Startup] ${type} sync failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[Startup] ${type} sync threw error:`, error);
      entityResults[type] = {
        entityType: type,
        success: false,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        recordsProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        conflicts: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  const durationMs = Date.now() - startTime;

  // Handle timeout - enter degraded mode
  if (timedOut) {
    setDegradedMode(`Initial sync timeout exceeded (${timeoutMs}ms)`);
    readinessState.initialSyncCompletedAt = new Date();

    return {
      success: false,
      degraded: true,
      degradedReason: `Initial sync timeout exceeded after ${durationMs}ms`,
      durationMs,
      entityResults,
    };
  }

  // Validate essential data unless skipped
  if (!options.skipValidation) {
    const validationResult = await validateEssentialData();

    // Log warnings (non-fatal issues)
    if (validationResult.warnings.length > 0) {
      console.warn('[Startup] Validation warnings:');
      for (const warning of validationResult.warnings) {
        console.warn(`  - ${warning}`);
      }
    }

    if (!validationResult.valid) {
      console.error('[Startup] Essential data validation failed:');
      for (const error of validationResult.errors) {
        console.error(`  - ${error}`);
      }

      readinessState.initialSyncComplete = true;
      readinessState.initialSyncCompletedAt = new Date();

      return {
        success: false,
        degraded: false,
        durationMs,
        entityResults,
        validationErrors: validationResult.errors,
      };
    }
  }

  // Success!
  readinessState.initialSyncComplete = true;
  readinessState.initialSyncCompletedAt = new Date();
  readinessState.ready = true;

  console.log(`[Startup] Initial sync complete in ${durationMs}ms`);

  return {
    success: true,
    degraded: false,
    durationMs,
    entityResults,
  };
}

/**
 * Validate that essential data exists for the system to function.
 * Required: at least one provider, one service, one location.
 *
 * Schedule templates are checked but only logged as a warning since
 * they may need to be created after initial sync.
 */
export async function validateEssentialData(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for providers
  const totalProviders = await prisma.provider.count();
  if (totalProviders === 0) {
    errors.push('No providers found. At least one provider is required.');
  } else {
    // Check if any providers have schedule templates (warning only)
    const providersWithSchedules = await prisma.provider.count({
      where: {
        scheduleTemplates: {
          some: {},
        },
      },
    });

    if (providersWithSchedules === 0) {
      warnings.push(
        `Found ${totalProviders} providers but none have schedule templates configured. ` +
        'Run "pnpm run setup:availability --create" to create default schedules.'
      );
    }
  }

  // Check for appointment types (services)
  const appointmentTypesCount = await prisma.appointmentType.count();
  if (appointmentTypesCount === 0) {
    errors.push('No appointment types (services) found. At least one service is required.');
  }

  // Check for locations
  const locationsCount = await prisma.location.count();
  if (locationsCount === 0) {
    errors.push('No locations found. At least one location is required.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get sync status for all entity types (for health endpoint)
 */
export async function getSyncStatus(): Promise<Record<string, { count: number; lastSync: Date | null }>> {
  const entities = ['appointment_types', 'locations', 'providers', 'patients', 'appointments'];
  const status: Record<string, { count: number; lastSync: Date | null }> = {};

  for (const entityType of entities) {
    const syncState = await prisma.syncState.findUnique({
      where: { entityType },
    });

    // Get entity count
    let count = 0;
    switch (entityType) {
      case 'appointment_types':
        count = await prisma.appointmentType.count();
        break;
      case 'locations':
        count = await prisma.location.count();
        break;
      case 'providers':
        count = await prisma.provider.count();
        break;
      case 'patients':
        count = await prisma.patient.count();
        break;
      case 'appointments':
        count = await prisma.appointment.count();
        break;
    }

    status[entityType] = {
      count,
      lastSync: syncState?.lastSyncAt ?? null,
    };
  }

  return status;
}
