## ADDED Requirements

### Requirement: Adapter Interface Documentation

The MRSAdapter interface SHALL include comprehensive JSDoc documentation for all methods.

#### Scenario: Method documentation
- **WHEN** a developer views the MRSAdapter interface
- **THEN** each method SHALL have JSDoc comments including:
  - Description of what the method does
  - @param tags for all parameters
  - @returns tag describing return value
  - @throws tag listing possible errors

#### Scenario: Capability documentation
- **WHEN** a developer implements adapter capabilities
- **THEN** the MRSCapabilities type SHALL document each capability field
- **AND** explain how consuming code uses each capability

---

### Requirement: Location Operations

The adapter SHALL expose methods for retrieving location records.

#### Scenario: Get all locations
- **WHEN** `adapter.getLocations()` is called
- **THEN** it SHALL return an array of MRSLocation objects
- **AND** each location SHALL have: mrsId, name, address (optional)

#### Scenario: Get location by ID
- **WHEN** `adapter.getLocation(mrsId)` is called
- **THEN** it SHALL return the location with that mrsId
- **AND** return null if not found

---

### Requirement: Idempotency Key Support in Capabilities

The adapter capabilities SHALL indicate idempotency key support.

#### Scenario: Capability declaration for idempotency
- **WHEN** adapter capabilities are defined
- **THEN** `capabilities.sync.supportsIdempotencyKeys` SHALL be a boolean
- **AND** default to false if not specified

#### Scenario: OpenMRS adapter idempotency capability
- **WHEN** OpenMRSAdapter is instantiated
- **THEN** `capabilities.sync.supportsIdempotencyKeys` SHALL be false
- **AND** the adapter SHALL use duplicate detection fallback

## MODIFIED Requirements

### Requirement: Adapter computes availability via conflict checking

The adapter SHALL compute availability via conflict checking, not slot queries.

#### Scenario: Check conflicts replaces slot verification
- **WHEN** booking flow needs to verify time is available
- **THEN** it calls `checkConflicts(startTime, endTime, providerId)` with datetime range
- **AND** the method returns `{ hasConflict: boolean, conflictingAppointments?: MRSAppointment[] }`

#### Scenario: Availability comes from Core, not MRS
- **WHEN** user asks for available times
- **THEN** Core computes availability from ScheduleTemplate and local Appointments
- **AND** does NOT call adapter's deprecated slot-based methods

#### Scenario: checkConflicts implementation
- **WHEN** `adapter.checkConflicts()` is called
- **THEN** the adapter SHALL query MRS for appointments overlapping the time range
- **AND** return any conflicting appointments found

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

#### Scenario: Check idempotency support
- **WHEN** push job prepares to create appointment
- **THEN** it SHALL check `adapter.capabilities.sync.supportsIdempotencyKeys`
- **AND** use duplicate detection fallback if false

## REMOVED Requirements

### Requirement: MRS adapter interface defines availability operations

**Reason**: Slot-based availability queries are deprecated. Availability is now computed locally from ScheduleTemplates and conflict checking.

**Migration**: Remove `getAvailability(providerId, dateRange)` method. Use `checkConflicts()` for real-time verification. Use local ScheduleTemplate + Appointment data for availability computation.

---

### Requirement: Verify slot still available

**Reason**: `verifySlotAvailable()` is replaced by `checkConflicts()` for datetime-based scheduling.

**Migration**: Replace all calls to `verifySlotAvailable(slotId)` with `checkConflicts(startTime, endTime, providerId)`. The new method works with datetime ranges instead of pre-defined slot IDs.
