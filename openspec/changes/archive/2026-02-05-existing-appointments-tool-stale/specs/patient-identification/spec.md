# patient-identification Specification (Delta)

## MODIFIED Requirements

### Requirement: Tool returns existing patient when phone and DOB match

The tool SHALL return patient details and upcoming appointments when both phone and DOB verification succeed.

#### Scenario: Existing patient identified successfully

- **WHEN** the phone matches a record in `patient_phones`
- **AND** the DOB matches the associated patient's date of birth
- **THEN** the tool returns `{ status: "existing", patient: { id, name, ... }, upcomingAppointments: [...] }`
- **AND** the patient object includes `id`, `name`, and `givenName`
- **AND** `upcomingAppointments` contains the patient's future appointments (may be empty)

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
- **THEN** the tool returns `{ status: "existing", patient: { id, name, ... }, phoneAdded: true, upcomingAppointments: [...] }`
- **AND** the caller's phone number is added to the patient's phone records
- **AND** `upcomingAppointments` contains the patient's future appointments (may be empty)

#### Scenario: Phone not found, name provided but no match

- **WHEN** the phone does not match any record in `patient_phones`
- **AND** `name` parameter was provided
- **AND** no patient matches the name + DOB combination
- **THEN** the tool returns `{ status: "new" }`

#### Scenario: Phone not found, no name provided

- **WHEN** the phone does not match any record in `patient_phones`
- **AND** `name` parameter was not provided
- **THEN** the tool returns `{ status: "not_found_try_name" }`
- **AND** the response indicates the assistant should ask for the patient's name

## ADDED Requirements

### Requirement: Response includes upcoming appointments for identified patients

When a patient is successfully identified, the response SHALL include their upcoming appointments.

#### Scenario: Identified patient has appointments

- **WHEN** patient identification succeeds (status: "existing")
- **AND** the patient has upcoming appointments
- **THEN** the response includes `upcomingAppointments` array
- **AND** each appointment includes `dateForSpeech`, `timeForSpeech`, `providerName`, `serviceName`, `highlight`

#### Scenario: Identified patient has no appointments

- **WHEN** patient identification succeeds (status: "existing")
- **AND** the patient has no upcoming appointments
- **THEN** the response includes `upcomingAppointments: []`

#### Scenario: Appointments not included for failed identification

- **WHEN** patient identification fails (status: "new", "not_found_try_name", or "verification_failed")
- **THEN** the response does not include `upcomingAppointments`

---

### Requirement: Assistant mentions appointments before offering scheduling

The assistant prompt SHALL guide the LLM to mention existing appointments before offering to schedule new ones.

#### Scenario: Patient has upcoming appointments

- **WHEN** identify_patient returns with `upcomingAppointments` containing items
- **THEN** the assistant mentions the highlighted appointments in the greeting
- **AND** asks if they're calling about those appointments or need something else

#### Scenario: Patient has no upcoming appointments

- **WHEN** identify_patient returns with `upcomingAppointments` as empty array
- **THEN** the assistant proceeds to offer scheduling
- **AND** does not mention appointments

#### Scenario: Patient has many appointments

- **WHEN** identify_patient returns with more than 2 appointments
- **THEN** the assistant mentions only the highlighted appointments (first 2)
- **AND** mentions there are more if the patient asks
