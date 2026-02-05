## ADDED Requirements

### Requirement: MRS capabilities declare scheduling model
The system SHALL declare the MRS scheduling model in capabilities.

MRSCapabilities.scheduling SHALL include:
- `model`: Either 'appointment_based' or 'slot_based'
- `supportsScheduleConfig`: Whether MRS exposes service/schedule configuration
- `defaultSlotDuration`: Default appointment duration in minutes
- `requiresServiceId`: Whether service ID is required for booking

#### Scenario: Bahmni declares appointment-based model
- **WHEN** OpenMRS adapter with Bahmni module reports capabilities
- **THEN** `scheduling.model` is 'appointment_based'
- **AND** `scheduling.requiresServiceId` is true

#### Scenario: Legacy MRS declares slot-based model
- **WHEN** a slot-based MRS adapter reports capabilities
- **THEN** `scheduling.model` is 'slot_based'
- **AND** `scheduling.supportsScheduleConfig` may be false

### Requirement: Abstract MRS adapter uses datetime-based booking
The abstract MRSAdapter interface SHALL use datetime-based operations for scheduling.

#### Scenario: Create appointment with datetime
- **WHEN** `createAppointment({ patientMrsId, startDateTime, endDateTime, serviceId })` is called
- **THEN** adapter creates appointment in MRS using provided times
- **AND** returns MRSAppointment with mrsId populated

#### Scenario: Create appointment without serviceId on Bahmni
- **WHEN** `createAppointment()` is called without serviceId on Bahmni adapter
- **THEN** adapter throws MRSValidationError indicating serviceId is required

### Requirement: Conflict detection via checkConflicts method
The abstract MRSAdapter SHALL provide a `checkConflicts()` method for datetime-based conflict detection.

#### Scenario: Check conflicts with no overlap
- **WHEN** `checkConflicts({ startDateTime, endDateTime, providerId })` is called for an open time
- **THEN** returns `{ hasConflict: false }`

#### Scenario: Check conflicts with existing appointment
- **WHEN** `checkConflicts()` is called for a time that overlaps an existing appointment
- **THEN** returns `{ hasConflict: true, conflictingAppointments: [...] }`

#### Scenario: Check conflicts for reschedule
- **WHEN** `checkConflicts({ ..., excludeAppointmentId })` is called
- **THEN** the excluded appointment is not counted as a conflict

### Requirement: Optional schedule configuration fetch
The MRSAdapter MAY provide `getScheduleConfig()` for fetching service availability.

#### Scenario: Bahmni returns service configuration
- **WHEN** `getScheduleConfig()` is called on Bahmni adapter
- **THEN** returns array of MRSScheduleConfig with service hours
- **AND** includes service ID, name, duration, and weekly availability

#### Scenario: MRS without schedule config support
- **WHEN** `getScheduleConfig()` is called on adapter without support
- **THEN** returns empty array or undefined
- **AND** Core uses locally-configured schedule templates

### Requirement: Appointment filter uses datetime range
The `getAppointments()` method SHALL filter by datetime range, not slot IDs.

#### Scenario: Get appointments for date range
- **WHEN** `getAppointments({ startDate, endDate })` is called
- **THEN** returns appointments with startTime within the range
- **AND** does not require slot-related parameters

#### Scenario: Get appointments for patient
- **WHEN** `getAppointments({ patientMrsId, startDate, endDate })` is called
- **THEN** returns only appointments for that patient in the range

### Requirement: Slot-based MRS uses extended interface
Slot-based MRS adapters SHALL implement SlotBasedMRSAdapter extension.

SlotBasedMRSAdapter extends MRSAdapter with:
- `getSlots(range: DateRange)`: Get discrete slots
- `getSlotById(slotId: string)`: Get specific slot
- `bookSlot(slotId, patientMrsId)`: Book by slot ID

#### Scenario: Type guard identifies slot-based adapter
- **WHEN** `isSlotBasedAdapter(adapter)` is called
- **THEN** returns true if adapter.capabilities.scheduling.model is 'slot_based'
- **AND** TypeScript narrows type to SlotBasedMRSAdapter

#### Scenario: Slot-based adapter implements slot methods
- **WHEN** slot-based adapter is used
- **THEN** `getSlots()` returns discrete MRSSlot objects
- **AND** `bookSlot()` creates appointment by slot ID

### Requirement: OpenMRS adapter implements Bahmni scheduling
The OpenMRSAdapter SHALL implement scheduling operations for Bahmni appointments module.

#### Scenario: Create appointment via Bahmni API
- **WHEN** `createAppointment()` is called with valid request
- **THEN** adapter POSTs to `/appointment` endpoint
- **AND** request includes patientUuid, serviceUuid, startDateTime, endDateTime

#### Scenario: Check conflicts via appointment search
- **WHEN** `checkConflicts()` is called
- **THEN** adapter searches appointments at the requested time via `/appointment/search`
- **AND** returns conflict if overlapping appointment exists

#### Scenario: Get schedule config from services
- **WHEN** `getScheduleConfig()` is called
- **THEN** adapter fetches `/appointmentService/all/full`
- **AND** maps Bahmni services to MRSScheduleConfig
