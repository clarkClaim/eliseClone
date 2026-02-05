## ADDED Requirements

### Requirement: MRS adapter interface defines patient write operations

The MRSAdapter interface SHALL expose methods for creating patients in the MRS.

#### Scenario: createPatient method signature
- **WHEN** the MRSAdapter interface is defined
- **THEN** it includes `createPatient(patient: NewPatient): Promise<MRSPatient>`
- **AND** NewPatient type includes givenName, familyName, dateOfBirth (required)
- **AND** NewPatient type includes gender, phone, phoneType (optional)

#### Scenario: NewPatient type definition
- **WHEN** creating a patient via the adapter
- **THEN** the NewPatient type SHALL have:
  - givenName: string (required)
  - familyName: string (required)
  - dateOfBirth: Date (required)
  - gender: string (optional)
  - phone: string (optional)
  - phoneType: 'mobile' | 'home' (optional)

---

### Requirement: OpenMRS adapter implements patient creation

The OpenMRS adapter SHALL implement createPatient using the OpenMRS REST API.

#### Scenario: Create patient API call
- **WHEN** `createPatient()` is called
- **THEN** the adapter calls `POST /patient` with JSON payload
- **AND** the payload includes nested person object with names and birthdate
- **AND** the payload includes identifiers array with generated identifier

#### Scenario: Person payload structure
- **WHEN** building the patient creation payload
- **THEN** person.names array contains one entry with givenName, familyName, preferred=true
- **AND** person.gender is set if provided (M, F, or O)
- **AND** person.birthdate is formatted as YYYY-MM-DD

#### Scenario: Phone as person attribute
- **WHEN** patient has a phone number
- **THEN** person.attributes array contains phone attribute
- **AND** attributeType uses UUID from OPENMRS_PHONE_ATTR_UUID env var
- **AND** value is the phone number string

#### Scenario: Identifier generation
- **WHEN** creating patient identifiers
- **THEN** identifier follows pattern `ELISE-{YYYYMMDD}-{4-char-random}`
- **AND** identifierType uses UUID from OPENMRS_IDENTIFIER_TYPE_UUID env var
- **AND** location uses UUID from OPENMRS_IDENTIFIER_LOCATION_UUID env var

#### Scenario: Response mapping
- **WHEN** OpenMRS returns the created patient
- **THEN** the adapter maps response.uuid to MRSPatient.mrsId
- **AND** maps person.preferredName to givenName/familyName
- **AND** maps person.birthdate to dateOfBirth
