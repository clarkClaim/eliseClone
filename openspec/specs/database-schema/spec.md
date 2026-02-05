# database-schema Specification

## Purpose

PostgreSQL schema implementation including all tables defined in the technical exploration document.

## Requirements

### Requirement: Database schema is managed with Prisma

The project SHALL use Prisma as the ORM with schema defined in prisma/schema.prisma.

#### Scenario: Developer runs migrations

- **WHEN** a developer runs `npx prisma migrate dev`
- **THEN** all pending migrations execute in order
- **AND** Prisma Client is regenerated with updated types

#### Scenario: Schema changes generate migrations

- **WHEN** a developer modifies prisma/schema.prisma
- **THEN** `npx prisma migrate dev` generates a new migration
- **AND** the migration SQL is stored in prisma/migrations/

---

### Requirement: Core entity tables exist

The database SHALL have tables for patients, providers, locations, and appointment_types.

#### Scenario: Patient data can be stored

- **WHEN** a patient record is synced from OpenMRS
- **THEN** it can be inserted into the patients table with mrs_id, name, dob, gender
- **AND** patient_phones stores associated phone numbers with lookup index

Note: tenant_id is deferred for simplicity. Schema is single-tenant for now.

#### Scenario: Provider data can be stored

- **WHEN** a provider record is synced from OpenMRS
- **THEN** it can be inserted into the providers table with mrs_id, name, and specialty

---

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

### Requirement: Waitlist table exists

The database SHALL have a waitlist_entries table for managing patients waiting for earlier appointments.

#### Scenario: Patient added to waitlist

- **WHEN** a patient requests to be notified of cancellations
- **THEN** a waitlist_entries record can be created with preferences and priority

---

### Requirement: Job queue table exists

The database SHALL have a jobs table for async task processing (reminders, sync, outbound calls).

#### Scenario: Job can be enqueued

- **WHEN** the system needs to schedule an async task
- **THEN** a job can be inserted with type, payload, status, and run_at timestamp

#### Scenario: Worker can claim jobs

- **WHEN** a worker polls for pending jobs
- **THEN** it can atomically claim a job using FOR UPDATE SKIP LOCKED

---

### Requirement: Conversation and audit tables exist

The database SHALL have tables for tracking conversations and escalations.

#### Scenario: Conversation can be logged

- **WHEN** a voice or chat conversation occurs
- **THEN** a conversations record stores channel, patient_id (if identified), and outcome

#### Scenario: Escalation can be recorded

- **WHEN** a conversation escalates to human
- **THEN** an escalations record captures reason, transfer status, and context summary

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

---

### Requirement: Optimistic locking prevents double-booking

The availability model SHALL have a version field for optimistic locking.

#### Scenario: Concurrent booking attempts

- **WHEN** two requests try to book the same slot simultaneously
- **THEN** only one succeeds (version check in transaction)
- **AND** the other receives an error message about the slot being modified

---

### Requirement: Job claiming uses atomic operations

The job queue SHALL support atomic job claiming to prevent duplicate processing.

#### Scenario: Multiple workers polling

- **WHEN** multiple workers poll for jobs simultaneously
- **THEN** each job is claimed by exactly one worker
- **AND** Prisma raw query with FOR UPDATE SKIP LOCKED handles atomicity

---

### Requirement: ScheduleTemplate model for availability patterns

The database SHALL include a ScheduleTemplate model for storing provider availability patterns.

```prisma
model ScheduleTemplate {
  id                String    @id @default(uuid())
  providerId        String    @map("provider_id")
  serviceId         String?   @map("service_id")
  dayOfWeek         Int       @map("day_of_week")
  startTime         String    @map("start_time")
  endTime           String    @map("end_time")
  slotDurationMins  Int       @default(30) @map("slot_duration_mins")
  effectiveFrom     DateTime  @default(now()) @map("effective_from")
  effectiveTo       DateTime? @map("effective_to")
  source            ScheduleSource @default(local)
  mrsServiceId      String?   @map("mrs_service_id")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  provider          Provider         @relation(fields: [providerId], references: [id])
  service           AppointmentType? @relation(fields: [serviceId], references: [id])

  @@unique([providerId, serviceId, dayOfWeek, effectiveFrom])
  @@index([providerId, dayOfWeek])
  @@map("schedule_templates")
}

enum ScheduleSource {
  local
  mrs_synced
  @@map("schedule_source")
}
```

#### Scenario: Schedule template unique constraint
- **WHEN** creating schedule template for provider + day + effective date
- **THEN** constraint prevents duplicate templates for same provider/day/date

#### Scenario: Schedule template provider relation
- **WHEN** schedule template references providerId
- **THEN** foreign key enforces provider exists

---

### Requirement: Appointment model supports datetime-based booking

The Appointment model SHALL support direct datetime fields without requiring slotId.

Changes:
- `slotId` becomes optional (nullable)
- Add `startTime` field (required)
- Add `endTime` field (required)
- Add `providerId` field (optional, direct reference)
- Add `serviceId` field (optional, direct reference)

#### Scenario: Create appointment without slot
- **WHEN** appointment is created with startTime and endTime
- **THEN** appointment is valid even without slotId
- **AND** times are stored directly on appointment

#### Scenario: Appointment with slot reference (legacy)
- **WHEN** appointment has slotId populated
- **THEN** slot relation still works
- **AND** appointment times may be derived from slot or stored directly

---

### Requirement: Availability model becomes optional

The Availability model MAY be deprecated for appointment-based MRS systems.

For Bahmni integration:
- Availability table is not required
- Availability is computed from ScheduleTemplate and Appointments
- Existing data can remain for reference or migration

#### Scenario: Booking without Availability table
- **WHEN** booking appointment with Bahmni
- **THEN** no Availability record is created or modified
- **AND** booking uses direct datetime on Appointment

---

### Requirement: Sync state table tracks rate limits

The sync_state table SHALL track MRS rate limit information.

#### Scenario: Rate limit tracking
- **WHEN** sync service tracks MRS rate limits
- **THEN** sync_state stores rateLimitRemaining (nullable int) and rateLimitResetAt (nullable timestamp)
- **AND** backoffUntil (nullable timestamp) for when rate limited

---

### Requirement: Job table categorizes MRS operations

The job table SHALL support categorization of MRS-related job types.

#### Scenario: Job categorization for MRS operations
- **WHEN** jobs are created for MRS operations
- **THEN** type values include: 'sync_patients', 'sync_providers', 'sync_availability', 'sync_appointments', 'push_appointment_to_mrs', 'push_cancellation_to_mrs'

---

### Requirement: MRS adapter configuration table exists

The database SHALL have an mrs_config table for storing per-tenant MRS connection settings.

#### Scenario: Store MRS credentials
- **WHEN** a tenant configures their MRS connection
- **THEN** mrs_config stores tenantId, systemType (enum: openmrs, epic, cerner, athena, openemr), baseUrl, and encrypted credentials

#### Scenario: Store MRS capabilities override
- **WHEN** MRS has non-standard capabilities
- **THEN** mrs_config can store capabilitiesOverride as JSON to override discovered capabilities

#### Scenario: Track MRS health
- **WHEN** health checks run
- **THEN** mrs_config stores lastHealthCheckAt, isHealthy (boolean), and avgLatencyMs
