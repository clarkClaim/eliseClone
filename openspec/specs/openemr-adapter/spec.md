# openemr-adapter Specification

## Purpose

OpenEMR adapter implementation for the MRS integration layer, providing patient, appointment, and provider operations via the OpenEMR REST and FHIR APIs.

## Requirements

### Requirement: OpenEMR adapter implements MRSAdapter interface

The OpenEMR adapter SHALL implement the `MRSAdapter` interface defined in `src/mrs/adapter.ts`, providing full compatibility with the existing adapter abstraction.

#### Scenario: Adapter instantiation from environment
- **WHEN** `OpenEMRAdapter.fromEnv()` is called
- **THEN** adapter is created using `OPENEMR_URL`, `OPENEMR_CLIENT_ID`, `OPENEMR_CLIENT_SECRET`, `OPENEMR_USERNAME`, and `OPENEMR_PASSWORD` environment variables

#### Scenario: Adapter instantiation from config
- **WHEN** `new OpenEMRAdapter(config)` is called with a configuration object
- **THEN** adapter is created with the provided URL, OAuth credentials, and username/password

### Requirement: OpenEMR adapter authenticates via OAuth 2.0 password grant

The adapter SHALL authenticate to OpenEMR using OAuth 2.0 password grant flow, acquiring and managing access tokens automatically.

#### Scenario: Initial connection establishes OAuth session
- **WHEN** `adapter.connect()` is called
- **THEN** adapter acquires an access token using password grant with configured credentials
- **THEN** adapter validates the token by making a test API call

#### Scenario: Token refresh on expiration
- **WHEN** an API request fails with 401 Unauthorized
- **THEN** adapter attempts to refresh the access token
- **THEN** adapter retries the original request with the new token

#### Scenario: Connection failure with invalid credentials
- **WHEN** `adapter.connect()` is called with invalid credentials
- **THEN** adapter throws `MRSAuthenticationError` with descriptive message

### Requirement: OpenEMR adapter supports patient search

The adapter SHALL support searching for patients by name and phone number via the OpenEMR API.

#### Scenario: Search patients by name
- **WHEN** `adapter.searchPatients({ name: "John Smith" })` is called
- **THEN** adapter queries OpenEMR `/api/patient` endpoint with name filter
- **THEN** adapter returns array of `MRSPatient` objects with matching patients

#### Scenario: Search patients by phone
- **WHEN** `adapter.searchPatients({ phone: "555-1234" })` is called
- **THEN** adapter queries OpenEMR FHIR `/fhir/Patient` endpoint with phone parameter
- **THEN** adapter returns array of `MRSPatient` objects with matching patients

#### Scenario: Search returns empty results
- **WHEN** `adapter.searchPatients({ name: "NonExistent" })` is called and no patients match
- **THEN** adapter returns empty array

### Requirement: OpenEMR adapter supports patient retrieval

The adapter SHALL support retrieving individual patients by their OpenEMR patient ID.

#### Scenario: Get patient by ID
- **WHEN** `adapter.getPatient(patientUuid)` is called with a valid UUID
- **THEN** adapter returns `MRSPatient` with mapped fields (name, DOB, phone numbers, gender)

#### Scenario: Get patient not found
- **WHEN** `adapter.getPatient(invalidUuid)` is called with non-existent UUID
- **THEN** adapter returns `null`

### Requirement: OpenEMR adapter supports patient creation

The adapter SHALL support creating new patients in OpenEMR via the standard API.

#### Scenario: Create patient with required fields
- **WHEN** `adapter.createPatient({ givenName: "Jane", familyName: "Doe", dateOfBirth: new Date("1990-01-15") })` is called
- **THEN** adapter POSTs to OpenEMR `/api/patient` endpoint
- **THEN** adapter returns `MRSPatient` with the new patient's UUID populated

#### Scenario: Create patient with phone number
- **WHEN** `adapter.createPatient({ givenName: "Jane", familyName: "Doe", dateOfBirth: new Date("1990-01-15"), phone: "555-9876" })` is called
- **THEN** adapter creates patient with phone number as contact info
- **THEN** returned `MRSPatient.phoneNumbers` contains the phone number

#### Scenario: Create patient validation error
- **WHEN** `adapter.createPatient()` is called with missing required fields
- **THEN** adapter throws `MRSValidationError` with field-specific error message

### Requirement: OpenEMR adapter supports appointment retrieval

The adapter SHALL support querying appointments by date range, patient, and provider.

#### Scenario: Get appointments by date range
- **WHEN** `adapter.getAppointments({ startDate: today, endDate: nextWeek })` is called
- **THEN** adapter queries OpenEMR `/api/appointment` endpoint
- **THEN** adapter returns array of `MRSAppointment` objects within the date range

#### Scenario: Get appointments by patient
- **WHEN** `adapter.getAppointments({ patientMrsId: "uuid", startDate, endDate })` is called
- **THEN** adapter queries OpenEMR `/api/patient/{pid}/appointment` endpoint
- **THEN** adapter returns only appointments for the specified patient

