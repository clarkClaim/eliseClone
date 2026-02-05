# existing-appointments-retrieval Specification

## Purpose

Capability to fetch and return a patient's upcoming appointments, optimized for voice assistant context. Used as part of patient identification to inform the assistant about existing scheduled appointments.

## ADDED Requirements

### Requirement: Upcoming appointments are fetched for identified patients

The system SHALL fetch upcoming appointments when a patient is successfully identified.

#### Scenario: Patient with upcoming appointments

- **WHEN** a patient is successfully identified
- **AND** the patient has future appointments
- **THEN** up to 5 upcoming appointments are returned
- **AND** appointments are sorted by start time ascending

#### Scenario: Patient with no upcoming appointments

- **WHEN** a patient is successfully identified
- **AND** the patient has no future appointments
- **THEN** an empty `upcomingAppointments` array is returned

#### Scenario: Query is limited for performance

- **WHEN** fetching upcoming appointments
- **THEN** the query returns a maximum of 5 appointments
- **AND** the query uses an index on (patientId, startTime)

---

### Requirement: Only future non-cancelled appointments are included

The system SHALL filter appointments to only include actionable future appointments.

#### Scenario: Past appointments excluded

- **WHEN** fetching upcoming appointments
- **THEN** appointments with `startTime` in the past are excluded

#### Scenario: Cancelled appointments excluded

- **WHEN** fetching upcoming appointments
- **THEN** appointments with status 'cancelled' are excluded

#### Scenario: No-show appointments excluded

- **WHEN** fetching upcoming appointments
- **THEN** appointments with status 'no_show' are excluded

#### Scenario: Scheduled appointments included

- **WHEN** fetching upcoming appointments
- **AND** an appointment has status 'scheduled' or 'confirmed'
- **THEN** the appointment is included in results

---

### Requirement: Appointments are formatted for voice

Each appointment SHALL include voice-optimized fields for the assistant to speak naturally.

#### Scenario: Date formatted for speech

- **WHEN** an appointment is returned
- **THEN** it includes `dateForSpeech` field (e.g., "Today", "Tomorrow", "Monday, March 5")

#### Scenario: Time formatted for speech

- **WHEN** an appointment is returned
- **THEN** it includes `timeForSpeech` field (e.g., "10:00 AM", "2:30 PM")

#### Scenario: Provider name included when known

- **WHEN** an appointment is returned
- **AND** the provider has a known name (not "unknown" or placeholder)
- **THEN** `providerName` is included with the provider's name

#### Scenario: Provider name omitted when unknown

- **WHEN** an appointment is returned
- **AND** the provider name contains "unknown" or is a placeholder
- **THEN** `providerName` is empty string

#### Scenario: Service name included

- **WHEN** an appointment is returned
- **THEN** `serviceName` is included (e.g., "General Checkup", "Follow-up")

---

### Requirement: First two appointments are highlighted

The system SHALL indicate which appointments should be emphasized in the greeting.

#### Scenario: First two appointments marked

- **WHEN** appointments are returned
- **AND** there are 2 or more appointments
- **THEN** the first 2 appointments have `highlight: true`
- **AND** remaining appointments have `highlight: false`

#### Scenario: Single appointment marked

- **WHEN** appointments are returned
- **AND** there is exactly 1 appointment
- **THEN** that appointment has `highlight: true`

#### Scenario: Highlight guides assistant behavior

- **WHEN** the assistant receives appointments with `highlight: true`
- **THEN** the assistant mentions these appointments in the initial greeting
- **AND** other appointments are available if the patient asks
