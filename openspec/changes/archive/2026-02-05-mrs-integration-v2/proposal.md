## Why

The current Phase 2 sync implementation is tightly coupled to OpenMRS specifics, making it difficult to support other MRS systems (Epic, Cerner, athenahealth, OpenEMR). Additionally, our booking flow doesn't validate slot availability with the MRS in real-time, risking conflicts that can't be resolved interactively with the patient. We need a robust MRS abstraction layer and a booking flow that validates against the source of truth while keeping reads fast via local caching.

## What Changes

- **MRS Adapter Abstraction**: New interface defining how we interact with any MRS, with capability discovery (what each MRS can/can't do)
- **OpenMRS Adapter**: First concrete implementation following the new interface
- **MRS-First Booking Flow**: During live calls, validate and book in MRS first so conflicts can be handled interactively; fall back gracefully if MRS unavailable
- **Local-First Reads**: Use local cache for all read operations (availability queries, patient lookup) to maintain fast response times
- **Continuous Sync Service**: Background polling with rate limit awareness, change detection, and conflict resolution
- **Capability-Based Behavior**: System adapts based on what each MRS supports (e.g., some don't allow patient search, some are read-only)
- **Schema Additions**: Track MRS sync state, push status, and conflicts per `PHASE2_SYNC_CONSIDERATIONS.md`

## Capabilities

### New Capabilities

- `mrs-adapter`: Abstract interface for MRS integration with capability discovery, supporting multiple backend systems (OpenMRS, Epic, Cerner, athenahealth, OpenEMR). Defines read/write operations, rate limiting, and error handling patterns.
- `mrs-sync-service`: Background service for continuous synchronization between MRS and local database. Handles polling intervals, change detection, conflict resolution, and sync state tracking.
- `mrs-booking-flow`: Real-time booking flow that validates and creates appointments in MRS first during live calls, with interactive conflict resolution and graceful degradation.

### Modified Capabilities

- `database-schema`: Add MRS sync tracking fields (mrsUpdatedAt, syncedToMrs, lastSyncError, syncAttempts) and SyncConflict table for audit trail.

## Impact

**Code:**
- New `src/mrs/` directory with adapter interface and implementations
- New `src/sync/` directory for sync service
- Modify booking tools to use MRS-first flow
- Modify availability queries to use local cache with freshness awareness

**Database:**
- Migration adding sync tracking columns to Appointment, Availability
- New SyncConflict table
- Enhanced SyncState table with observability fields

**APIs:**
- Tool handlers gain MRS validation step
- New internal APIs for sync status/health

**Dependencies:**
- No new external dependencies (use native fetch)
- Configuration for multiple MRS backends per tenant

**Systems:**
- Background job worker for sync polling
- Rate limit tracking per MRS endpoint
- Observability: sync metrics, conflict counts, push success rates
