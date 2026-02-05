## MODIFIED Requirements

### Requirement: MRS adapter interface defines appointment operations

The adapter SHALL expose methods for managing appointments via the **Bahmni Appointments API** (not the legacy appointmentscheduling module).

#### Scenario: Search appointments with filters
- **WHEN** `searchAppointments(params)` is called with optional patientUuid, serviceUuid, providerUuid, startDate, endDate, status
- **THEN** the adapter calls `POST /appointment/search` on O3
- **AND** returns an array of Appointment objects matching the filter criteria

#### Scenario: Create appointment in MRS
- **WHEN** `createAppointment(data)` is called with patientUuid, serviceUuid, startDateTime, endDateTime, locationUuid, and optional providers
- **THEN** the adapter calls `POST /appointment` on O3 with Bahmni format
- **AND** returns the created Appointment object with mrsId (UUID) populated

#### Scenario: Cancel appointment in MRS
- **WHEN** `cancelAppointment(uuid, reason)` is called
- **THEN** the adapter updates appointment status to "Cancelled" via Bahmni API
- **AND** throws an error if appointment not found

### Requirement: MRS adapter interface defines availability operations

The adapter SHALL compute availability dynamically from appointment services and existing appointments (Bahmni has no pre-defined slots).

#### Scenario: Get services (replaces appointment types)
- **WHEN** `getServices()` is called
- **THEN** the adapter calls `GET /appointmentService/all/full` on O3
- **AND** returns array of Service objects with uuid, name, durationMins, and serviceTypes

#### Scenario: Compute availability for date
- **WHEN** `getAvailability(date, options)` is called with date and optional providerId/serviceId
- **THEN** the adapter queries existing appointments for that date via `POST /appointment/search`
- **AND** computes open slots by subtracting booked times from service hours (default 9am-5pm)
- **AND** returns array of computed Slot objects with startTime, endTime, providerId, serviceId

#### Scenario: Verify slot still available
- **WHEN** `verifySlotAvailable(date, startTime, endTime, serviceId)` is called
- **THEN** the adapter checks for conflicting appointments at that time
- **AND** returns `{ available: true }` if no conflict, `{ available: false }` if conflict exists

## ADDED Requirements

### Requirement: MRS adapter connects to O3 public demo

The adapter SHALL connect to the public O3 demo at `o3.openmrs.org` by default.

#### Scenario: Default O3 connection
- **WHEN** adapter is instantiated without explicit URL
- **THEN** it connects to `https://o3.openmrs.org/openmrs/ws/rest/v1`
- **AND** uses Basic Auth with configured credentials (default: admin/Admin123 for demo)

#### Scenario: Custom MRS URL
- **WHEN** `OPENMRS_URL` environment variable is set
- **THEN** adapter uses the custom URL instead of default

### Requirement: MRS adapter handles Bahmni appointment data format

The adapter SHALL transform Bahmni-specific appointment format to canonical types.

#### Scenario: Appointment data transformation
- **WHEN** Bahmni returns appointment with `service` object
- **THEN** adapter maps `service.uuid` to appointmentTypeId
- **AND** maps `service.name` to appointmentType name
- **AND** maps `startDateTime`/`endDateTime` (epoch ms) to Date objects

#### Scenario: Provider array handling
- **WHEN** Bahmni appointment has `providers` array
- **THEN** adapter extracts primary provider (first with status "ACCEPTED")
- **AND** maps to providerId
