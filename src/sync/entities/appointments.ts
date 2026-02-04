// Appointment Sync
// Bidirectional synchronization of appointments between MRS and local database

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSAppointment } from '../../mrs/types.js';
import { detectChanges, appointmentHasChanged } from '../change-detection.js';
import { resolveConflict, logConflict } from '../conflict-resolution.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'appointments';
const LOOKBACK_DAYS = 7;
const LOOKFORWARD_DAYS = 30;

/**
 * Sync appointments bidirectionally:
 * 1. Pull appointments from MRS to local (imports external bookings)
 * 2. Check for local-only appointments that should exist in MRS
 */
export async function syncAppointments(adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();
  let recordsProcessed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let conflicts = 0;

  try {
    const filter = {
      startDate: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + LOOKFORWARD_DAYS * 24 * 60 * 60 * 1000),
    };

    const mrsAppointments = await adapter.getAppointments(filter);

    const localAppointments = await prisma.appointment.findMany({
      where: {
        slot: {
          startTime: { gte: filter.startDate, lte: filter.endDate },
        },
      },
      select: {
        id: true,
        mrsId: true,
        patientId: true,
        slotId: true,
        status: true,
        reason: true,
        cancelReason: true,
        syncedToMrs: true,
        patient: { select: { mrsId: true } },
        slot: {
          select: {
            mrsId: true,
            startTime: true,
            endTime: true,
            provider: { select: { mrsId: true } },
          },
        },
      },
    });

    const changes = detectChanges({
      entityType: ENTITY_TYPE,
      mrsData: mrsAppointments,
      localData: localAppointments.filter(a => a.mrsId !== null),
      getMrsId: (a: MRSAppointment) => a.mrsId,
      getLocalMrsId: (a) => a.mrsId,
      getLocalId: (a) => a.id,
      hasChanged: (local, mrs: MRSAppointment) => appointmentHasChanged(local, mrs),
    });

    for (const mrsAppt of changes.created) {
      const result = await importAppointment(mrsAppt, adapter);
      if (result === 'created') created++;
      else if (result === 'conflict') conflicts++;
    }

    for (const { local, mrs } of changes.updated) {
      await prisma.appointment.update({
        where: { id: local.id },
        data: {
          status: mrs.status,
          reason: mrs.reason,
          cancelReason: mrs.cancelReason,
          mrsUpdatedAt: new Date(),
        },
      });
      updated++;
    }

    for (const conflict of changes.conflicts) {
      const resolution = await resolveConflict(conflict);
      if (resolution.action === 'mrs_wins') {
        const local = conflict.localState as typeof localAppointments[0];
        const mrs = conflict.mrsState as MRSAppointment;
        await prisma.appointment.update({
          where: { id: local.id },
          data: {
            status: mrs.status,
            reason: mrs.reason,
            cancelReason: mrs.cancelReason,
            mrsUpdatedAt: new Date(),
          },
        });
        updated++;
      }
      conflicts++;
    }

    const mrsIds = new Set(mrsAppointments.map(a => a.mrsId));
    for (const localAppt of localAppointments) {
      if (localAppt.mrsId && localAppt.syncedToMrs && !mrsIds.has(localAppt.mrsId)) {
        await logConflict({
          entityType: ENTITY_TYPE,
          entityId: localAppt.id,
          mrsId: localAppt.mrsId,
          conflictType: 'deleted_in_mrs',
          localState: localAppt,
        }, 'Appointment synced to MRS but no longer exists there - flagged for review');
        conflicts++;
        deleted++;
      }
    }

    recordsProcessed = mrsAppointments.length;

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

async function importAppointment(
  mrsAppt: MRSAppointment,
  adapter: MRSAdapter
): Promise<'created' | 'skipped' | 'conflict'> {
  let patient = await prisma.patient.findUnique({
    where: { mrsId: mrsAppt.patientMrsId },
  });

  if (!patient) {
    const mrsPatient = await adapter.getPatient(mrsAppt.patientMrsId);
    if (!mrsPatient) {
      console.warn(`[Sync] Cannot import appointment ${mrsAppt.mrsId} - patient ${mrsAppt.patientMrsId} not found`);
      return 'skipped';
    }

    patient = await prisma.patient.create({
      data: {
        mrsId: mrsPatient.mrsId,
        name: mrsPatient.name,
        givenName: mrsPatient.givenName,
        familyName: mrsPatient.familyName,
        dob: mrsPatient.dateOfBirth,
        gender: mrsPatient.gender,
      },
    });
  }

  let slot = await prisma.availability.findFirst({
    where: {
      startTime: mrsAppt.startTime,
      endTime: mrsAppt.endTime,
      provider: { mrsId: mrsAppt.providerMrsId },
    },
  });

  if (!slot) {
    const provider = await prisma.provider.findUnique({
      where: { mrsId: mrsAppt.providerMrsId },
    });

    if (!provider) {
      console.warn(`[Sync] Cannot import appointment ${mrsAppt.mrsId} - provider ${mrsAppt.providerMrsId} not found`);
      return 'skipped';
    }

    slot = await prisma.availability.create({
      data: {
        providerId: provider.id,
        startTime: mrsAppt.startTime,
        endTime: mrsAppt.endTime,
        isBooked: true,
        mrsExists: true,
        mrsUpdatedAt: new Date(),
      },
    });
  }

  const existingAppt = await prisma.appointment.findUnique({
    where: { slotId: slot.id },
  });

  if (existingAppt && existingAppt.mrsId !== mrsAppt.mrsId) {
    await logConflict({
      entityType: ENTITY_TYPE,
      entityId: existingAppt.id,
      mrsId: mrsAppt.mrsId,
      conflictType: 'data_diverged',
      localState: existingAppt,
      mrsState: mrsAppt as unknown as typeof existingAppt,
    }, 'Slot already has a different appointment locally');
    return 'conflict';
  }

  await prisma.appointment.create({
    data: {
      mrsId: mrsAppt.mrsId,
      patientId: patient.id,
      slotId: slot.id,
      status: mrsAppt.status,
      reason: mrsAppt.reason,
      cancelReason: mrsAppt.cancelReason,
      bookedVia: 'sync',
      syncedToMrs: true,
      syncedToMrsAt: new Date(),
      mrsUpdatedAt: new Date(),
    },
  });

  await prisma.availability.update({
    where: { id: slot.id },
    data: { isBooked: true },
  });

  return 'created';
}
