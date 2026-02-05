# existing-appointments-retrieval Specification

## Purpose

Query and format a patient's upcoming appointments for voice assistant context. Used within patient identification to provide awareness of existing scheduled appointments.

## ADDED Requirements

### Requirement: Query upcoming appointments for a patient

The system SHALL query upcoming appointments when a patient is successfully identified.

#### Scenario: Patient has future scheduled appointments

- **WHEN** `getUpcomingAppointments(patientId)` is called
- **AND** the patient has appointments with `startTime > NOW()`
- **AND** the appointments have status `scheduled` or `confirmed`
- **THEN** those appointments are returned sorted by `startTime ASC`

#### Scenario: Patient has no upcoming appointments

- **WHEN** `getUpcomingAppointments(patientId)` is called
- **AND** the patient has no matching appointments
- **THEN** an empty array is returned

#### Scenario: Query is limited for performance

- **WHEN** querying appointments
- **THEN** the query returns a maximum of 5 results

---

### Requirement: Exclude cancelled and past appointments

The system SHALL only return actionable future appointments.

#### Scenario: Cancelled appointments excluded

- **WHEN** an appointment has `status = 'cancelled'`
- **THEN** it is excluded from results

#### Scenario: No-show appointments excluded

- **WHEN** an appointment has `status = 'no_show'`
- **THEN** it is excluded from results

#### Scenario: Past appointments excluded

- **WHEN** an appointment has `startTime` before the current time
- **THEN** it is excluded from results

---

### Requirement: Format appointments for voice output

Each appointment SHALL include fields optimized for the voice assistant to speak naturally.

#### Scenario: Date uses formatDateForSpeech

- **WHEN** formatting an appointment
- **THEN** `dateForSpeech` is set using the existing `formatDateForSpeech()` helper
- **AND** returns "Today", "Tomorrow", or "Monday, March 5" format

#### Scenario: Time uses formatTimeForSpeech

- **WHEN** formatting an appointment
- **THEN** `timeForSpeech` is set using the existing `formatTimeForSpeech()` helper
- **AND** returns "10:00 AM" format

#### Scenario: Service name included from AppointmentType

- **WHEN** the appointment has a linked `serviceId`
- **THEN** `serviceName` is populated from `AppointmentType.name`

#### Scenario: Provider name included when known

- **WHEN** the appointment has a linked `providerId`
- **AND** the provider name does not contain "unknown" (case-insensitive)
- **THEN** `providerName` is populated with the provider's name

#### Scenario: Provider name omitted when unknown

- **WHEN** the provider name contains "unknown" or is a placeholder
- **THEN** `providerName` is set to empty string

---

### Requirement: First two appointments are highlighted

The system SHALL indicate which appointments to emphasize in the greeting.

#### Scenario: Multiple appointments returned

- **WHEN** 2 or more appointments are returned
- **THEN** the first 2 have `highlight: true`
- **AND** remaining have `highlight: false`

#### Scenario: Single appointment returned

- **WHEN** exactly 1 appointment is returned
- **THEN** it has `highlight: true`