#### Scenario: Map appointment status codes
- **WHEN** adapter retrieves appointments with various `pc_apptstatus` values
- **THEN** adapter maps OpenEMR status codes to `MRSAppointmentStatus` enum values:
  - `-` → `scheduled`
  - `@` → `arrived`
  - `>` → `in_service`
  - `<` → `completed`
  - `x` → `cancelled`
  - `?` → `no_show`

### Requirement: OpenEMR adapter supports appointment creation

The adapter SHALL support booking appointments via the OpenEMR standard API.

#### Scenario: Create appointment with required fields
- **WHEN** `adapter.createAppointment({ patientMrsId, startDateTime, endDateTime, serviceId })` is called
- **THEN** adapter POSTs to OpenEMR `/api/patient/{pid}/appointment` endpoint
- **THEN** adapter returns `MRSAppointment` with the new appointment's ID populated

#### Scenario: Create appointment with provider and location
- **WHEN** `adapter.createAppointment({ patientMrsId, startDateTime, endDateTime, serviceId, providerId, locationId })` is called
- **THEN** appointment is created with `pc_aid` set to provider ID and `pc_facility` set to location ID

#### Scenario: Appointment creation maps datetime to OpenEMR format
- **WHEN** `adapter.createAppointment()` is called with `startDateTime` and `endDateTime`
- **THEN** adapter converts to `pc_eventDate` (YYYY-MM-DD), `pc_startTime` (HH:MM), and `pc_duration` (seconds)

### Requirement: OpenEMR adapter supports appointment cancellation

The adapter SHALL support cancelling appointments via the OpenEMR API.

#### Scenario: Cancel existing appointment
- **WHEN** `adapter.cancelAppointment(appointmentId, "Patient requested")` is called
- **THEN** adapter DELETEs the appointment via OpenEMR API
- **THEN** operation completes without error

#### Scenario: Cancel non-existent appointment
- **WHEN** `adapter.cancelAppointment(invalidId)` is called
- **THEN** adapter throws `NotFoundError`

### Requirement: OpenEMR adapter supports conflict detection

The adapter SHALL check for scheduling conflicts before booking appointments.

#### Scenario: No conflict detected
- **WHEN** `adapter.checkConflicts({ startDateTime, endDateTime, providerId })` is called for an open time slot
- **THEN** adapter returns `{ hasConflict: false }`

#### Scenario: Conflict detected with existing appointment
- **WHEN** `adapter.checkConflicts({ startDateTime, endDateTime, providerId })` is called and an appointment overlaps
- **THEN** adapter returns `{ hasConflict: true, conflictingAppointments: [...], reason: "..." }`

### Requirement: OpenEMR adapter provides health check

The adapter SHALL provide health check functionality to verify OpenEMR connectivity.

#### Scenario: Health check when connected
- **WHEN** `adapter.healthCheck()` is called and OpenEMR is reachable
- **THEN** adapter returns `{ healthy: true, latencyMs: <number> }`

#### Scenario: Health check when disconnected
- **WHEN** `adapter.healthCheck()` is called and OpenEMR is unreachable
- **THEN** adapter returns `{ healthy: false, latencyMs: <number> }`

### Requirement: OpenEMR adapter supports provider and location queries

The adapter SHALL support querying providers and locations from OpenEMR.

#### Scenario: Get all providers
- **WHEN** `adapter.getProviders()` is called
- **THEN** adapter queries OpenEMR FHIR `/fhir/Practitioner` endpoint
- **THEN** adapter returns array of `MRSProvider` objects

#### Scenario: Get all locations
- **WHEN** `adapter.getLocations()` is called
- **THEN** adapter queries OpenEMR `/api/facility` or FHIR `/fhir/Location` endpoint
- **THEN** adapter returns array of `MRSLocation` objects

### Requirement: OpenEMR adapter supports appointment types

The adapter SHALL support querying appointment categories from OpenEMR.

#### Scenario: Get appointment types
- **WHEN** `adapter.getAppointmentTypes()` is called
- **THEN** adapter queries OpenEMR `/api/list/apptcat` endpoint
- **THEN** adapter returns array of `MRSAppointmentType` objects with `mrsId`, `name`, and `durationMinutes`

### Requirement: OpenEMR adapter declares accurate capabilities

The adapter SHALL expose capabilities reflecting OpenEMR's actual API support.

#### Scenario: Capabilities reflect search support
- **WHEN** `adapter.capabilities.patientSearch` is accessed
- **THEN** values reflect: `byPhone: true`, `byName: true`, `byDOB: true`, `byIdentifier: true`

#### Scenario: Capabilities reflect scheduling model
- **WHEN** `adapter.capabilities.scheduling` is accessed
- **THEN** values reflect: `model: 'appointment_based'`, `supportsScheduleConfig: false`, `requiresServiceId: true`

#### Scenario: Capabilities reflect sync limitations
- **WHEN** `adapter.capabilities.sync` is accessed
- **THEN** values reflect: `supportsIncrementalSync: false`, `supportsWebhooks: false`
