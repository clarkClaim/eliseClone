// Change Detection
// Compares MRS data with local data to detect changes

import type { ChangeSet, ConflictRecord, EntityType } from './types.js';

export interface Identifiable {
  mrsId?: string | null;
}

export interface ChangeDetectionOptions<TMrs, TLocal = TMrs> {
  entityType: EntityType;
  mrsData: TMrs[];
  localData: TLocal[];
  getMrsId: (record: TMrs) => string;
  getLocalMrsId: (record: TLocal) => string | null | undefined;
  getLocalId: (record: TLocal) => string;
  hasChanged: (local: TLocal, mrs: TMrs) => boolean;
  isConflict?: (local: TLocal, mrs: TMrs) => boolean;
}

/**
 * Detect changes between MRS data and local data.
 * This is used when the MRS doesn't support incremental sync (modified-since queries).
 *
 * @typeParam TMrs - Type of records from the MRS
 * @typeParam TLocal - Type of records from local database (defaults to TMrs)
 */
export function detectChanges<TMrs, TLocal = TMrs>(options: ChangeDetectionOptions<TMrs, TLocal>): ChangeSet<TMrs, TLocal> {
  const {
    entityType,
    mrsData,
    localData,
    getMrsId,
    getLocalMrsId,
    getLocalId,
    hasChanged,
    isConflict,
  } = options;

  const changes: ChangeSet<TMrs, TLocal> = {
    created: [],
    updated: [],
    deleted: [],
    conflicts: [],
  };

  const localByMrsId = new Map<string, TLocal>();
  for (const record of localData) {
    const mrsId = getLocalMrsId(record);
    if (mrsId) {
      localByMrsId.set(mrsId, record);
    }
  }

  const mrsIdsSeen = new Set<string>();

  for (const mrsRecord of mrsData) {
    const mrsId = getMrsId(mrsRecord);
    mrsIdsSeen.add(mrsId);

    const localRecord = localByMrsId.get(mrsId);

    if (!localRecord) {
      changes.created.push(mrsRecord);
    } else if (hasChanged(localRecord, mrsRecord)) {
      if (isConflict?.(localRecord, mrsRecord)) {
        changes.conflicts.push({
          entityType,
          entityId: getLocalId(localRecord),
          mrsId,
          conflictType: 'data_diverged',
          localState: localRecord,
          mrsState: mrsRecord,
        });
      } else {
        changes.updated.push({ local: localRecord, mrs: mrsRecord });
      }
    }
  }

  for (const [mrsId, localRecord] of localByMrsId) {
    if (!mrsIdsSeen.has(mrsId)) {
      changes.deleted.push(localRecord);
    }
  }

  return changes;
}

/**
 * Compare patient records for changes.
 */
export function patientHasChanged(
  local: { name: string; givenName?: string | null; familyName?: string | null; dob?: Date | null; gender?: string | null },
  mrs: { name: string; givenName?: string; familyName?: string; dateOfBirth?: Date; gender?: string }
): boolean {
  if (local.name !== mrs.name) return true;
  if (local.givenName !== mrs.givenName) return true;
  if (local.familyName !== mrs.familyName) return true;
  if (local.gender !== mrs.gender) return true;
  if (local.dob?.toDateString() !== mrs.dateOfBirth?.toDateString()) return true;
  return false;
}

/**
 * Compare provider records for changes.
 */
export function providerHasChanged(
  local: { name: string; specialty?: string | null },
  mrs: { name: string; specialty?: string }
): boolean {
  if (local.name !== mrs.name) return true;
  if (local.specialty !== mrs.specialty) return true;
  return false;
}

/**
 * Compare location records for changes.
 */
export function locationHasChanged(
  local: { name: string; address?: string | null },
  mrs: { name: string; address?: string }
): boolean {
  if (local.name !== mrs.name) return true;
  if (local.address !== mrs.address) return true;
  return false;
}

/**
 * Compare availability records for changes.
 */
export function availabilityHasChanged(
  local: { startTime: Date; endTime: Date; isBooked: boolean },
  mrs: { startTime: Date; endTime: Date; isBooked: boolean }
): boolean {
  if (local.startTime.getTime() !== mrs.startTime.getTime()) return true;
  if (local.endTime.getTime() !== mrs.endTime.getTime()) return true;
  if (local.isBooked !== mrs.isBooked) return true;
  return false;
}

/**
 * Compare appointment records for changes.
 */
export function appointmentHasChanged(
  local: { status: string; reason?: string | null; cancelReason?: string | null },
  mrs: { status: string; reason?: string; cancelReason?: string }
): boolean {
  if (local.status !== mrs.status) return true;
  if (local.reason !== mrs.reason) return true;
  if (local.cancelReason !== mrs.cancelReason) return true;
  return false;
}

/**
 * Detect if availability was booked externally (conflict).
 */
export function isExternalBookingConflict(
  local: { isBooked: boolean },
  mrs: { isBooked: boolean }
): boolean {
  return mrs.isBooked && !local.isBooked;
}
