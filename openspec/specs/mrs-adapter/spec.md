# mrs-adapter Specification

## Purpose

Abstract interface for medical record system integration. Defines standard operations for any MRS implementation.

## Requirements

### Requirement: MRS adapter interface defines patient operations

The adapter SHALL expose methods for retrieving and searching patient records.

#### Scenario: Get patient by ID

- **WHEN** `getPatient(mrsId)` is called with a valid MRS patient ID
- **THEN** the adapter returns a Patient object with id, mrsId, name, dateOfBirth, gender, and phoneNumbers
- **AND** returns null if patient not found

#### Scenario: Search patients by query

- **WHEN** `searchPatients(query)` is called with name or phone number
- **THEN** the adapter returns an array of matching Patient objects
- **AND** returns empty array if no matches

---

### Requirement: MRS adapter interface defines provider operations

The adapter SHALL expose methods for retrieving provider records.

#### Scenario: Get provider by ID

- **WHEN** `getProvider(mrsId)` is called with a valid MRS provider ID
- **THEN** the adapter returns a Provider object with id, mrsId, name, and specialty
- **AND** returns null if provider not found

#### Scenario: List all providers

- **WHEN** `getProviders()` is called
- **THEN** the adapter returns an array of all Provider objects

---

### Requirement: MRS adapter interface defines appointment operations

The adapter SHALL expose methods for managing appointments.

#### Scenario: Get appointments with filter

- **WHEN** `getAppointments(filter)` is called with date range and optional provider/patient filter
- **THEN** the adapter returns an array of Appointment objects within the filter criteria

#### Scenario: Create appointment in MRS

- **WHEN** `createAppointment(appointment)` is called with patient, provider, slot, and type
- **THEN** the adapter creates the appointment in the MRS
- **AND** returns the created Appointment object with mrsId populated

#### Scenario: Cancel appointment in MRS

- **WHEN** `cancelAppointment(mrsId, reason)` is called
- **THEN** the adapter cancels the appointment in the MRS
- **AND** throws an error if appointment not found or already cancelled

---

### Requirement: MRS adapter interface defines availability operations

The adapter SHALL expose methods for retrieving available slots.

#### Scenario: Get availability for provider

- **WHEN** `getAvailability(providerId, dateRange)` is called
- **THEN** the adapter returns an array of Slot objects with startTime, endTime, and booked status

---

### Requirement: MRS adapter handles authentication

The adapter SHALL manage authentication with the MRS.

#### Scenario: Authentication credentials configured

- **WHEN** the adapter is instantiated
- **THEN** it reads credentials from environment variables (MRS-specific)
- **AND** authenticates on first request

#### Scenario: Authentication failure

- **WHEN** credentials are invalid or expired
- **THEN** the adapter throws an AuthenticationError with details
- **AND** does not retry with same credentials

---

### Requirement: MRS adapter transforms data to canonical format

The adapter SHALL transform MRS-specific data structures to canonical application types.

#### Scenario: Patient data transformation

- **WHEN** MRS returns patient data in MRS-specific format
- **THEN** the adapter maps it to canonical Patient type
- **AND** preserves mrsId for future reference

#### Scenario: Appointment data transformation

- **WHEN** MRS returns appointment data
- **THEN** the adapter maps status values to canonical AppointmentStatus enum
- **AND** maps provider and patient references to their mrsIds

---

### Requirement: MRS adapter interface defines patient write operations

The MRSAdapter interface SHALL expose methods for creating patients in the MRS.

#### Scenario: createPatient method signature
- **WHEN** the MRSAdapter interface is defined
- **THEN** it includes `createPatient(patient: NewPatient): Promise<MRSPatient>`
- **AND** NewPatient type includes givenName, familyName, dateOfBirth (required)
- **AND** NewPatient type includes gender, phone, phoneType (optional)

#### Scenario: NewPatient type definition
- **WHEN** creating a patient via the adapter
- **THEN** the NewPatient type SHALL have:
  - givenName: string (required)
  - familyName: string (required)
  - dateOfBirth: Date (required)
  - gender: string (optional)
  - phone: string (optional)
  - phoneType: 'mobile' | 'home' (optional)

---

### Requirement: OpenMRS adapter implements patient creation

The OpenMRS adapter SHALL implement createPatient using the OpenMRS REST API.

#### Scenario: Create patient API call
- **WHEN** `createPatient()` is called
- **THEN** the adapter calls `POST /patient` with JSON payload
- **AND** the payload includes nested person object with names and birthdate
- **AND** the payload includes identifiers array with generated identifier

