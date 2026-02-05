## ADDED Requirements

### Requirement: Blocking Initial Sync on Startup

The server SHALL perform a blocking initial sync of essential entities before accepting VAPI requests.

#### Scenario: Server startup triggers initial sync
- **WHEN** the server starts
- **THEN** it SHALL connect to the MRS adapter
- **AND** run initial sync for all entity types before accepting requests
- **AND** log progress for each entity type synced

#### Scenario: Initial sync order
- **WHEN** initial sync runs
- **THEN** entities SHALL be synced in dependency order:
  1. Appointment types (services)
  2. Locations
  3. Providers
  4. Patients (known patients only)
  5. Appointments
- **AND** each entity sync SHALL complete before the next begins

#### Scenario: Initial sync with timeout
- **WHEN** initial sync takes longer than configured timeout (default: 5 minutes)
- **THEN** the server SHALL log a warning
- **AND** start in degraded mode (local-only booking)
- **AND** continue attempting sync in background

---

### Requirement: Essential Data Validation

The server SHALL validate that essential data exists after initial sync before marking itself as ready.

#### Scenario: Validate providers exist
- **WHEN** initial sync completes
- **THEN** the server SHALL verify at least one Provider exists with a ScheduleTemplate
- **AND** fail startup if no providers have schedules

#### Scenario: Validate appointment types exist
- **WHEN** initial sync completes
- **THEN** the server SHALL verify at least one AppointmentType exists
- **AND** fail startup if no appointment types exist

#### Scenario: Validate locations exist
- **WHEN** initial sync completes
- **THEN** the server SHALL verify at least one Location exists
- **AND** fail startup if no locations exist

#### Scenario: Validation failure exits with error
- **WHEN** essential data validation fails
- **THEN** the server SHALL log a detailed error message listing what's missing
- **AND** exit with status code 1
- **AND** NOT accept any VAPI requests

---

### Requirement: Health Endpoint Reports Readiness

The `/health` endpoint SHALL report whether the server is ready to handle requests.

#### Scenario: Health check before initial sync complete
- **WHEN** `/health` is called before initial sync completes
- **THEN** response SHALL include `"ready": false`
- **AND** HTTP status SHALL be 503 Service Unavailable

#### Scenario: Health check after successful startup
- **WHEN** `/health` is called after initial sync and validation complete
- **THEN** response SHALL include `"ready": true`
- **AND** HTTP status SHALL be 200 OK
- **AND** response SHALL include sync status for each entity type

#### Scenario: Health check with ready query parameter
- **WHEN** `/health?ready=true` is called
- **THEN** it SHALL return 200 only if ready, 503 otherwise
- **AND** Kubernetes readiness probe can use this endpoint

---

### Requirement: Degraded Mode Operation

The server SHALL support operating in degraded mode when MRS is unavailable at startup.

#### Scenario: MRS unavailable at startup
- **WHEN** MRS connection fails during initial sync
- **AND** startup timeout is exceeded
- **THEN** server SHALL start in degraded mode
- **AND** log clear warning about degraded state
- **AND** accept booking requests with local-only mode

#### Scenario: Degraded mode health response
- **WHEN** server is in degraded mode
- **AND** `/health` is called
- **THEN** response SHALL include `"ready": true` (can handle requests)
- **AND** response SHALL include `"degraded": true`
- **AND** response SHALL include reason for degraded state

#### Scenario: Recovery from degraded mode
- **WHEN** MRS becomes available while in degraded mode
- **THEN** sync service SHALL automatically sync missed data
- **AND** server SHALL exit degraded mode
- **AND** log recovery event
