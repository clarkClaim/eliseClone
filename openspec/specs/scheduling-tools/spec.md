# scheduling-tools Specification

## Purpose

VAPI tools for scheduling operations: checking availability, booking, cancelling, and waitlist management.

## Requirements

### Requirement: Check availability tool
The system SHALL provide a `check_availability` VAPI tool that queries available appointment slots.

The tool SHALL accept the following parameters:
- `date` (required): Date to check, supporting natural language ("tomorrow", "next Tuesday", "January 15th") and ISO format
- `provider_name` (optional): Provider name or "any" for any available provider
- `service_name` (optional): Service/appointment type name (e.g., "General Medicine")
- `time_of_day` (optional): "morning", "afternoon", or "any"

When MRS is available, the tool SHALL query O3 directly and compute availability from existing appointments.

#### Scenario: Check availability via MRS (primary path)
- **WHEN** tool is called with `date: "tomorrow"` and MRS is available
- **THEN** system queries O3 for existing appointments on that date
- **AND** computes open slots from service hours minus booked times
- **AND** returns slots with time, provider_name, and service details

#### Scenario: Check availability with provider preference
- **WHEN** tool is called with `date: "next Monday"` and `provider_name: "Dr. Smith"`
- **THEN** system filters results to only slots with matching provider

#### Scenario: Check availability with time preference
- **WHEN** tool is called with `date: "Friday"` and `time_of_day: "morning"`
- **THEN** system returns only slots before noon on Friday

#### Scenario: No availability found
- **WHEN** tool is called for a date with no open slots
- **THEN** system returns empty slots array with suggestion for next available date

#### Scenario: MRS unavailable fallback
- **WHEN** tool is called but MRS health check fails
- **THEN** system computes availability from local appointment cache
- **AND** includes warning that data may be stale

### Requirement: Book appointment tool
The system SHALL provide a `book_appointment` VAPI tool that books directly to O3 when available, with local fallback.

The tool SHALL accept the following parameters:
- `start_time` (required): ISO datetime or natural language time for the slot
- `service_id` (optional): Service UUID (defaults to General Medicine)
- `provider_id` (optional): Provider UUID
- `reason` (optional): Reason for the appointment

The tool SHALL retrieve patient context from the Conversation record.

#### Scenario: Successful booking via MRS (primary path)
- **WHEN** tool is called after patient identification and MRS is available
- **THEN** system calls `POST /appointment` on O3 with patient UUID and service
- **AND** caches appointment locally
- **AND** returns confirmation with date, time, provider, and `syncStatus: 'synced'`

#### Scenario: Booking conflict detected
- **WHEN** tool is called but O3 returns conflict (time already booked)
- **THEN** system returns error with available alternatives

#### Scenario: Patient not identified
- **WHEN** tool is called before patient has been identified in the conversation
- **THEN** system returns error indicating patient identification is required first

#### Scenario: MRS unavailable - local fallback with warning
- **WHEN** tool is called but MRS health check fails
- **THEN** system books locally to Postgres
- **AND** queues push job to sync to MRS when available
- **AND** returns confirmation with `syncStatus: 'pending'`
- **AND** message includes: "I've scheduled your appointment. You'll receive a confirmation text once our system syncs."

### Requirement: Get patient appointments tool
The system SHALL provide a `get_patient_appointments` VAPI tool that queries appointments from MRS when available.

The tool SHALL accept the following parameters:
- `include_past` (optional): Boolean to include past appointments, defaults to false

#### Scenario: Query appointments via MRS (primary path)
- **WHEN** tool is called for identified patient and MRS is available
- **THEN** system calls `POST /appointment/search` on O3 with patientUuid
- **AND** returns list of appointments with date, time, provider, service, status

#### Scenario: Patient has no appointments
- **WHEN** tool is called for a patient with no appointments in O3
- **THEN** system returns empty appointments array with appropriate message

#### Scenario: MRS unavailable fallback
- **WHEN** tool is called but MRS is unavailable
- **THEN** system queries local appointment cache
- **AND** includes warning that data may be incomplete

### Requirement: Cancel appointment tool
The system SHALL provide a `cancel_appointment` VAPI tool that cancels via MRS when available.

The tool SHALL accept the following parameters:
- `appointment_id` (required): UUID of the appointment to cancel
- `reason` (optional): Reason for cancellation

