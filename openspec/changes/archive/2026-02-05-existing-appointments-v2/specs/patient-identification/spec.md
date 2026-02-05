# patient-identification Specification (Delta)

## MODIFIED Requirements

### Requirement: Tool returns existing patient when phone and DOB match

The tool SHALL return patient details and upcoming appointments when both phone and DOB verification succeed.

#### Scenario: Existing patient identified successfully

- **WHEN** the phone matches a record in `patient_phones`
- **AND** the DOB matches the associated patient's date of birth
- **THEN** the tool returns status `"existing"`
- **AND** the response includes `patient: { id, name, givenName }`
- **AND** the response includes `upcomingAppointments` array (may be empty)

#### Scenario: DOB comparison is date-only

- **WHEN** comparing DOB values
- **THEN** only the date portion is compared (not time)
- **AND** timezone differences do not affect the match

---

### Requirement: Tool falls back to name + DOB lookup when phone not found

When the phone number is not in the system, the tool SHALL attempt to find the patient by name and DOB if name was provided.

#### Scenario: Phone not found, name + DOB match existing patient

- **WHEN** the phone does not match any record in `patient_phones`
- **AND** `name` parameter was provided
- **AND** a patient exists with matching name and DOB
- **THEN** the tool returns status `"existing"`
- **AND** the response includes `patient`, `phoneAdded: true`, and `upcomingAppointments`

#### Scenario: Phone not found, name provided but no match

- **WHEN** the phone does not match any record in `patient_phones`
- **AND** `name` parameter was provided
- **AND** no patient matches the name + DOB combination
- **THEN** the tool returns status `"new"`
- **AND** no `upcomingAppointments` field is included

#### Scenario: Phone not found, no name provided

- **WHEN** the phone does not match any record in `patient_phones`
- **AND** `name` parameter was not provided
- **THEN** the tool returns status `"not_found_try_name"`
- **AND** no `upcomingAppointments` field is included

## ADDED Requirements

### Requirement: Appointments fetched only after successful identification

The system SHALL only query appointments when the patient is positively identified.

#### Scenario: Successful identification includes appointments

- **WHEN** patient identification succeeds (status: `"existing"`)
- **THEN** `getUpcomingAppointments(patientId)` is called
- **AND** the result is included as `upcomingAppointments`

#### Scenario: Failed identification has no appointments

- **WHEN** patient identification fails (status: `"new"`, `"not_found_try_name"`, or `"verification_failed"`)
- **THEN** no appointment query is performed
- **AND** no `upcomingAppointments` field is included in the response

---

### Requirement: Assistant prompt handles existing appointments

The centralized prompt in `_base_assistant.json` SHALL guide the LLM to mention existing appointments.

#### Scenario: Patient has upcoming appointments

- **WHEN** `identify_patient` returns with `upcomingAppointments` containing items
- **THEN** the assistant mentions the highlighted appointments (first 1-2)
- **AND** asks if they're calling about one of those or need something else

#### Scenario: Patient has no upcoming appointments

- **WHEN** `identify_patient` returns with empty `upcomingAppointments`
- **THEN** the assistant proceeds directly to ask how they can help with scheduling

#### Scenario: Patient has many appointments

- **WHEN** `upcomingAppointments` contains more than 2 items
- **THEN** the assistant mentions only the highlighted ones initially
- **AND** can list more if the patient asks
