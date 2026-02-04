## MODIFIED Requirements

### Requirement: Sync state table exists

The database SHALL have a sync_state table for tracking MRS synchronization progress.

#### Scenario: Sync progress is tracked

- **WHEN** a sync job completes
- **THEN** sync_state stores last_sync_at and status per entity type

#### Scenario: Sync observability fields

- **WHEN** sync state is queried for monitoring
- **THEN** sync_state provides nextSyncAt, lastSyncDuration (ms), recordsProcessed, and consecutiveFailures

#### Scenario: Rate limit tracking

- **WHEN** sync service tracks MRS rate limits
- **THEN** sync_state stores rateLimitRemaining (nullable int) and rateLimitResetAt (nullable timestamp)
- **AND** backoffUntil (nullable timestamp) for when rate limited

---

### Requirement: Job table supports sync retry backoff

The job table SHALL have fields for exponential backoff retry.

#### Scenario: Job backoff tracking

- **WHEN** a sync retry job is created
- **THEN** it can store backoffExponent (default 0) and nextRetryAt timestamp

#### Scenario: Exponential backoff calculation

- **WHEN** a retry job fails
- **THEN** backoffExponent is incremented
- **AND** nextRetryAt is calculated as now + (base_delay * 2^backoffExponent)

#### Scenario: Job categorization for MRS operations

- **WHEN** jobs are created for MRS operations
- **THEN** type values include: 'sync_patients', 'sync_providers', 'sync_availability', 'sync_appointments', 'push_appointment_to_mrs', 'push_cancellation_to_mrs'

## ADDED Requirements

### Requirement: MRS adapter configuration table exists

The database SHALL have an mrs_config table for storing per-tenant MRS connection settings.

#### Scenario: Store MRS credentials

- **WHEN** a tenant configures their MRS connection
- **THEN** mrs_config stores tenantId, systemType (enum: openmrs, epic, cerner, athena, openemr), baseUrl, and encrypted credentials

#### Scenario: Store MRS capabilities override

- **WHEN** MRS has non-standard capabilities
- **THEN** mrs_config can store capabilitiesOverride as JSON to override discovered capabilities

#### Scenario: Track MRS health

- **WHEN** health checks run
- **THEN** mrs_config stores lastHealthCheckAt, isHealthy (boolean), and avgLatencyMs