#### Scenario: Person payload structure
- **WHEN** building the patient creation payload
- **THEN** person.names array contains one entry with givenName, familyName, preferred=true
- **AND** person.gender is set if provided (M, F, or O)
- **AND** person.birthdate is formatted as YYYY-MM-DD

#### Scenario: Phone as person attribute
- **WHEN** patient has a phone number
- **THEN** person.attributes array contains phone attribute
- **AND** attributeType uses UUID from OPENMRS_PHONE_ATTR_UUID env var
- **AND** value is the phone number string

#### Scenario: Identifier generation
- **WHEN** creating patient identifiers
- **THEN** identifier is a valid Luhn Mod-30 format (7 characters)
- **AND** identifierType uses UUID from OPENMRS_IDENTIFIER_TYPE_UUID env var
- **AND** location uses UUID from OPENMRS_IDENTIFIER_LOCATION_UUID env var

#### Scenario: Response mapping
- **WHEN** OpenMRS returns the created patient
- **THEN** the adapter maps response.uuid to MRSPatient.mrsId
- **AND** maps person.preferredName to givenName/familyName
- **AND** maps person.birthdate to dateOfBirth

---

### Requirement: MRS Adapter Interface

The system SHALL define an abstract `MRSAdapter` interface that all MRS implementations MUST implement. The interface SHALL support connection management, read operations for syncing, write operations for booking, and real-time validation.

#### Scenario: Adapter implements required interface
- **WHEN** a new MRS adapter is created (e.g., OpenMRSAdapter)
- **THEN** it MUST implement all methods defined in MRSAdapter interface
- **AND** it MUST provide a valid MRSCapabilities object describing its capabilities

#### Scenario: Adapter exposes system type
- **WHEN** an adapter is instantiated
- **THEN** it SHALL expose a `systemType` property identifying the MRS (e.g., 'openmrs', 'epic', 'cerner')

---

### Requirement: Capability Discovery

The system SHALL provide capability discovery so consuming code can check what operations an MRS supports before attempting them. Capabilities SHALL include patient search methods, appointment operations, sync support, and rate limits.

#### Scenario: Check patient search capabilities
- **WHEN** code needs to search for patients
- **THEN** it SHALL check `adapter.capabilities.patientSearch.byPhone` (or byName, byDOB, byIdentifier)
- **AND** only attempt search methods the MRS supports

#### Scenario: Check appointment write capabilities
- **WHEN** code needs to create/cancel/reschedule an appointment
- **THEN** it SHALL check `adapter.capabilities.appointments.canCreate` (or canCancel, canReschedule)
- **AND** fail gracefully with clear error if capability is false

#### Scenario: Check rate limit configuration
- **WHEN** sync service plans requests
- **THEN** it SHALL read `adapter.capabilities.rateLimits` to respect documented limits
- **AND** use conservative defaults when limits are null (unknown)

---

### Requirement: Connection Management

The adapter SHALL provide methods for establishing and terminating connections to the MRS, and for checking connection health.

#### Scenario: Connect to MRS
- **WHEN** `adapter.connect()` is called
- **THEN** the adapter SHALL authenticate with the MRS using configured credentials
- **AND** throw an error with details if connection fails

#### Scenario: Health check
- **WHEN** `adapter.healthCheck()` is called
- **THEN** it SHALL return `{ healthy: boolean, latencyMs: number }`
- **AND** healthy SHALL be false if MRS is unreachable or authentication failed

#### Scenario: Disconnect from MRS
- **WHEN** `adapter.disconnect()` is called
- **THEN** any open connections or sessions SHALL be cleanly closed

---

### Requirement: Read Operations for Sync

The adapter SHALL provide methods to read patients, providers, locations, appointment types, availability (time slots), and appointments from the MRS.

#### Scenario: Get patients
- **WHEN** `adapter.getPatients()` is called
- **THEN** it SHALL return an array of MRSPatient objects
- **AND** support optional `since` parameter for incremental sync (if capability allows)
- **AND** support optional `limit` parameter for pagination

#### Scenario: Get providers
- **WHEN** `adapter.getProviders()` is called
- **THEN** it SHALL return an array of MRSProvider objects with uuid, name, and specialty

#### Scenario: Get appointments
- **WHEN** `adapter.getAppointments(dateRange)` is called
- **THEN** it SHALL return appointments within the date range
- **AND** include patient, slot, status, and reason fields

---

### Requirement: Adapter computes availability via conflict checking

The adapter SHALL compute availability via conflict checking, not slot queries.

#### Scenario: Check conflicts replaces slot verification
- **WHEN** booking flow needs to verify time is available
- **THEN** it calls `checkConflicts()` with datetime range
- **AND** does NOT call `verifySlotAvailable()` (deprecated)