The tool SHALL verify the appointment belongs to the identified patient before cancelling.

#### Scenario: Successful cancellation via MRS
- **WHEN** tool is called with valid appointment UUID and MRS is available
- **THEN** system updates appointment status to "Cancelled" via O3 API
- **AND** updates local cache
- **AND** returns confirmation with `syncStatus: 'synced'`

#### Scenario: Appointment not found
- **WHEN** tool is called with non-existent appointment UUID
- **THEN** system returns error indicating appointment not found

#### Scenario: Appointment belongs to different patient
- **WHEN** tool is called with appointment belonging to different patient
- **THEN** system returns error indicating appointment not found (security)

#### Scenario: MRS unavailable - local cancellation with push
- **WHEN** tool is called but MRS is unavailable
- **THEN** system marks appointment cancelled locally
- **AND** queues push job to sync cancellation to MRS
- **AND** returns confirmation with `syncStatus: 'pending'`

### Requirement: Add to waitlist tool
The system SHALL provide an `add_to_waitlist` VAPI tool that adds the patient to a local waitlist for earlier openings.

The waitlist is local-only (not synced to MRS).

The tool SHALL accept the following parameters:
- `provider_name` (optional): Preferred provider or "any"
- `service_name` (optional): Preferred service type
- `preferred_date_start` (optional): Earliest acceptable date
- `preferred_date_end` (optional): Latest acceptable date
- `time_of_day` (optional): "morning", "afternoon", or "any"

#### Scenario: Add to waitlist with preferences
- **WHEN** tool is called with date range and provider preference
- **THEN** system creates waitlist entry locally and returns confirmation

#### Scenario: Patient already on waitlist
- **WHEN** tool is called for a patient with existing active waitlist entry
- **THEN** system updates existing entry with new preferences

### Requirement: Graceful MRS degradation
The system SHALL handle MRS unavailability transparently with clear patient communication.

#### Scenario: MRS health check on tool call
- **WHEN** any scheduling tool is called
- **THEN** system first checks MRS health via quick health check
- **AND** routes to MRS-first or local-fallback path accordingly

#### Scenario: MRS timeout handling
- **WHEN** MRS request exceeds 5 second timeout
- **THEN** system treats as unavailable and uses fallback path

#### Scenario: Push job creation for local bookings
- **WHEN** booking or cancellation happens locally due to MRS unavailability
- **THEN** system creates high-priority push job
- **AND** job will sync to MRS when connection restored

### Requirement: Background appointment prefetch
The system SHALL prefetch patient's appointments when a call connects.

#### Scenario: Call connect triggers prefetch
- **WHEN** VAPI sends `call-started` webhook event
- **THEN** system attempts to fetch today's appointments from O3 in background
- **AND** caches results locally for faster tool responses

#### Scenario: Prefetch does not block call
- **WHEN** appointment prefetch is triggered
- **THEN** webhook returns immediately without waiting for prefetch

#### Scenario: Prefetch failure is non-fatal
- **WHEN** prefetch fails (MRS unavailable)
- **THEN** system logs warning and continues without cached data

### Requirement: Seed data for offline development
The system SHALL provide seed data for development without O3 connectivity.

Seed data SHALL include:
- At least 2 providers matching O3 demo (Super User, Jake Doctor)
- At least 1 location (Outpatient Clinic)
- At least 2 services (General Medicine, Rehabilitation)
- Sample appointments for testing

#### Scenario: Seed script creates O3-compatible data
- **WHEN** `pnpm exec prisma db seed` is run
- **THEN** system creates providers, locations, and services matching O3 demo UUIDs

#### Scenario: Seed script is idempotent
- **WHEN** seed script is run multiple times
- **THEN** existing data is not duplicated (uses upsert)

### Requirement: VAPI assistant configuration
The system SHALL update the VAPI assistant configuration with scheduling tools.

#### Scenario: Setup script updates assistant
- **WHEN** `pnpm run setup:vapi` is run
- **THEN** VAPI assistant includes check_availability, book_appointment, get_patient_appointments, cancel_appointment, and add_to_waitlist tools

#### Scenario: System prompt includes scheduling guidance
- **WHEN** assistant configuration is loaded
- **THEN** system prompt instructs assistant on scheduling flow: identify patient first, then help with appointments
