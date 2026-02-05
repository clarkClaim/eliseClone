## ADDED Requirements

### Requirement: Appointments endpoint with date range filtering

The API SHALL provide a GET `/api/dashboard/appointments` endpoint that returns appointments within a date range.

#### Scenario: Fetch appointments for a week

- **WHEN** GET `/api/dashboard/appointments?start=2026-02-01&end=2026-02-07` is called
- **THEN** response contains all appointments with startTime between those dates
- **AND** each appointment includes id, patientId, providerId, startTime, endTime, status

#### Scenario: Default to current week

- **WHEN** GET `/api/dashboard/appointments` is called without date parameters
- **THEN** response contains appointments for the current week (Monday through Sunday)

#### Scenario: Include patient and provider names

- **WHEN** appointments are returned
- **THEN** each appointment includes nested `patient.name` and `provider.name` fields

---

### Requirement: Patients endpoint with search

The API SHALL provide a GET `/api/dashboard/patients` endpoint that returns patients with optional search filtering.

#### Scenario: List all patients with pagination

- **WHEN** GET `/api/dashboard/patients?limit=20&offset=0` is called
- **THEN** response contains up to 20 patients sorted by name
- **AND** response includes `total` count for pagination

#### Scenario: Search patients by name

- **WHEN** GET `/api/dashboard/patients?search=smith` is called
- **THEN** response contains only patients whose name contains "smith" (case-insensitive)

#### Scenario: Search patients by phone

- **WHEN** GET `/api/dashboard/patients?search=5551234` is called
- **THEN** response contains patients with matching phone numbers

---

### Requirement: Single patient detail endpoint

The API SHALL provide a GET `/api/dashboard/patients/:id` endpoint that returns full patient details.

#### Scenario: Fetch patient by ID

- **WHEN** GET `/api/dashboard/patients/abc-123` is called
- **THEN** response contains patient record with id, name, dob, gender, phones, and mrsId

#### Scenario: Include patient appointment history

- **WHEN** GET `/api/dashboard/patients/:id?include=appointments` is called
- **THEN** response includes array of patient's appointments (past and upcoming)

#### Scenario: Patient not found

- **WHEN** GET `/api/dashboard/patients/invalid-id` is called
- **THEN** response is 404 with error message

---

### Requirement: Providers endpoint

The API SHALL provide a GET `/api/dashboard/providers` endpoint that returns all providers.

#### Scenario: List all providers

- **WHEN** GET `/api/dashboard/providers` is called
- **THEN** response contains all providers with id, name, specialty, and mrsId

---

### Requirement: Conversations endpoint for call logs

The API SHALL provide a GET `/api/dashboard/calls` endpoint that returns recent voice conversations.

#### Scenario: Fetch recent calls

- **WHEN** GET `/api/dashboard/calls?limit=50` is called
- **THEN** response contains up to 50 most recent conversations ordered by createdAt descending
- **AND** each call includes id, externalId, channel, callerPhone, patientId, outcome, createdAt

#### Scenario: Filter by date range

- **WHEN** GET `/api/dashboard/calls?since=2026-02-04T00:00:00Z` is called
- **THEN** response contains only calls created after the specified timestamp

#### Scenario: Include patient name if identified

- **WHEN** a call has patientId set
- **THEN** response includes nested `patient.name` field

---

### Requirement: Create appointment endpoint

The API SHALL provide a POST `/api/dashboard/appointments` endpoint to create new appointments.

#### Scenario: Create appointment with required fields

- **WHEN** POST `/api/dashboard/appointments` with body `{ patientId, providerId, startTime, endTime }`
- **THEN** appointment is created with status "scheduled"
- **AND** response contains the created appointment with id

#### Scenario: Validation error on missing fields

- **WHEN** POST `/api/dashboard/appointments` with missing required fields
- **THEN** response is 400 with validation error details

#### Scenario: Conflict detection

- **WHEN** POST creates appointment overlapping with existing appointment for same provider
- **THEN** response is 409 with conflict error

---

### Requirement: Update appointment endpoint

The API SHALL provide a PATCH `/api/dashboard/appointments/:id` endpoint to modify appointments.

#### Scenario: Reschedule appointment

- **WHEN** PATCH `/api/dashboard/appointments/abc-123` with `{ startTime, endTime }`
- **THEN** appointment times are updated
- **AND** response contains updated appointment

#### Scenario: Cancel appointment

- **WHEN** PATCH `/api/dashboard/appointments/abc-123` with `{ status: "cancelled" }`
- **THEN** appointment status is set to cancelled
- **AND** time slot becomes available

#### Scenario: Appointment not found

- **WHEN** PATCH `/api/dashboard/appointments/invalid-id`
- **THEN** response is 404 with error message

---

### Requirement: API error responses use consistent format

The API SHALL return errors in a consistent JSON format.

#### Scenario: Error response structure

- **WHEN** any API endpoint returns an error
- **THEN** response body is `{ error: { code: string, message: string, details?: object } }`

#### Scenario: Validation errors include field details

- **WHEN** request validation fails
- **THEN** error details include array of field-level errors with path and message
