// Appointment Types Sync
// Syncs appointment/service types from MRS to local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'appointment_types';

/**
 * Sync appointment types from MRS to local database.
 */
export async function syncAppointmentTypes(adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;

  try {
    const mrsTypes = await adapter.getAppointmentTypes();
    recordsProcessed = mrsTypes.length;

    for (const mrsType of mrsTypes) {
      const existing = await prisma.appointmentType.findFirst({
        where: { mrsId: mrsType.mrsId },
      });

      if (existing) {
        // Update if name changed
        if (existing.name !== mrsType.name) {
          await prisma.appointmentType.update({
            where: { id: existing.id },
            data: {
              name: mrsType.name,
              durationMinutes: mrsType.durationMins ?? existing.durationMinutes,
            },
          });
          updated++;
        }
      } else {
        // Create new
        await prisma.appointmentType.create({
          data: {
            mrsId: mrsType.mrsId,
            name: mrsType.name,
            durationMinutes: mrsType.durationMins ?? 30,
          },
        });
        created++;
      }
    }

    const completedAt = new Date();
    console.log(`[AppointmentTypesSync] Complete: ${created} created, ${updated} updated`);

    return {
      entityType: ENTITY_TYPE,
      success: true,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordsProcessed,
      created,
      updated,
      deleted: 0,
      conflicts: 0,
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
      deleted: 0,
      conflicts: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
