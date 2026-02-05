## ADDED Requirements

### Requirement: Sync service pushes local patients to MRS

The sync service SHALL push locally-created patients to the MRS during background sync cycles.

#### Scenario: Identify unsynced patients
- **WHEN** the sync service runs patient push phase
- **THEN** it queries for patients where syncedToMrs is false
- **AND** mrsId starts with 'local-' prefix

#### Scenario: Push patient to MRS
- **WHEN** an unsynced patient is found with required fields
- **THEN** the sync service calls `adapter.createPatient()` with patient data
- **AND** updates local patient.mrsId with the returned UUID on success
- **AND** sets syncedToMrs to true and syncedToMrsAt to current timestamp

#### Scenario: Skip patients missing required fields
- **WHEN** an unsynced patient is missing givenName, familyName, or dob
- **THEN** the sync service skips the patient
- **AND** sets lastSyncError to 'Missing required fields for MRS: [field names]'
- **AND** does NOT increment syncAttempts (not a transient failure)

#### Scenario: Push failure with retry
- **WHEN** pushing patient to MRS fails with a transient error
- **THEN** the sync service increments syncAttempts
- **AND** records lastSyncError with the error message
- **AND** creates a retry job with exponential backoff (1m, 2m, 4m, 8m, 16m)

#### Scenario: Max retry attempts reached
- **WHEN** a patient has syncAttempts >= 5
- **THEN** the sync service skips the patient for this cycle
- **AND** logs a warning for manual review
- **AND** does NOT delete or modify the patient

---

### Requirement: Sync service patient push runs before appointment push

The sync service SHALL ensure patients are synced before their appointments.

#### Scenario: Sync order
- **WHEN** a sync cycle runs
- **THEN** patient push runs BEFORE appointment push
- **AND** ensures appointments reference valid MRS patient UUIDs

#### Scenario: Appointment blocked by unsynced patient
- **WHEN** an appointment references a patient with syncedToMrs=false
- **THEN** the appointment push is skipped until patient is synced
- **AND** lastSyncError on appointment is set to 'Patient not yet synced to MRS'
