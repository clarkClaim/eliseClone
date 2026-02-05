// Conflict Resolution
// Rules for resolving conflicts between MRS and local data

import { prisma } from '../db/client.js';
import type { ConflictRecord, ConflictType, EntityType } from './types.js';

export type ResolutionAction = 'mrs_wins' | 'local_wins' | 'merge' | 'flag_for_review';

export interface ResolutionRule {
  conflictType: ConflictType;
  entityType: EntityType;
  action: ResolutionAction;
  description: string;
}

/**
 * Resolution rules define how to handle different types of conflicts.
 * Generally:
 * - Patient data: MRS wins (source of truth for demographics)
 * - Provider/Location: MRS wins
 * - Availability: MRS wins, but log external bookings
 * - Appointments: Complex - depends on sync status
 */
export const RESOLUTION_RULES: ResolutionRule[] = [
  // Patient conflicts
  {
    conflictType: 'data_diverged',
    entityType: 'patients',
    action: 'mrs_wins',
    description: 'MRS is source of truth for patient demographics',
  },
  {
    conflictType: 'deleted_in_mrs',
    entityType: 'patients',
    action: 'flag_for_review',
    description: 'Patient deleted in MRS - review before removing locally',
  },

  // Provider conflicts
  {
    conflictType: 'data_diverged',
    entityType: 'providers',
    action: 'mrs_wins',
    description: 'MRS is source of truth for provider data',
  },

  // Location conflicts
  {
    conflictType: 'data_diverged',
    entityType: 'locations',
    action: 'mrs_wins',
    description: 'MRS is source of truth for location data',
  },

  // Availability conflicts
  {
    conflictType: 'external_booking',
    entityType: 'availability',
    action: 'mrs_wins',
    description: 'Slot was booked externally in MRS - update local to match',
  },
  {
    conflictType: 'deleted_in_mrs',
    entityType: 'availability',
    action: 'mrs_wins',
    description: 'Slot deleted in MRS - mark as mrsExists=false locally',
  },

  // Appointment conflicts
  {
    conflictType: 'data_diverged',
    entityType: 'appointments',
    action: 'mrs_wins',
    description: 'MRS status wins for appointments',
  },
  {
    conflictType: 'local_only',
    entityType: 'appointments',
    action: 'flag_for_review',
    description: 'Appointment exists locally but not in MRS - needs review',
  },
  {
    conflictType: 'deleted_in_mrs',
    entityType: 'appointments',
    action: 'flag_for_review',
    description: 'Appointment deleted in MRS - needs review, may need patient notification',
  },
];

/**
 * Get the resolution rule for a specific conflict type and entity.
 */
export function getResolutionRule(
  conflictType: ConflictType,
  entityType: EntityType
): ResolutionRule | undefined {
  return RESOLUTION_RULES.find(
    rule => rule.conflictType === conflictType && rule.entityType === entityType
  );
}

/**
 * Get the resolution action for a conflict.
 * Defaults to 'flag_for_review' if no rule matches.
 */
export function getResolutionAction(
  conflictType: ConflictType,
  entityType: EntityType
): ResolutionAction {
  const rule = getResolutionRule(conflictType, entityType);
  return rule?.action ?? 'flag_for_review';
}

/**
 * Log a conflict to the database.
 */
export async function logConflict<TMrs, TLocal = TMrs>(
  conflict: ConflictRecord<TMrs, TLocal>,
  resolution: string
): Promise<void> {
  await prisma.syncConflict.create({
    data: {
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      mrsId: conflict.mrsId ?? null,
      conflictType: conflict.conflictType,
      localState: conflict.localState as object,
      mrsState: conflict.mrsState ? (conflict.mrsState as object) : undefined,
      resolution,
    },
  });
}

/**
 * Resolve a conflict and log it.
 */
export async function resolveConflict<TMrs, TLocal = TMrs>(
  conflict: ConflictRecord<TMrs, TLocal>
): Promise<{ action: ResolutionAction; description: string }> {
  const rule = getResolutionRule(conflict.conflictType, conflict.entityType);
  const action = rule?.action ?? 'flag_for_review';
  const description = rule?.description ?? 'No rule found - flagged for review';

  await logConflict(conflict, description);

  return { action, description };
}

/**
 * Check if an appointment conflict needs manual review.
 */
export function needsManualReview(
  conflictType: ConflictType,
  entityType: EntityType
): boolean {
  const action = getResolutionAction(conflictType, entityType);
  return action === 'flag_for_review';
}

/**
 * Get unresolved conflicts for admin review.
 */
export async function getUnresolvedConflicts(entityType?: EntityType) {
  return prisma.syncConflict.findMany({
    where: {
      resolvedAt: null,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { detectedAt: 'desc' },
  });
}

/**
 * Mark a conflict as resolved.
 */
export async function markConflictResolved(
  conflictId: string,
  resolution?: string
): Promise<void> {
  await prisma.syncConflict.update({
    where: { id: conflictId },
    data: {
      resolvedAt: new Date(),
      ...(resolution ? { resolution } : {}),
    },
  });
}
