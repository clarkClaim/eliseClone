// Location Sync
// Synchronizes location data from MRS to local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSLocation } from '../../mrs/types.js';
import { detectChanges, locationHasChanged } from '../change-detection.js';
import { resolveConflict } from '../conflict-resolution.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'locations';

/**
 * Sync locations from MRS to local database.
 */
export async function syncLocations(adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let conflicts = 0;

  try {
    const mrsLocations = await adapter.getLocations();

    const localLocations = await prisma.location.findMany({
      select: {
        id: true,
        mrsId: true,
        name: true,
        address: true,
      },
    });

    const changes = detectChanges({
      entityType: ENTITY_TYPE,
      mrsData: mrsLocations,
      localData: localLocations,
      getMrsId: (l: MRSLocation) => l.mrsId,
      getLocalMrsId: (l) => l.mrsId,
      getLocalId: (l) => l.id,
      hasChanged: (local, mrs: MRSLocation) => locationHasChanged(local, mrs),
    });

    for (const mrsLocation of changes.created) {
      await prisma.location.create({
        data: {
          mrsId: mrsLocation.mrsId,
          name: mrsLocation.name,
          address: mrsLocation.address,
        },
      });
      created++;
    }

    for (const { local, mrs } of changes.updated) {
      await prisma.location.update({
        where: { id: local.id },
        data: {
          name: mrs.name,
          address: mrs.address,
        },
      });
      updated++;
    }

    for (const conflict of changes.conflicts) {
      const resolution = await resolveConflict(conflict);
      if (resolution.action === 'mrs_wins') {
        const local = conflict.localState as typeof localLocations[0];
        const mrs = conflict.mrsState as MRSLocation;
        await prisma.location.update({
          where: { id: local.id },
          data: {
            name: mrs.name,
            address: mrs.address,
          },
        });
        updated++;
      }
      conflicts++;
    }

    recordsProcessed = mrsLocations.length;

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
