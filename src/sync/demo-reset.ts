// Demo Reset Detection
// Detects when the OpenMRS demo instance resets and handles gracefully

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import type { EntityType } from './types.js';

const RESET_THRESHOLD_PERCENTAGE = 0.5; // 50% drop indicates reset
const RECENT_BOOKINGS_WINDOW_HOURS = 24;

export interface ResetDetectionResult {
  detected: boolean;
  affectedEntities: EntityType[];
  previousCounts: Record<string, number>;
  currentCounts: Record<string, number>;
}

export interface ResetHandlingResult {
  handled: boolean;
  entitiesSynced: EntityType[];
  recentBookingsFlagged: number;
  message: string;
}

/**
 * Detect if the demo instance has been reset.
 * A reset is detected when multiple entity types show > 50% record count drop.
 */
export async function detectDemoReset(
  adapter: MRSAdapter,
  previousCounts: Record<EntityType, number>
): Promise<ResetDetectionResult> {
  const currentCounts: Record<string, number> = {};
  const affectedEntities: EntityType[] = [];

  try {
    const providers = await adapter.getProviders();
    currentCounts.providers = providers.length;

    const patients = await adapter.getPatients({ limit: 1000 });
    currentCounts.patients = patients.length;

    const availability = await adapter.getAvailability({
      start: new Date(),
      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    currentCounts.availability = availability.length;

    for (const entityType of ['providers', 'patients', 'availability'] as EntityType[]) {
      const prev = previousCounts[entityType] ?? 0;
      const curr = currentCounts[entityType] ?? 0;

      if (prev > 0 && curr < prev * RESET_THRESHOLD_PERCENTAGE) {
        affectedEntities.push(entityType);
      }
    }

    const detected = affectedEntities.length >= 2;

    if (detected) {
      console.warn(`[DemoReset] Demo reset detected! Affected entities: ${affectedEntities.join(', ')}`);
    }

    return {
      detected,
      affectedEntities,
      previousCounts,
      currentCounts,
    };
  } catch (error) {
    console.error('[DemoReset] Error during reset detection:', error);
    return {
      detected: false,
      affectedEntities: [],
      previousCounts,
      currentCounts,
    };
  }
}

/**
 * Get current record counts from the database.
 */
export async function getCurrentRecordCounts(): Promise<Record<EntityType, number>> {
  const [providers, patients, locations, availability, appointments, appointment_types] = await Promise.all([
    prisma.provider.count(),
    prisma.patient.count(),
    prisma.location.count(),
    prisma.availability.count({ where: { mrsExists: true } }),
    prisma.appointment.count(),
    prisma.appointmentType.count(),
  ]);

  return {
    providers,
    patients,
    locations,
    availability,
    appointments,
    appointment_types,
  };
}

/**
 * Handle a detected demo reset.
 * 1. Flag recent bookings for review
 * 2. Trigger full re-sync
 * 3. Do NOT auto-delete local data
 */
export async function handleDemoReset(): Promise<ResetHandlingResult> {
  console.log('[DemoReset] Handling demo reset...');

  const recentCutoff = new Date(Date.now() - RECENT_BOOKINGS_WINDOW_HOURS * 60 * 60 * 1000);

  const recentAppointments = await prisma.appointment.findMany({
    where: {
      createdAt: { gte: recentCutoff },
      bookedVia: { not: 'sync' },
    },
    include: {
      patient: true,
      slot: {
        include: { provider: true },
      },
    },
  });

  let flaggedCount = 0;
  for (const appt of recentAppointments) {
    await prisma.syncConflict.create({
      data: {
        entityType: 'appointment',
        entityId: appt.id,
        mrsId: appt.mrsId,
        conflictType: 'deleted_in_mrs',
        localState: {
          appointmentId: appt.id,
          patientName: appt.patient.name,
          providerName: appt.slot?.provider.name ?? 'Unknown',
          startTime: appt.startTime.toISOString(),
          bookedVia: appt.bookedVia,
          createdAt: appt.createdAt.toISOString(),
        },
        resolution: 'Flagged for review after demo reset detection',
      },
    });
    flaggedCount++;
  }

  await prisma.availability.updateMany({
    where: { mrsExists: true },
    data: { mrsExists: false },
  });

  console.log(`[DemoReset] Flagged ${flaggedCount} recent bookings for review`);
  console.log('[DemoReset] Marked all availability as mrsExists=false, pending full re-sync');

  return {
    handled: true,
    entitiesSynced: [],
    recentBookingsFlagged: flaggedCount,
    message: `Demo reset handled. ${flaggedCount} recent bookings flagged for review. Full re-sync required.`,
  };
}

/**
 * Trigger a full re-sync after demo reset.
 */
export async function triggerFullResync(): Promise<void> {
  const entityTypes: EntityType[] = ['providers', 'locations', 'patients', 'availability', 'appointments'];

  for (const entityType of entityTypes) {
    await prisma.job.create({
      data: {
        type: `sync_${entityType}`,
        payload: { entityType, fullSync: true },
        priority: 100,
        runAt: new Date(),
      },
    });
  }

  console.log('[DemoReset] Full re-sync jobs created for all entity types');
}

/**
 * Get appointments that need review after a reset.
 */
export async function getAppointmentsNeedingReview(): Promise<{
  id: string;
  mrsId: string | null;
  patientName: string;
  providerName: string;
  startTime: Date;
  bookedVia: string;
  createdAt: Date;
}[]> {
  const conflicts = await prisma.syncConflict.findMany({
    where: {
      entityType: 'appointment',
      conflictType: 'deleted_in_mrs',
      resolvedAt: null,
    },
    orderBy: { detectedAt: 'desc' },
  });

  return conflicts.map(c => {
    const state = c.localState as {
      appointmentId: string;
      patientName: string;
      providerName: string;
      startTime: string;
      bookedVia: string;
      createdAt: string;
    };

    return {
      id: state.appointmentId,
      mrsId: c.mrsId,
      patientName: state.patientName,
      providerName: state.providerName,
      startTime: new Date(state.startTime),
      bookedVia: state.bookedVia,
      createdAt: new Date(state.createdAt),
    };
  });
}
