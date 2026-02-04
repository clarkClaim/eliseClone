# database-schema Specification

## Purpose

PostgreSQL schema implementation including all tables defined in the technical exploration document.

## ADDED Requirements

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
