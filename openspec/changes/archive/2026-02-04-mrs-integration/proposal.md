## Why

Phase 1 established the database schema and local infrastructure, but the system cannot yet communicate with OpenMRS. Without MRS integration, there is no patient/provider data to schedule against, and appointments exist only locally with no synchronization to the source of truth.

## What Changes

- Add MRS Adapter interface defining abstract operations for any medical record system
- Implement OpenMRS adapter with authentication, data mapping, and error handling
- Build Sync Service that polls OpenMRS, updates the Context Store, and handles conflicts
- Extend database schema with sync tracking fields (MRS timestamps, push status, conflict logging)
- Add sync-related job types to the job queue for retry logic

## Capabilities

### New Capabilities

- `mrs-adapter`: Abstract interface for medical record system integration with standard operations (patients, providers, appointments, availability)
- `openmrs-adapter`: Concrete OpenMRS implementation with REST API integration, authentication, and data transformation
- `sync-service`: Background service that polls MRS, syncs changes bidirectionally, and handles conflicts with configurable resolution rules

### Modified Capabilities

- `database-schema`: Add sync tracking columns (mrsUpdatedAt, syncedToMrs, syncAttempts, lastSyncError), mrsExists flag on availability, SyncConflict table, and enhanced SyncState/Job fields

## Impact

- **Schema Changes:** Requires new Prisma migration with additional columns and tables
- **New Services:** Sync Service runs as background process alongside main server
- **Configuration:** New environment variables for OpenMRS connection (OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD)
- **Dependencies:** HTTP client for OpenMRS REST API calls
- **Operations:** Sync failures will be logged and retried; conflicts logged to SyncConflict table
