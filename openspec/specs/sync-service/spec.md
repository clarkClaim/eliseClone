# sync-service Specification

## Purpose

Background service that synchronizes data between OpenMRS and the local Context Store. Handles bidirectional sync with conflict detection and resolution.

## ADDED Requirements

### Requirement: Sync service runs on configurable interval

The sync service SHALL poll MRS on a configurable interval.

#### Scenario: Default sync interval

- **WHEN** SYNC_INTERVAL_MS is not set
- **THEN** the sync service runs every 300000ms (5 minutes)

#### Scenario: Custom sync interval

- **WHEN** SYNC_INTERVAL_MS is set to a value
- **THEN** the sync service uses that interval

#### Scenario: Sync cycle execution

- **WHEN** a sync cycle runs
- **THEN** it syncs patients, providers, and appointments in sequence
- **AND** updates sync_state table with completion timestamp

---

### Requirement: Sync service imports patient data from MRS

The sync service SHALL import and update patient records from MRS.

#### Scenario: New patient in MRS

- **WHEN** MRS has a patient not in local database
- **THEN** the sync service creates a new Patient record with mrsId
- **AND** imports associated phone numbers to patient_phones table

#### Scenario: Updated patient in MRS

- **WHEN** MRS patient has changed since last sync (based on MRS timestamp)
- **THEN** the sync service updates local Patient record
- **AND** MRS data overwrites local data (MRS wins)

---

### Requirement: Sync service imports provider data from MRS

The sync service SHALL import and update provider records from MRS.

#### Scenario: New provider in MRS

- **WHEN** MRS has a provider not in local database
- **THEN** the sync service creates a new Provider record with mrsId

#### Scenario: Updated provider in MRS

- **WHEN** MRS provider has changed since last sync
- **THEN** the sync service updates local Provider record

---

### Requirement: Sync service syncs availability slots

The sync service SHALL sync availability data from MRS.

#### Scenario: New availability slot in MRS

- **WHEN** MRS has a slot not in local database
- **THEN** the sync service creates a new Availability record with mrsId

#### Scenario: Slot deleted in MRS

- **WHEN** a local slot has mrsId but is no longer in MRS
- **THEN** the sync service sets mrsExists=false on the Availability record
- **AND** logs a SyncConflict if slot was booked locally

#### Scenario: Slot booked externally in MRS

- **WHEN** MRS shows a slot as booked but local shows available
- **THEN** the sync service marks the slot as booked locally
- **AND** records the external booking source

---

### Requirement: Sync service syncs appointments bidirectionally

The sync service SHALL import MRS appointments and push local appointments to MRS.

#### Scenario: New appointment in MRS

- **WHEN** MRS has an appointment not in local database
- **THEN** the sync service creates local Appointment record
- **AND** links to local patient and slot by mrsId

#### Scenario: Appointment cancelled in MRS

- **WHEN** MRS appointment status is CANCELLED but local is not
- **THEN** the sync service updates local status to CANCELLED
- **AND** MRS status wins

#### Scenario: Push local appointment to MRS

- **WHEN** local appointment has syncedToMrs=false
- **THEN** the sync service calls MRS adapter to create appointment
- **AND** sets syncedToMrs=true, syncedToMrsAt on success

#### Scenario: Push failure with retry

- **WHEN** pushing appointment to MRS fails
- **THEN** the sync service increments syncAttempts
- **AND** records lastSyncError message
- **AND** creates retry job with exponential backoff

---

### Requirement: Sync service detects and logs conflicts

The sync service SHALL detect data conflicts and log them for review.

#### Scenario: Appointment exists locally but not in MRS

- **WHEN** local appointment has mrsId but MRS returns not found
- **THEN** the sync service creates SyncConflict record with type 'local_only'
- **AND** does NOT auto-delete the local appointment

#### Scenario: Data diverged between local and MRS

- **WHEN** local and MRS have different data for same record
- **THEN** the sync service applies resolution rule (MRS wins for source data)
- **AND** creates SyncConflict record with both states for audit

#### Scenario: Conflict logging includes context

- **WHEN** a SyncConflict is created
- **THEN** it includes entityType, entityId, mrsId, conflictType, localState (JSON), mrsState (JSON), and resolution taken

---

### Requirement: Sync service uses incremental sync

The sync service SHALL use timestamps to fetch only changed records.

#### Scenario: First sync (no prior state)

- **WHEN** sync_state has no record for an entity type
- **THEN** the sync service fetches all records within reasonable lookback (e.g., appointments from last 30 days)

#### Scenario: Incremental sync

- **WHEN** sync_state has lastSyncAt for an entity type
- **THEN** the sync service fetches only records modified since that timestamp

#### Scenario: Sync state tracking per entity

- **WHEN** sync completes for an entity type
- **THEN** sync_state is updated with new lastSyncAt, lastSyncStatus
- **AND** consecutiveFailures is reset to 0 on success

---

### Requirement: Sync service handles MRS unavailability

The sync service SHALL gracefully handle MRS downtime.

#### Scenario: MRS unreachable

- **WHEN** MRS is not reachable during sync
- **THEN** the sync service logs error
- **AND** increments consecutiveFailures in sync_state
- **AND** schedules next sync as normal

#### Scenario: Consecutive failure alerting

- **WHEN** consecutiveFailures exceeds threshold (e.g., 5)
- **THEN** the sync service logs warning for monitoring
- **AND** continues attempting syncs

---

### Requirement: Sync service verifies slot before booking confirmation

The sync service SHALL provide real-time slot verification for bookings.

#### Scenario: Verify slot availability

- **WHEN** booking flow calls `verifySlotAvailable(slotId)` before confirming
- **THEN** the sync service queries MRS directly for current slot status
- **AND** returns true only if slot exists and is available in MRS

#### Scenario: Slot no longer available

- **WHEN** verification shows slot is booked or deleted in MRS
- **THEN** verifySlotAvailable returns false
- **AND** booking flow can abort before creating appointment
