## ADDED Requirements

### Requirement: MRS Abstraction Documentation

The codebase SHALL include documentation explaining the MRS abstraction layer for developers implementing new adapters.

#### Scenario: Adapter interface documentation
- **WHEN** a developer reads the MRS adapter documentation
- **THEN** they SHALL find a complete list of required interface methods
- **AND** each method SHALL have JSDoc comments explaining purpose, parameters, and return types
- **AND** the documentation SHALL explain which methods are required vs optional

#### Scenario: Capability system documentation
- **WHEN** a developer implements a new adapter
- **THEN** documentation SHALL explain how to declare adapter capabilities
- **AND** explain how sync and booking code checks capabilities before calling methods
- **AND** provide examples of capability configurations for different MRS types

---

### Requirement: ID Relationship Documentation

The documentation SHALL clearly explain how local IDs relate to MRS IDs.

#### Scenario: Patient ID lifecycle documented
- **WHEN** a developer reads the sync documentation
- **THEN** they SHALL understand the patient ID lifecycle:
  1. New patient created locally with `mrsId = 'local-<uuid>'`
  2. `syncedToMrs = false` until pushed
  3. After push, `mrsId` updated to real MRS ID
  4. `syncedToMrs = true`

#### Scenario: Appointment ID lifecycle documented
- **WHEN** a developer reads the sync documentation
- **THEN** they SHALL understand the appointment ID lifecycle:
  1. New appointment created with `mrsId = null`
  2. Push job queued with `type = 'push_appointment_to_mrs'`
  3. After push, `mrsId` set to MRS appointment UUID
  4. `syncedToMrs = true`, `syncedToMrsAt` set

#### Scenario: Entity relationship diagram
- **WHEN** a developer reads the documentation
- **THEN** they SHALL find a diagram showing:
  - Local entities and their `mrsId` fields
  - How sync maps MRS entities to local entities
  - The Job queue's role in push operations

---

### Requirement: Sync Lifecycle Documentation

The documentation SHALL explain the sync lifecycle for each entity type.

#### Scenario: Sync direction documented
- **WHEN** a developer reads the sync documentation
- **THEN** they SHALL understand which entities sync in which direction:
  - **Pull only**: Providers, Locations, Appointment Types
  - **Pull + Push**: Patients, Appointments
- **AND** the rationale for each direction

#### Scenario: Conflict resolution documented
- **WHEN** a developer reads the sync documentation
- **THEN** they SHALL understand conflict resolution rules:
  - MRS wins for: patient demographics, provider info, appointment status
  - Local wins for: pending appointments not yet synced
  - Flag for review: deletions in MRS, unsynced local appointments
- **AND** how conflicts are logged to SyncConflict table

---

### Requirement: New Adapter Implementation Guide

The documentation SHALL provide a step-by-step guide for implementing a new MRS adapter.

#### Scenario: Implementation checklist
- **WHEN** a developer wants to implement an adapter (e.g., OpenEMR)
- **THEN** documentation SHALL provide a checklist:
  1. Create adapter class implementing `MRSAdapter` interface
  2. Define `capabilities` object for the MRS
  3. Implement connection management (`connect`, `disconnect`, `healthCheck`)
  4. Implement read operations for sync
  5. Implement write operations for booking
  6. Handle MRS-specific error codes
  7. Add unit tests for adapter
  8. Add integration tests with test MRS instance

#### Scenario: Example adapter reference
- **WHEN** a developer implements a new adapter
- **THEN** documentation SHALL reference OpenMRSAdapter as a complete example
- **AND** highlight which parts are OpenMRS-specific vs generic patterns

#### Scenario: Testing guidance
- **WHEN** a developer tests a new adapter
- **THEN** documentation SHALL explain:
  - How to use MockAdapter for unit tests
  - How to set up integration test environment
  - Required test coverage for adapter certification
