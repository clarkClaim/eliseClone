# database-schema Specification (Delta)

## Purpose

Schema modifications to support MRS synchronization tracking and conflict logging.

## MODIFIED Requirements

### Requirement: Scheduling tables exist

The database SHALL have tables for availability and appointments with optimistic locking support.

#### Scenario: Time slots can be queried

- **WHEN** the agent checks availability
- **THEN** the availability table supports queries by provider, date range, and is_booked status
- **AND** each slot has a version column for optimistic locking

#### Scenario: Appointments can be booked

- **WHEN** an appointment is created
- **THEN** the appointments table stores patient_id, slot_id, status, and booking channel

#### Scenario: Availability tracks MRS existence

- **WHEN** a slot is synced from MRS
- **THEN** the availability table stores mrsExists flag (default true)
- **AND** mrsUpdatedAt timestamp for conflict detection

#### Scenario: Appointments track MRS sync status

- **WHEN** an appointment is created locally
- **THEN** the appointments table stores syncedToMrs (default false), syncedToMrsAt, lastSyncError, and syncAttempts
- **AND** mrsUpdatedAt for detecting MRS-side changes

---

### Requirement: Sync state table exists

The database SHALL have a sync_state table for tracking MRS synchronization progress.

#### Scenario: Sync progress is tracked

- **WHEN** a sync job completes
- **THEN** sync_state stores last_sync_at and status per entity type

#### Scenario: Sync observability fields

- **WHEN** sync state is queried for monitoring
- **THEN** sync_state provides nextSyncAt, lastSyncDuration (ms), recordsProcessed, and consecutiveFailures

---

## ADDED Requirements

### Requirement: Sync conflict table exists

The database SHALL have a sync_conflicts table for logging synchronization conflicts.

#### Scenario: Conflict can be logged

- **WHEN** a data conflict is detected during sync
- **THEN** a sync_conflicts record can be created with entityType, entityId, mrsId, conflictType, localState (JSON), mrsState (JSON), resolution, and detectedAt

#### Scenario: Conflict types are categorized

- **WHEN** logging a conflict
- **THEN** conflictType is one of: 'local_only', 'mrs_only', 'data_diverged', 'deleted_in_mrs'

#### Scenario: Conflict resolution is tracked

- **WHEN** a conflict is resolved
- **THEN** resolvedAt timestamp can be set
- **AND** resolution field describes action taken

---

### Requirement: Job table supports sync retry backoff

The job table SHALL have fields for exponential backoff retry.

#### Scenario: Job backoff tracking

- **WHEN** a sync retry job is created
- **THEN** it can store backoffExponent (default 1) and nextRetryAt timestamp

#### Scenario: Exponential backoff calculation

- **WHEN** a retry job fails
- **THEN** backoffExponent is incremented
- **AND** nextRetryAt is calculated as now + (base_delay * 2^backoffExponent)
