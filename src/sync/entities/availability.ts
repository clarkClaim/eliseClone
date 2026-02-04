// Availability Sync
// Synchronizes time slot availability from MRS to local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSSlot } from '../../mrs/types.js';
import { detectChanges, availabilityHasChanged, isExternalBookingConflict } from '../change-detection.js';
import { resolveConflict, logConflict } from '../conflict-resolution.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'availability';
const LOOKFORWARD_DAYS = 30;

/**
 * Sync availability (time slots) from MRS to local database.
 * Tracks mrsExists to handle slots deleted from MRS.
 */
export async function syncAvailability(adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let conflicts = 0;

  try {
    const dateRange = {
      start: new Date(),
      end: new Date(Date.now() + LOOKFORWARD_DAYS * 24 * 60 * 60 * 1000),
    };

    const mrsSlots = await adapter.getAvailability(dateRange);

    const localSlots = await prisma.availability.findMany({
      where: {
        mrsId: { not: null },
        startTime: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        id: true,
        mrsId: true,
        providerId: true,
        locationId: true,
        appointmentTypeId: true,
        startTime: true,
        endTime: true,
        isBooked: true,
        mrsExists: true,
      },
    });

    const providerMap = await getProviderMap();
    const locationMap = await getLocationMap();
    const appointmentTypeMap = await getAppointmentTypeMap();

    const changes = detectChanges({
      entityType: ENTITY_TYPE,
      mrsData: mrsSlots,
      localData: localSlots,
      getMrsId: (s: MRSSlot) => s.mrsId,
      getLocalMrsId: (s) => s.mrsId,
      getLocalId: (s) => s.id,
      hasChanged: (local, mrs: MRSSlot) => availabilityHasChanged(local, mrs),
      isConflict: (local, mrs: MRSSlot) => isExternalBookingConflict(local, mrs),
    });

    for (const mrsSlot of changes.created) {
      const providerId = providerMap.get(mrsSlot.providerMrsId);
      if (!providerId) {
        console.warn(`[Sync] Skipping slot ${mrsSlot.mrsId} - provider ${mrsSlot.providerMrsId} not found`);
        continue;
      }

      await prisma.availability.create({
        data: {
          mrsId: mrsSlot.mrsId,
          providerId,
          locationId: mrsSlot.locationMrsId ? locationMap.get(mrsSlot.locationMrsId) : null,
          appointmentTypeId: mrsSlot.appointmentTypeMrsId ? appointmentTypeMap.get(mrsSlot.appointmentTypeMrsId) : null,
          startTime: mrsSlot.startTime,
          endTime: mrsSlot.endTime,
          isBooked: mrsSlot.isBooked,
          mrsExists: true,
          mrsUpdatedAt: new Date(),
        },
      });
      created++;
    }

    for (const { local, mrs } of changes.updated) {
      await prisma.availability.update({
        where: { id: local.id },
        data: {
          startTime: mrs.startTime,
          endTime: mrs.endTime,
          isBooked: mrs.isBooked,
          mrsExists: true,
          mrsUpdatedAt: new Date(),
        },
      });
      updated++;
    }

    for (const conflict of changes.conflicts) {
      const resolution = await resolveConflict(conflict);
      if (resolution.action === 'mrs_wins') {
        const local = conflict.localState as typeof localSlots[0];
        const mrs = conflict.mrsState as MRSSlot;

        await logConflict({
          entityType: ENTITY_TYPE,
          entityId: local.id,
          mrsId: local.mrsId ?? undefined,
          conflictType: 'external_booking',
          localState: { isBooked: local.isBooked },
          mrsState: { isBooked: mrs.isBooked },
        }, 'External booking detected - MRS wins');

        await prisma.availability.update({
          where: { id: local.id },
          data: {
            isBooked: mrs.isBooked,
            mrsExists: true,
            mrsUpdatedAt: new Date(),
          },
        });
        updated++;
      }
      conflicts++;
    }

    for (const localSlot of changes.deleted) {
      if (localSlot.isBooked) {
        await logConflict({
          entityType: ENTITY_TYPE,
          entityId: localSlot.id,
          mrsId: localSlot.mrsId ?? undefined,
          conflictType: 'deleted_in_mrs',
          localState: localSlot,
        }, 'Booked slot deleted in MRS - marked mrsExists=false');
        conflicts++;
      }

      await prisma.availability.update({
        where: { id: localSlot.id },
        data: { mrsExists: false },
      });
      deleted++;
    }

    recordsProcessed = mrsSlots.length;

    const completedAt = new Date();
    return {
      entityType: ENTITY_TYPE,
      success: true,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordsProcessed,
      created,
      updated,
      deleted,
      conflicts,
    };
  } catch (error) {
    const completedAt = new Date();
    return {
      entityType: ENTITY_TYPE,
      success: false,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordsProcessed,
      created,
      updated,
      deleted,
      conflicts,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function getProviderMap(): Promise<Map<string, string>> {
  const providers = await prisma.provider.findMany({
    select: { id: true, mrsId: true },
  });
  return new Map(providers.map(p => [p.mrsId, p.id]));
}

async function getLocationMap(): Promise<Map<string, string>> {
  const locations = await prisma.location.findMany({
    select: { id: true, mrsId: true },
  });
  return new Map(locations.map(l => [l.mrsId, l.id]));
}

async function getAppointmentTypeMap(): Promise<Map<string, string>> {
  const types = await prisma.appointmentType.findMany({
    select: { id: true, mrsId: true },
  });
  return new Map(types.map(t => [t.mrsId, t.id]));
}
