# scheduling-model Specification

## Purpose

Defines the local scheduling model with schedule templates, computed availability, and datetime-based appointments.

## Requirements

### Requirement: ScheduleTemplate defines provider availability patterns
The system SHALL store schedule templates that define when providers/services are available.

A ScheduleTemplate SHALL have:
- `providerId`: Which provider this schedule applies to
- `serviceId`: Optional service/appointment type restriction
- `dayOfWeek`: Day of week (0=Sunday through 6=Saturday)
- `startTime`: Start time as HH:MM string (e.g., "09:00")
- `endTime`: End time as HH:MM string (e.g., "17:00")
- `slotDuration`: Duration in minutes for generated time windows
- `effectiveFrom`: When this schedule starts being valid
- `effectiveTo`: Optional end date for the schedule
- `source`: Whether synced from MRS or configured locally

#### Scenario: Schedule template defines weekday hours
- **WHEN** a schedule template exists with providerId="dr-smith", dayOfWeek=1 (Monday), startTime="09:00", endTime="17:00", slotDuration=30
- **THEN** availability computation for Monday generates 30-minute windows from 9am to 5pm for Dr. Smith

#### Scenario: Multiple templates for different days
- **WHEN** provider has templates for Monday (9-5), Wednesday (9-5), Friday (9-3)
- **THEN** availability computation uses the correct template for each day
- **AND** days without templates show no availability

#### Scenario: Template with effective dates
- **WHEN** template has effectiveFrom="2024-03-01" and effectiveTo="2024-06-30"
- **THEN** template is only used for dates within that range

### Requirement: Appointment stores booking with direct datetime fields
The system SHALL store appointments with direct start/end times, not requiring a slot reference.

An Appointment SHALL have:
- `patientId`: The patient who booked
- `providerId`: Optional provider for the appointment
- `serviceId`: Optional service/appointment type
- `startTime`: Appointment start datetime
- `endTime`: Appointment end datetime
- `status`: Current appointment status
- `mrsId`: Optional MRS appointment identifier (if synced)
- `slotId`: Optional slot reference (for legacy/migration only)

#### Scenario: Create appointment with datetime only
- **WHEN** appointment is created with startTime=2024-03-15T09:00, endTime=2024-03-15T09:30
- **THEN** appointment is stored without requiring slotId
- **AND** appointment times are used for conflict detection

#### Scenario: Appointment with MRS sync
- **WHEN** appointment is created via MRS
- **THEN** mrsId is populated with MRS appointment identifier
- **AND** local times match MRS times

### Requirement: Availability is computed, not stored
The system SHALL compute availability dynamically from schedule templates minus appointments.

#### Scenario: Compute availability for a date
- **WHEN** availability is requested for 2024-03-15 (Friday)
- **THEN** system finds schedule template for Friday
- **AND** generates time windows based on template (e.g., 9:00, 9:30, 10:00, ...)
- **AND** removes windows that overlap with existing appointments
- **AND** returns remaining windows as available times

#### Scenario: No template for requested date
- **WHEN** availability is requested for a date with no schedule template
- **THEN** system returns empty availability (provider not working)

#### Scenario: Partially booked day
- **WHEN** schedule template allows 9am-5pm and appointments exist at 10:00 and 14:00
- **THEN** availability includes 9:00, 9:30, 10:30, 11:00, ... (all windows except 10:00 and 14:00)

### Requirement: AvailabilityService provides computed availability
The system SHALL provide an AvailabilityService that computes available time windows.

#### Scenario: Get availability with provider filter
- **WHEN** `getAvailability(date, { providerId: "dr-smith" })` is called
- **THEN** returns available windows for Dr. Smith only

#### Scenario: Get availability with service filter
- **WHEN** `getAvailability(date, { serviceId: "checkup" })` is called
- **THEN** returns windows for providers offering that service

#### Scenario: Check specific time availability
- **WHEN** `isTimeAvailable(startTime, endTime, providerId)` is called
- **THEN** returns true if no conflicting appointments exist
- **AND** returns false if an overlapping appointment exists

#### Scenario: Custom slot duration
- **WHEN** `getAvailability(date, { slotDuration: 60 })` is called
- **THEN** generates 60-minute windows instead of template default
