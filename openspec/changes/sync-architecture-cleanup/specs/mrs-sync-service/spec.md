## ADDED Requirements

### Requirement: Appointment Types Sync

The sync service SHALL sync appointment types (services) from the MRS.

#### Scenario: Sync appointment types on each cycle
- **WHEN** sync cycle runs
- **THEN** the service SHALL call `syncAppointmentTypes()`
- **AND** appointment types SHALL be synced before appointments
- **AND** new types from MRS SHALL be created locally
- **AND** changed types SHALL be updated locally

#### Scenario: Appointment types sync priority
- **WHEN** sync service is running
- **THEN** appointment types SHALL sync every 60 minutes (configurable)
- **AND** these SHALL have LOW priority (rarely change)

---

### Requirement: Locations Sync

The sync service SHALL sync locations from the MRS.

#### Scenario: Sync locations on each cycle
- **WHEN** sync cycle runs
- **THEN** the service SHALL call `syncLocations()`
- **AND** new locations from MRS SHALL be created locally
- **AND** changed locations SHALL be updated locally

#### Scenario: Locations sync priority
- **WHEN** sync service is running
- **THEN** locations SHALL sync every 60 minutes (configurable)
- **AND** these SHALL have LOW priority (very stable)

---

### Requirement: Service Relationship in Appointment Sync

The sync service SHALL populate the service relationship when syncing appointments.

#### Scenario: Match appointment to service by mrsId
- **WHEN** syncing an appointment from MRS
- **AND** the appointment has a service UUID
- **THEN** the sync SHALL find local AppointmentType with matching `mrsId`
- **AND** set `appointment.serviceId` to the local service ID

#### Scenario: Match appointment to service by name fallback
- **WHEN** syncing an appointment from MRS
- **AND** no AppointmentType matches by `mrsId`
- **THEN** the sync SHALL search by name (case-insensitive contains)
- **AND** set `appointment.serviceId` if found

#### Scenario: Handle missing service gracefully
- **WHEN** syncing an appointment from MRS
- **AND** no matching service is found
- **THEN** `appointment.serviceId` SHALL be null
- **AND** a warning SHALL be logged with the service name from MRS

---

### Requirement: Transaction Boundaries for Sync Operations

Multi-step sync operations SHALL be wrapped in database transactions.

#### Scenario: Appointment sync uses transaction
- **WHEN** syncing appointments from MRS
- **THEN** the batch of appointment upserts SHALL be wrapped in a transaction
- **AND** if any upsert fails, the entire batch SHALL roll back

#### Scenario: Push job with local update uses transaction
- **WHEN** a push job succeeds and updates local record
- **THEN** the job status update and appointment update SHALL be in one transaction
- **AND** if either fails, both SHALL roll back

## MODIFIED Requirements

### Requirement: Entity-Specific Sync Intervals

The system SHALL sync different entities at different frequencies based on how often they change and their importance to booking.

#### Scenario: High-priority entities sync frequently
- **WHEN** sync service is running
- **THEN** availability and appointments SHALL sync every 5 minutes (configurable)
- **AND** these SHALL have highest priority in the job queue

#### Scenario: Medium-priority entities sync moderately
- **WHEN** sync service is running
- **THEN** patients SHALL sync every 30 minutes (configurable)

#### Scenario: Low-priority entities sync infrequently
- **WHEN** sync service is running
- **THEN** providers, locations, and appointment types SHALL sync every 60 minutes (configurable)
- **AND** these SHALL have lowest priority in the job queue

## REMOVED Requirements

### Requirement: Dual Sync Implementation Support

**Reason**: Consolidating to single `SyncScheduler` implementation. The legacy `SyncService` is deprecated.

**Migration**: Update `server.ts` to use `SyncScheduler`. `SyncService` will log deprecation warning if instantiated. Remove `SyncService` after 2-week observation period.
