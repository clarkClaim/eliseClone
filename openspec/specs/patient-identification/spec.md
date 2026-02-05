# patient-identification Specification

## Purpose

Agent tool for identifying callers by matching phone number against patient records and verifying identity with date of birth. Supports fallback to name + DOB lookup when phone is not on file.

## Requirements

### Requirement: identify_patient tool accepts phone, DOB, and optional name

The `identify_patient` tool SHALL accept phone number, date of birth, and optionally name as parameters.

#### Scenario: Tool receives phone and DOB

- **WHEN** the tool is called with `phone` and `dob` parameters
- **THEN** both values are available for processing
- **AND** processing continues to phone lookup logic

#### Scenario: Tool receives name, phone, and DOB

- **WHEN** the tool is called with `name`, `phone`, and `dob` parameters
- **THEN** all values are available for processing
- **AND** name is used for fallback lookup if phone not found

#### Scenario: Missing phone parameter

- **WHEN** the tool is called without a `phone` parameter
- **THEN** the tool returns an error result
- **AND** the error message indicates phone is required

#### Scenario: Missing DOB parameter

- **WHEN** the tool is called without a `dob` parameter
- **THEN** the tool returns an error result
- **AND** the error message indicates DOB is required

---

### Requirement: Phone numbers are normalized before lookup

The system SHALL normalize phone numbers to a consistent format before database lookup.

#### Scenario: Phone with formatting is normalized

- **WHEN** the tool receives a phone like "(555) 123-4567"
- **THEN** the phone is normalized to E.164 format (e.g., "+15551234567")
- **AND** the normalized value is used for database lookup

#### Scenario: Phone with country code is preserved

- **WHEN** the tool receives a phone like "+1 555 123 4567"
- **THEN** the phone is normalized to "+15551234567"
- **AND** the country code is preserved

#### Scenario: Phone without country code assumes US

- **WHEN** the tool receives a phone like "5551234567"
- **THEN** the phone is normalized with +1 prefix
- **AND** becomes "+15551234567"

---

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
- **AND** the caller's phone number is added to the patient's phone records

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

---

### Requirement: Name matching is flexible

Name matching for fallback lookup SHALL be flexible to handle variations.

#### Scenario: Name matching ignores case

- **WHEN** database has patient "John Smith"
- **AND** caller provides "john smith"
- **THEN** the match succeeds

#### Scenario: Name matching handles first + last order

- **WHEN** database has patient with givenName "John" and familyName "Smith"
- **AND** caller provides "John Smith" or "Smith, John"
- **THEN** the match succeeds

---

### Requirement: Phone number is added when patient identified by name

When a patient is identified via name + DOB fallback, the tool SHALL add the caller's phone to their record.

#### Scenario: Phone added to existing patient

- **WHEN** patient is identified by name + DOB
- **AND** the caller's phone is not already in their records
- **THEN** the phone is added to `patient_phones`
- **AND** the phone is marked as `isPrimary: false`
- **AND** the response includes `phoneAdded: true`

#### Scenario: Phone already exists for patient

- **WHEN** patient is identified by name + DOB
- **AND** the caller's phone is already in their records
- **THEN** no duplicate is created
- **AND** the response includes `phoneAdded: false`

---

### Requirement: Tool returns verification failed when DOB does not match

The tool SHALL indicate verification failure when phone matches but DOB does not.

#### Scenario: Phone matches but DOB does not

- **WHEN** the phone matches a record in `patient_phones`
- **AND** the DOB does not match the associated patient's date of birth
- **THEN** the tool returns `{ status: "verification_failed" }`
- **AND** no patient object is included (to prevent information leakage)

---

### Requirement: DOB parsing handles multiple formats

The tool SHALL accept DOB in multiple common formats.

#### Scenario: ISO format DOB

- **WHEN** the tool receives DOB as "1985-03-15"
- **THEN** the date is parsed correctly as March 15, 1985

#### Scenario: US format DOB

- **WHEN** the tool receives DOB as "03/15/1985"
- **THEN** the date is parsed correctly as March 15, 1985

#### Scenario: Natural language DOB

- **WHEN** the tool receives DOB as "March 15, 1985"
- **THEN** the date is parsed correctly as March 15, 1985

#### Scenario: Invalid DOB format

- **WHEN** the tool receives an unparseable DOB
- **THEN** the tool returns an error result
- **AND** the error message indicates the DOB could not be parsed

---

### Requirement: Patient lookup is case-insensitive for phone

Phone number matching SHALL be case-insensitive (relevant for any alpha characters in extensions).

#### Scenario: Phone lookup ignores formatting

- **WHEN** database has "+15551234567"
- **AND** tool receives "(555) 123-4567"
- **THEN** the lookup succeeds after normalization

---

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
