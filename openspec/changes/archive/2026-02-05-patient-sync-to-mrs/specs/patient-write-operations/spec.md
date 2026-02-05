## ADDED Requirements

### Requirement: MRS adapter supports patient creation

The MRSAdapter interface SHALL expose a method for creating patients in the MRS.

#### Scenario: Create patient with required fields
- **WHEN** `createPatient(patient)` is called with givenName, familyName, and dateOfBirth
- **THEN** the adapter creates the patient in the MRS
- **AND** returns an MRSPatient object with populated mrsId

#### Scenario: Create patient with phone number
- **WHEN** `createPatient(patient)` is called with a phone number
- **THEN** the adapter includes the phone as a person attribute in the MRS
- **AND** the returned MRSPatient includes the phone in phoneNumbers array

#### Scenario: Create patient with gender
- **WHEN** `createPatient(patient)` is called with gender
- **THEN** the adapter sets the gender on the person record in the MRS

#### Scenario: Patient creation failure
- **WHEN** the MRS rejects the patient creation request
- **THEN** the adapter throws an MRSValidationError with the error details

---

### Requirement: OpenMRS adapter creates patients via REST API

The OpenMRS adapter SHALL create patients using the OpenMRS REST API with proper person/identifier structure.

#### Scenario: POST to patient endpoint
- **WHEN** `createPatient()` is called on the OpenMRS adapter
- **THEN** the adapter calls `POST /patient` with nested person object
- **AND** includes names array with givenName, familyName, and preferred=true
- **AND** includes birthdate in YYYY-MM-DD format

#### Scenario: Phone number as person attribute
- **WHEN** patient has a phone number
- **THEN** the adapter includes it as a person attribute
- **AND** uses the configured phone attribute type UUID from `OPENMRS_PHONE_ATTR_UUID`

#### Scenario: Generate patient identifier
- **WHEN** creating a patient
- **THEN** the adapter generates an identifier with pattern `ELISE-{timestamp}-{random}`
- **AND** uses the configured identifier type UUID from `OPENMRS_IDENTIFIER_TYPE_UUID`
- **AND** uses the configured location UUID from `OPENMRS_IDENTIFIER_LOCATION_UUID`

#### Scenario: Map response to MRSPatient
- **WHEN** OpenMRS returns the created patient
- **THEN** the adapter maps uuid to mrsId
- **AND** extracts name from person.preferredName
- **AND** extracts birthdate from person.birthdate

---

### Requirement: save-new-patient tool pushes to MRS in real-time

The `save_new_patient` VAPI tool SHALL push newly created patients to the MRS immediately after local creation.

#### Scenario: Successful MRS push
- **WHEN** a new patient is created locally via the tool
- **AND** the MRS is available
- **THEN** the tool calls `adapter.createPatient()` with the patient data
- **AND** updates the local patient record with the returned mrsId
- **AND** sets syncedToMrs to true

#### Scenario: MRS push failure with fallback
- **WHEN** a new patient is created locally via the tool
- **AND** the MRS push fails (timeout, error, unavailable)
- **THEN** the local patient is still created successfully
- **AND** syncedToMrs remains false
- **AND** lastSyncError is set with the error message
- **AND** the patient is queued for background sync retry

#### Scenario: MRS unavailable at tool invocation
- **WHEN** a new patient is being created
- **AND** MRS health check fails
- **THEN** the tool creates the patient locally only
- **AND** skips the real-time MRS push
- **AND** logs that background sync will retry

---

### Requirement: Patient model tracks sync status

The Patient database model SHALL track synchronization status with the MRS.

#### Scenario: Sync tracking fields exist
- **WHEN** a Patient record exists
- **THEN** it has syncedToMrs boolean (default false)
- **AND** syncedToMrsAt datetime (nullable)
- **AND** lastSyncError string (nullable)
- **AND** syncAttempts integer (default 0)

#### Scenario: Mark patient as synced
- **WHEN** a patient is successfully pushed to MRS
- **THEN** syncedToMrs is set to true
- **AND** syncedToMrsAt is set to current timestamp
- **AND** lastSyncError is cleared
- **AND** mrsId is updated with the MRS-assigned UUID

#### Scenario: Track sync failure
- **WHEN** a patient push to MRS fails
- **THEN** lastSyncError is set with the error message
- **AND** syncAttempts is incremented
- **AND** syncedToMrs remains false

---

### Requirement: Sync service pushes unsynced patients to MRS

The sync service SHALL push locally-created patients to the MRS during background sync.

#### Scenario: Find unsynced patients
- **WHEN** the sync service runs patient push
- **THEN** it queries for patients where syncedToMrs is false
- **AND** mrsId starts with 'local-' (indicating local creation)

#### Scenario: Push patient to MRS
- **WHEN** an unsynced patient is found
- **THEN** the sync service calls `adapter.createPatient()` with the patient data
- **AND** updates the patient with the returned mrsId on success

#### Scenario: Retry with exponential backoff
- **WHEN** a patient push fails
- **THEN** the sync service increments syncAttempts
- **AND** creates a retry job with exponential backoff delay
- **AND** stops retrying after 5 attempts

#### Scenario: Skip patients without required data
- **WHEN** an unsynced patient is missing givenName or dateOfBirth
- **THEN** the sync service skips the patient
- **AND** logs a warning about missing required fields
