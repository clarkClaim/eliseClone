// Patient Sync
// Synchronizes patient data from MRS to local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSPatient } from '../../mrs/types.js';
import { detectChanges, patientHasChanged } from '../change-detection.js';
import { resolveConflict, getResolutionAction } from '../conflict-resolution.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'patients';

export interface PatientSyncResult extends SyncResult {
  phonesUpdated: number;
}

/**
 * Sync patients from MRS to local database.
 * MRS is source of truth for patient demographics.
 */
export async function syncPatients(
  adapter: MRSAdapter,
  options?: { fullSync?: boolean }
): Promise<PatientSyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let conflicts = 0;
  let phonesUpdated = 0;

  try {
    const mrsPatients = await adapter.getPatients();

    const localPatients = await prisma.patient.findMany({
      select: {
        id: true,
        mrsId: true,
        name: true,
        givenName: true,
        familyName: true,
        dob: true,
        gender: true,
      },
    });

    const changes = detectChanges({
      entityType: ENTITY_TYPE,
      mrsData: mrsPatients,
      localData: localPatients,
      getMrsId: (p: MRSPatient) => p.mrsId,
      getLocalMrsId: (p) => p.mrsId,
      getLocalId: (p) => p.id,
      hasChanged: (local, mrs: MRSPatient) => patientHasChanged(
        { name: local.name, givenName: local.givenName, familyName: local.familyName, dob: local.dob, gender: local.gender },
        mrs
      ),
    });

    for (const mrsPatient of changes.created) {
      await createPatient(mrsPatient);
      created++;
      phonesUpdated += mrsPatient.phoneNumbers.length;
    }

    for (const { local, mrs } of changes.updated) {
      await updatePatient(local.id, mrs);
      updated++;
      phonesUpdated += mrs.phoneNumbers.length;
    }

    for (const conflict of changes.conflicts) {
      const resolution = await resolveConflict(conflict);
      if (resolution.action === 'mrs_wins') {
        const local = conflict.localState as typeof localPatients[0];
        const mrs = conflict.mrsState as MRSPatient;
        await updatePatient(local.id, mrs);
        updated++;
      }
      conflicts++;
    }

    for (const localPatient of changes.deleted) {
      const action = getResolutionAction('deleted_in_mrs', ENTITY_TYPE);
      if (action === 'flag_for_review') {
        await resolveConflict({
          entityType: ENTITY_TYPE,
          entityId: localPatient.id,
          mrsId: localPatient.mrsId ?? undefined,
          conflictType: 'deleted_in_mrs',
          localState: localPatient,
        });
        conflicts++;
      }
      deleted++;
    }

    recordsProcessed = mrsPatients.length;

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
      phonesUpdated,
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
      phonesUpdated,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function createPatient(patient: MRSPatient): Promise<void> {
  const created = await prisma.patient.create({
    data: {
      mrsId: patient.mrsId,
      name: patient.name,
      givenName: patient.givenName,
      familyName: patient.familyName,
      dob: patient.dateOfBirth,
      gender: patient.gender,
    },
  });

  for (const phone of patient.phoneNumbers) {
    await prisma.patientPhone.create({
      data: {
        patientId: created.id,
        phone: phone.phone,
        phoneType: phone.phoneType,
        isPrimary: phone.isPrimary,
      },
    });
  }
}

async function updatePatient(localId: string, patient: MRSPatient): Promise<void> {
  await prisma.patient.update({
    where: { id: localId },
    data: {
      name: patient.name,
      givenName: patient.givenName,
      familyName: patient.familyName,
      dob: patient.dateOfBirth,
      gender: patient.gender,
    },
  });

  await prisma.patientPhone.deleteMany({
    where: { patientId: localId },
  });

  for (const phone of patient.phoneNumbers) {
    await prisma.patientPhone.create({
      data: {
        patientId: localId,
        phone: phone.phone,
        phoneType: phone.phoneType,
        isPrimary: phone.isPrimary,
      },
    });
  }
}
