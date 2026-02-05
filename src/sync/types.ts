// Sync Service Types
// Type definitions for the sync service
//
// CONFIGURATION GUIDE
// ===================
//
// The sync service manages bidirectional data synchronization between the local
// database (Context Store) and the Medical Record System (MRS). Configuration
// can be customized via environment variables or by passing a config object
// to the SyncScheduler constructor.
//
// ENTITY TYPES AND PRIORITIES
// ---------------------------
// - availability (HIGH): Synced every 5 minutes. Critical for booking accuracy.
//   Stale availability can lead to double-booking conflicts.
//
// - appointments (HIGH): Synced every 5 minutes. Detects external bookings/cancellations
//   made directly in the MRS. Also processes the push queue for local bookings.
//
// - patients (MEDIUM): Synced every 30 minutes. Patient demographics change infrequently.
//   Phone number updates are important for contact purposes.
//
// - providers (LOW): Synced every 60 minutes. Provider lists rarely change.
//   Only affects which providers appear in availability queries.
//
// - locations (LOW): Synced every 60 minutes. Location data is very stable.
//
// TUNING RECOMMENDATIONS
// ----------------------
// - High volume clinics: Reduce availability interval to 2-3 minutes
// - Rate-limited MRS: Increase all intervals, rely more on MRS-first booking
// - Demo/testing: Can increase intervals to reduce API calls
// - Production with webhooks: If MRS supports webhooks, intervals can be longer
//   since webhooks provide real-time updates (set supportsWebhooks capability)
//
// ENVIRONMENT VARIABLES
// ---------------------
// SYNC_AVAILABILITY_INTERVAL_MS  - Override availability sync interval
// SYNC_APPOINTMENTS_INTERVAL_MS  - Override appointments sync interval
// SYNC_PATIENTS_INTERVAL_MS      - Override patients sync interval
// SYNC_PROVIDERS_INTERVAL_MS     - Override providers sync interval
// SYNC_LOCATIONS_INTERVAL_MS     - Override locations sync interval
// SYNC_FULL_SYNC_TIME            - Daily full sync time (24h format, e.g., "02:00")
// SYNC_MAX_CONSECUTIVE_FAILURES  - Alert threshold for consecutive failures

/**
 * Entity types that can be synchronized with the MRS.
 */
export type EntityType = 'patients' | 'providers' | 'locations' | 'availability' | 'appointments' | 'appointment_types';

/**
 * Sync priority levels affect scheduling order when rate-limited.
 * - high: Synced first, shortest backoff
 * - medium: Synced after high priority
 * - low: Synced last, longest backoff when rate-limited
 */
export type SyncPriority = 'high' | 'medium' | 'low';

/**
 * Configuration for a single entity type's sync schedule.
 */
export interface SyncScheduleConfig {
  /** Interval between sync runs in milliseconds */
  intervalMs: number;
  /** Priority for scheduling when rate-limited */
  priority: SyncPriority;
}

/**
 * Complete sync scheduler configuration.
 *
 * @example
 * // Custom config for high-volume clinic
 * const config: SyncSchedulerConfig = {
 *   schedules: {
 *     availability: { intervalMs: 2 * 60 * 1000, priority: 'high' },  // 2 min
 *     appointments: { intervalMs: 2 * 60 * 1000, priority: 'high' },  // 2 min
 *     patients: { intervalMs: 15 * 60 * 1000, priority: 'medium' },   // 15 min
 *     providers: { intervalMs: 60 * 60 * 1000, priority: 'low' },     // 60 min
 *     locations: { intervalMs: 60 * 60 * 1000, priority: 'low' },     // 60 min
 *   },
 *   maxConsecutiveFailures: 3,  // Alert sooner
 *   fullSyncTime: '03:00',      // Full sync at 3 AM
 * };
 */
export interface SyncSchedulerConfig {
  /** Per-entity sync schedules */
  schedules: Record<EntityType, SyncScheduleConfig>;
  /** Number of consecutive failures before alerting */
  maxConsecutiveFailures: number;
  /** Time for daily full sync in 24h format (e.g., "02:00"). Omit to disable. */
  fullSyncTime?: string;
}

/**
 * Default sync configuration.
 *
 * Intervals are balanced for typical clinic usage:
 * - Availability/appointments: 5 min (critical for booking)
 * - Patients: 30 min (moderate change rate)
 * - Providers/locations: 60 min (rarely change)
 *
 * Full sync runs daily at 2 AM to catch any missed changes.
 */
