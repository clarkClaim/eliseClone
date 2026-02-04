# mrs-adapter Specification

## Purpose

Abstract interface for medical record system integration. Defines standard operations for any MRS implementation.

## ADDED Requirements

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
