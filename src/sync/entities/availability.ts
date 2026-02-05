// Availability Sync
// NOTE: Slot-based availability sync has been removed.
//
// Availability is now computed locally from:
// - ScheduleTemplates (provider working hours)
// - Appointments (booked times)
//
// The Availability table is retained for legacy data but new availability
// is computed on-demand by the AvailabilityService using schedule templates.
//
// This module now provides a no-op sync that reports success.

import type { MRSAdapter } from '../../mrs/adapter.js';
import type { SyncResult, EntityType } from '../types.js';

const ENTITY_TYPE: EntityType = 'availability';

/**
 * Availability sync (no-op).
 *
 * Slot-based availability sync has been removed. Availability is now computed
 * locally from ScheduleTemplates + Appointments by the AvailabilityService.
 *
 * This function returns success immediately to maintain compatibility with
 * the sync scheduler that expects all entity types to have a sync function.
 */
export async function syncAvailability(_adapter: MRSAdapter): Promise<SyncResult> {
  const startedAt = new Date();

  // Log that availability sync is a no-op now
  console.log('[AvailabilitySync] Availability is computed locally from ScheduleTemplates. No MRS sync needed.');

  const completedAt = new Date();
  return {
    entityType: ENTITY_TYPE,
    success: true,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    recordsProcessed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
  };
}
