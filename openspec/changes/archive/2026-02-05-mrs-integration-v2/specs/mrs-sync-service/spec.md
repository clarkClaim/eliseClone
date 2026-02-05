## ADDED Requirements

### Requirement: Sync Service Architecture
The system SHALL provide a background sync service that continuously synchronizes data between the MRS and local database using polling.

#### Scenario: Sync service starts with scheduler
- **WHEN** the application starts
- **THEN** the sync service SHALL initialize with configured polling intervals per entity type
- **AND** begin scheduling sync jobs according to priority

#### Scenario: Sync service respects intervals
- **WHEN** a sync job completes
- **THEN** the next sync for that entity type SHALL be scheduled after the configured interval
- **AND** the interval SHALL be configurable per entity type

---

### Requirement: Entity-Specific Sync Intervals
The system SHALL sync different entities at different frequencies based on how often they change and their importance to booking.

#### Scenario: High-priority entities sync frequently
- **WHEN** sync service is running
- **THEN** availability and appointments SHALL sync every 5 minutes (configurable)
- **AND** these SHALL have highest priority in the job queue

#### Scenario: Medium-priority entities sync moderately
- **WHEN** sync service is running
- **THEN** patients SHALL sync every 30 minutes (configurable)

#### Scenario: Low-priority entities sync infrequently
- **WHEN** sync service is running
- **THEN** providers and locations SHALL sync every 60 minutes (configurable)
- **AND** these SHALL have lowest priority in the job queue

---

### Requirement: Rate Limit Awareness
The sync service SHALL track rate limit consumption and adapt polling behavior to avoid hitting limits.

#### Scenario: Track remaining quota
- **WHEN** MRS responds with rate limit headers
- **THEN** sync service SHALL update its rate limit state with remaining requests and reset time

#### Scenario: Approach rate limit
- **WHEN** remaining requests drop below 20% of limit
- **THEN** sync service SHALL increase intervals temporarily to preserve quota

#### Scenario: Hit rate limit
- **WHEN** MRS returns 429 Too Many Requests
- **THEN** sync service SHALL enter backoff mode
- **AND** use exponential backoff: 1min, 2min, 4min, 8min, max 30min
- **AND** log the rate limit event

---

### Requirement: Change Detection Without Modified-Since
The sync service SHALL detect changes by comparing MRS data with local data when the MRS doesn't support incremental queries.

#### Scenario: Detect new records
- **WHEN** MRS returns records not present locally (by mrs_id)
- **THEN** sync service SHALL mark them as created
- **AND** insert them into local database

#### Scenario: Detect updated records
- **WHEN** MRS returns records that differ from local (key fields changed)
- **THEN** sync service SHALL mark them as updated
- **AND** update the local record with MRS data

#### Scenario: Detect deleted records
- **WHEN** local records (with mrs_id) are not returned by MRS within the sync range
- **THEN** sync service SHALL mark them as potentially deleted
- **AND** set `mrsExists = false` on availability records
- **AND** flag appointments for review (don't auto-delete)

---

### Requirement: Sync State Tracking
The sync service SHALL track the state of each entity sync for observability and recovery.

#### Scenario: Record successful sync
- **WHEN** a sync job completes successfully
- **THEN** SyncState SHALL be updated with:
  - `lastSyncAt` = current time
  - `nextSyncAt` = current time + interval
  - `lastSyncDuration` = elapsed milliseconds
  - `recordsProcessed` = count of records synced
  - `consecutiveFailures` = 0
  - `syncStatus` = 'completed'

#### Scenario: Record failed sync
- **WHEN** a sync job fails
- **THEN** SyncState SHALL be updated with:
  - `lastError` = error message
  - `consecutiveFailures` = previous + 1
  - `syncStatus` = 'failed'

#### Scenario: Consecutive failure alerting
- **WHEN** consecutiveFailures exceeds threshold (default: 5)
- **THEN** sync service SHALL log an alert
- **AND** reduce sync frequency for that entity until recovery

---

### Requirement: Conflict Detection and Logging
The sync service SHALL detect and log conflicts when local and MRS data diverge unexpectedly.

#### Scenario: Local-only appointment conflict
- **WHEN** an appointment exists locally (with mrs_id) but not in MRS
- **THEN** sync service SHALL create a SyncConflict record with:
  - `conflictType` = 'local_only'
  - `localState` = JSON of local appointment
  - `mrsState` = null

#### Scenario: Data divergence conflict
- **WHEN** local and MRS appointment have different statuses that shouldn't differ
- **THEN** sync service SHALL create a SyncConflict record with:
  - `conflictType` = 'data_diverged'
  - `localState` = JSON of local record
  - `mrsState` = JSON of MRS record

#### Scenario: Deleted in MRS conflict
- **WHEN** a slot/appointment existed locally but MRS deleted it
- **THEN** sync service SHALL create a SyncConflict record with:
  - `conflictType` = 'deleted_in_mrs'

---

### Requirement: Conflict Resolution Rules
The sync service SHALL apply consistent resolution rules based on conflict type.

#### Scenario: Patient data conflict
- **WHEN** patient data differs between local and MRS
- **THEN** MRS SHALL win (source of truth for patient demographics)
- **AND** local record SHALL be updated to match MRS

#### Scenario: External booking detected
- **WHEN** MRS shows slot as booked but local shows available
- **THEN** local SHALL be updated to booked
- **AND** if appointment exists in MRS, it SHALL be imported
- **AND** conflict SHALL be logged with type 'external_booking'

#### Scenario: Appointment in MRS not local
- **WHEN** appointment exists in MRS but not locally
- **THEN** it SHALL be imported to local database
- **AND** tagged with `bookedVia = 'sync'`

---

### Requirement: Demo Instance Reset Detection
The sync service SHALL detect when the OpenMRS demo instance resets and handle gracefully.

#### Scenario: Detect demo reset
- **WHEN** sync returns significantly fewer records than expected (< 50% of previous count)
- **THEN** sync service SHALL flag potential demo reset
- **AND** log alert for admin review

#### Scenario: Handle demo reset
- **WHEN** demo reset is confirmed (multiple entity types affected)
- **THEN** sync service SHALL trigger full re-sync
- **AND** flag recent local bookings (last 24h) for manual review
- **AND** NOT auto-delete local data

---

### Requirement: Full Sync Capability
The sync service SHALL support triggering a full re-sync of all entities.

#### Scenario: Manual full sync
- **WHEN** admin triggers full sync
- **THEN** all entities SHALL be fetched from MRS regardless of last sync time
- **AND** local data SHALL be reconciled with MRS data

#### Scenario: Scheduled daily full sync
- **WHEN** configured time is reached (default: 2 AM)
- **THEN** a full sync job SHALL be queued
- **AND** it SHALL run at low priority to not block regular syncs

---

### Requirement: Sync Job Queue Integration
The sync service SHALL use the existing Job queue for scheduling and executing sync tasks.

#### Scenario: Queue sync job
- **WHEN** it's time to sync an entity
- **THEN** a job SHALL be created with:
  - `type` = 'sync_{entityType}' (e.g., 'sync_availability')
  - `priority` based on entity priority
  - `runAt` = scheduled time

#### Scenario: Process sync job
- **WHEN** job worker claims a sync job
- **THEN** it SHALL invoke the appropriate sync method on the adapter
- **AND** update SyncState on completion

#### Scenario: Retry failed sync job
- **WHEN** sync job fails and attempts < maxAttempts
- **THEN** job SHALL be rescheduled with exponential backoff
- **AND** `backoffExponent` SHALL be incremented
