# bahmni-appointments-api Specification

## Purpose

Defines how the OpenMRS adapter integrates with the Bahmni Appointments module API, which differs from the legacy appointmentscheduling module.

## Requirements

### Requirement: Adapter uses Bahmni appointment services endpoint

The OpenMRS adapter SHALL retrieve appointment types from the Bahmni `/appointmentService/all/full` endpoint instead of the legacy `/appointmentscheduling/appointmenttype` endpoint.

#### Scenario: Get appointment types from O3
- **WHEN** `getAppointmentTypes()` is called
- **THEN** adapter calls `GET /ws/rest/v1/appointmentService/all/full`
- **THEN** returns array of `MRSAppointmentType` mapped from appointment services

#### Scenario: Map service to appointment type
- **WHEN** Bahmni returns an appointment service with `uuid`, `name`, and `serviceTypes`
- **THEN** adapter maps it to `MRSAppointmentType` with `mrsId` = service UUID

### Requirement: Adapter retrieves appointments via Bahmni search endpoint

The OpenMRS adapter SHALL retrieve appointments using `POST /appointment/search` with filter criteria instead of the legacy endpoint.

#### Scenario: Get appointments with date filter
- **WHEN** `getAppointments({ startDate, endDate })` is called
- **THEN** adapter calls `POST /ws/rest/v1/appointment/search` with `{ startDate, endDate }` body
- **THEN** returns array of `MRSAppointment` mapped from Bahmni response

#### Scenario: Get appointments with patient filter
- **WHEN** `getAppointments({ patientMrsId })` is called
- **THEN** adapter includes `patientUuid` in the search request body

#### Scenario: Get appointments with provider filter
- **WHEN** `getAppointments({ providerMrsId })` is called
- **THEN** adapter includes `providerUuid` in the search request body

### Requirement: Adapter creates appointments via Bahmni endpoint

The OpenMRS adapter SHALL create appointments using `POST /appointment` with the Bahmni payload format.

#### Scenario: Create appointment with required fields
- **WHEN** `createAppointment()` is called with patient, service, start time, end time, and location
- **THEN** adapter calls `POST /ws/rest/v1/appointment` with Bahmni format payload
- **THEN** returns created `MRSAppointment`

#### Scenario: Appointment creation payload format
- **WHEN** creating an appointment
- **THEN** payload includes `patientUuid`, `serviceUuid`, `startDateTime`, `endDateTime`, `appointmentKind`, `locationUuid`

#### Scenario: Include provider in appointment
- **WHEN** `createAppointment()` includes a provider
- **THEN** payload includes `providers: [{ uuid: providerUuid }]`

### Requirement: Adapter cancels appointments via status update

The OpenMRS adapter SHALL cancel appointments by updating the appointment status to "Cancelled".

#### Scenario: Cancel appointment
- **WHEN** `cancelAppointment(mrsId, reason)` is called
- **THEN** adapter updates the appointment status to "Cancelled"

### Requirement: Adapter maps Bahmni appointment status values

The OpenMRS adapter SHALL correctly map between internal status values and Bahmni status values.

#### Scenario: Map Bahmni status to internal
- **WHEN** Bahmni returns appointment with status "CheckedIn"
- **THEN** adapter maps to internal status "checked_in"

#### Scenario: Status mapping table
- **WHEN** mapping statuses
- **THEN** uses: Scheduled↔scheduled, CheckedIn↔checked_in, Completed↔completed, Cancelled↔cancelled, Missed↔missed

### Requirement: Adapter detects Bahmni module availability

The OpenMRS adapter SHALL probe for Bahmni appointments module instead of legacy module.

#### Scenario: Probe for Bahmni endpoint on connect
- **WHEN** `connect()` is called
- **THEN** adapter probes `GET /ws/rest/v1/appointment/all` (or similar Bahmni endpoint)
- **THEN** sets `appointmentModuleAvailable` based on response

#### Scenario: Graceful fallback when module unavailable
- **WHEN** Bahmni endpoint returns 404 or error
- **THEN** adapter sets `appointmentModuleAvailable = false`
- **THEN** appointment operations return empty results instead of throwing

### Requirement: Adapter handles service-based availability

The OpenMRS adapter SHALL retrieve availability from appointment service configuration instead of discrete timeslots.

#### Scenario: Get availability returns service windows
- **WHEN** `getAvailability(dateRange)` is called
- **THEN** adapter retrieves appointment services with their `weeklyAvailability`
- **THEN** returns availability windows (not discrete slots)

#### Scenario: No slot verification needed
- **WHEN** creating an appointment
- **THEN** adapter does NOT call a slot verification endpoint (slots don't exist in Bahmni)
- **THEN** appointment is created with specified start/end time directly