#### Scenario: Availability comes from Core, not MRS
- **WHEN** user asks for available times
- **THEN** Core computes availability from ScheduleTemplate and Appointments
- **AND** does NOT call adapter's `getAvailability()` method

---

### Requirement: Write Operations for Booking

The adapter SHALL provide methods to create appointments, cancel appointments, and update appointment status in the MRS.

#### Scenario: Create appointment
- **WHEN** `adapter.createAppointment(request)` is called with valid slot, patient, and type
- **THEN** it SHALL create the appointment in the MRS
- **AND** return the created MRSAppointment with its UUID

#### Scenario: Create appointment - slot taken
- **WHEN** `adapter.createAppointment(request)` is called but slot was just booked
- **THEN** it SHALL throw a `SlotConflictError` indicating the slot is no longer available

#### Scenario: Cancel appointment
- **WHEN** `adapter.cancelAppointment(mrsId, reason)` is called
- **THEN** it SHALL update the appointment status to CANCELLED in MRS
- **AND** set the cancel reason if provided

#### Scenario: Update appointment status
- **WHEN** `adapter.updateAppointmentStatus(mrsId, status)` is called
- **THEN** it SHALL update the appointment to the new status
- **AND** throw error if status transition is invalid

---

### Requirement: OpenMRS Adapter Implementation

The system SHALL provide a concrete OpenMRSAdapter that implements MRSAdapter for OpenMRS REST API with the appointment scheduling module.

#### Scenario: OpenMRS authentication
- **WHEN** OpenMRSAdapter connects
- **THEN** it SHALL use Basic Authentication with base64 encoded credentials
- **AND** validate connection by fetching session info

#### Scenario: OpenMRS capability configuration
- **WHEN** OpenMRSAdapter is created
- **THEN** capabilities SHALL reflect OpenMRS limitations:
  - `patientSearch.byPhone: false`
  - `sync.hasModifiedSinceQuery: false`
  - `appointments.canReschedule: false`

#### Scenario: OpenMRS appointment creation
- **WHEN** createAppointment is called on OpenMRSAdapter
- **THEN** it SHALL POST to `/appointmentscheduling/appointment`
- **AND** include timeSlot UUID, patient UUID, appointmentType UUID, and status

---

### Requirement: Error Handling

The adapter SHALL define typed errors for common failure modes and handle MRS-specific errors appropriately.

#### Scenario: Authentication error
- **WHEN** MRS returns 401 Unauthorized
- **THEN** adapter SHALL throw `MRSAuthenticationError` with details

#### Scenario: Rate limit error
- **WHEN** MRS returns 429 Too Many Requests
- **THEN** adapter SHALL throw `MRSRateLimitError` with retry-after if available

#### Scenario: Network timeout
- **WHEN** MRS request times out
- **THEN** adapter SHALL throw `MRSTimeoutError` with the operation that failed

#### Scenario: Unexpected MRS error
- **WHEN** MRS returns unexpected error
- **THEN** adapter SHALL throw `MRSError` with status code and response body

---

### Requirement: MRS adapter interface defines appointment operations via Bahmni API

The adapter SHALL expose methods for managing appointments via the **Bahmni Appointments API** (not the legacy appointmentscheduling module).

#### Scenario: Search appointments with filters
- **WHEN** `searchAppointments(params)` is called with optional patientUuid, serviceUuid, providerUuid, startDate, endDate, status
- **THEN** the adapter calls `POST /appointment/search` on O3
- **AND** returns an array of Appointment objects matching the filter criteria

#### Scenario: Create appointment in MRS via Bahmni
- **WHEN** `createAppointment(data)` is called with patientUuid, serviceUuid, startDateTime, endDateTime, locationUuid, and optional providers
- **THEN** the adapter calls `POST /appointment` on O3 with Bahmni format
- **AND** returns the created Appointment object with mrsId (UUID) populated

#### Scenario: Cancel appointment in MRS via Bahmni
- **WHEN** `cancelAppointment(uuid, reason)` is called
- **THEN** the adapter updates appointment status to "Cancelled" via Bahmni API
- **AND** throws an error if appointment not found

---

### Requirement: MRS adapter computes availability dynamically

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

---

### Requirement: MRS adapter connects to O3 public demo

The adapter SHALL connect to the public O3 demo at `o3.openmrs.org` by default.

#### Scenario: Default O3 connection
- **WHEN** adapter is instantiated without explicit URL
- **THEN** it connects to `https://o3.openmrs.org/openmrs/ws/rest/v1`
- **AND** uses Basic Auth with configured credentials (default: admin/Admin123 for demo)

#### Scenario: Custom MRS URL
- **WHEN** `OPENMRS_URL` environment variable is set
- **THEN** adapter uses the custom URL instead of default

---

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
