## ADDED Requirements

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

#### Scenario: Get availability
- **WHEN** `adapter.getAvailability(dateRange)` is called
- **THEN** it SHALL return time slots within the date range
- **AND** include provider, location, and appointment type references

#### Scenario: Get appointments
- **WHEN** `adapter.getAppointments(dateRange)` is called
- **THEN** it SHALL return appointments within the date range
- **AND** include patient, slot, status, and reason fields

---

### Requirement: Real-Time Slot Validation
The adapter SHALL provide a method to verify a specific slot is still available in the MRS immediately before booking.

#### Scenario: Verify available slot
- **WHEN** `adapter.verifySlotAvailable(slotId)` is called for an available slot
- **THEN** it SHALL return `{ available: true, slot: MRSTimeSlot }`

#### Scenario: Verify unavailable slot
- **WHEN** `adapter.verifySlotAvailable(slotId)` is called for a booked or deleted slot
- **THEN** it SHALL return `{ available: false }`

#### Scenario: Slot not found
- **WHEN** `adapter.verifySlotAvailable(slotId)` is called with invalid ID
- **THEN** it SHALL throw a `SlotNotFoundError` with the slot ID

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
