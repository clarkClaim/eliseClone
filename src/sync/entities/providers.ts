// Provider Sync
// Synchronizes provider data from MRS to local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSProvider } from '../../mrs/types.js';
import { detectChanges, providerHasChanged } from '../change-detection.js';
import { resolveConflict } from '../conflict-resolution.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'providers';

/**
 * Sync providers from MRS to local database.
 */
export async function syncProviders(adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let conflicts = 0;

  try {
    const mrsProviders = await adapter.getProviders();

    const localProviders = await prisma.provider.findMany({
      select: {
        id: true,
        mrsId: true,
        name: true,
        specialty: true,
      },
    });

    const changes = detectChanges({
      entityType: ENTITY_TYPE,
      mrsData: mrsProviders,
      localData: localProviders,
      getMrsId: (p: MRSProvider) => p.mrsId,
      getLocalMrsId: (p) => p.mrsId,
      getLocalId: (p) => p.id,
      hasChanged: (local, mrs: MRSProvider) => providerHasChanged(local, mrs),
    });

    for (const mrsProvider of changes.created) {
      await prisma.provider.create({
        data: {
          mrsId: mrsProvider.mrsId,
          name: mrsProvider.name,
          specialty: mrsProvider.specialty,
        },
      });
      created++;
    }

    for (const { local, mrs } of changes.updated) {
      await prisma.provider.update({
        where: { id: local.id },
        data: {
          name: mrs.name,
          specialty: mrs.specialty,
        },
      });
      updated++;
    }

    for (const conflict of changes.conflicts) {
      const resolution = await resolveConflict(conflict);
      if (resolution.action === 'mrs_wins') {
        const local = conflict.localState as typeof localProviders[0];
        const mrs = conflict.mrsState as MRSProvider;
        await prisma.provider.update({
          where: { id: local.id },
          data: {
            name: mrs.name,
            specialty: mrs.specialty,
          },
        });
        updated++;
      }
      conflicts++;
    }

    recordsProcessed = mrsProviders.length;

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