export const DEFAULT_SYNC_CONFIG: SyncSchedulerConfig = {
  schedules: {
    availability: { intervalMs: 5 * 60 * 1000, priority: 'high' },    // 5 minutes
    appointments: { intervalMs: 5 * 60 * 1000, priority: 'high' },    // 5 minutes
    patients: { intervalMs: 30 * 60 * 1000, priority: 'medium' },     // 30 minutes
    providers: { intervalMs: 60 * 60 * 1000, priority: 'low' },       // 60 minutes
    locations: { intervalMs: 60 * 60 * 1000, priority: 'low' },       // 60 minutes
    appointment_types: { intervalMs: 60 * 60 * 1000, priority: 'low' }, // 60 minutes (rarely change)
  },
  maxConsecutiveFailures: 5,
  fullSyncTime: '02:00',
};

/**
 * Result of a sync operation for a single entity type.
 *
 * Logged after each sync run for observability. The `conflicts` count
 * indicates records that required manual review or special handling.
 */
export interface SyncResult {
  entityType: EntityType;
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  recordsProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  error?: string;
}

export interface ChangeRecord<TMrs, TLocal = TMrs> {
  local: TLocal;
  mrs: TMrs;
}

export interface ChangeSet<TMrs, TLocal = TMrs> {
  created: TMrs[];
  updated: ChangeRecord<TMrs, TLocal>[];
  deleted: TLocal[];
  conflicts: ConflictRecord<TMrs, TLocal>[];
}

export interface ConflictRecord<TMrs, TLocal = TMrs> {
  entityType: EntityType;
  entityId: string;
  mrsId?: string;
  conflictType: ConflictType;
  localState: TLocal;
  mrsState?: TMrs;
}

/**
 * Types of conflicts that can occur during sync.
 *
 * RESOLUTION STRATEGIES:
 * - local_only: Usually push to MRS, or flag if push fails
 * - mrs_only: Import to local (MRS is source of truth)
 * - data_diverged: Apply resolution rules (usually MRS wins for patient data)
 * - deleted_in_mrs: Mark mrsExists=false locally, prevent new bookings
 * - external_booking: Flag for review, suggest alternatives to patient
 */
export type ConflictType =
  | 'local_only'        // Exists locally but not in MRS
  | 'mrs_only'          // Exists in MRS but not locally
  | 'data_diverged'     // Both exist but data differs unexpectedly
  | 'deleted_in_mrs'    // Was in MRS, now gone
  | 'external_booking'; // Slot booked externally in MRS

/**
 * Rate limit state tracked per sync operation.
 *
 * The sync scheduler uses this to:
 * 1. Delay sync when remainingRequests is low
 * 2. Apply exponential backoff after consecutive failures
 * 3. Adjust sync intervals when quota is below 20%
 *
 * State is persisted to the SyncState table for durability across restarts.
 */
export interface RateLimitState {
  /** Remaining API requests before rate limit (null if unknown) */
  remainingRequests: number | null;
  /** When the rate limit resets (null if unknown) */
  resetAt: Date | null;
  /** Number of consecutive sync failures */
  consecutiveFailures: number;
  /** Don't make requests until this time (exponential backoff) */
  backoffUntil: Date | null;
}

export interface SyncJobPayload {
  entityType: EntityType;
  fullSync?: boolean;
  priority?: SyncPriority;
}

export interface PushJobPayload {
  appointmentId: string;
}

export interface CancellationPushPayload {
  appointmentId: string;
  mrsId: string;
  reason?: string;
}

/**
 * Job types for the sync service queue.
 *
 * sync_* jobs: Pull data from MRS to local database
 * push_* jobs: Push local changes to MRS (created during graceful degradation)
 *
 * Job priorities:
 * - High priority (10): push_appointment_to_mrs (patient is waiting)
 * - Medium priority (5): sync_availability, sync_appointments
 * - Low priority (1): sync_patients, sync_providers, sync_locations
 */
export type JobType =
  | 'sync_patients'
  | 'sync_providers'
  | 'sync_locations'
  | 'sync_availability'
  | 'sync_appointments'
  | 'push_appointment_to_mrs'
  | 'push_cancellation_to_mrs';
