## 1. Schema Updates

- [x] 1.1 Add mrsUpdatedAt column to Availability model
- [x] 1.2 Add mrsExists column to Availability model (default true)
- [x] 1.3 Add sync tracking columns to Appointment model (syncedToMrs, syncedToMrsAt, lastSyncError, syncAttempts, mrsUpdatedAt)
- [x] 1.4 Add observability columns to SyncState model (nextSyncAt, lastSyncDuration, recordsProcessed, consecutiveFailures)
- [x] 1.5 Add backoff columns to Job model (backoffExponent, nextRetryAt)
- [x] 1.6 Create SyncConflict model with all required fields
- [x] 1.7 Run prisma migrate dev to generate migration

## 2. MRS Adapter Interface

- [x] 2.1 Create src/mrs/types.ts with canonical types (Patient, Provider, Appointment, Slot, etc.)
- [x] 2.2 Create src/mrs/adapter.ts with MRSAdapter interface definition
- [x] 2.3 Create src/mrs/errors.ts with MRS-specific error classes (AuthenticationError, MRSError, TimeoutError, NotFoundError)

## 3. OpenMRS Adapter Implementation

- [x] 3.1 Create src/mrs/openmrs/client.ts with HTTP client (fetch with retry, timeout, auth)
- [x] 3.2 Create src/mrs/openmrs/mappers.ts with data transformation functions
- [x] 3.3 Create src/mrs/openmrs/adapter.ts implementing MRSAdapter interface
- [x] 3.4 Implement getPatient and searchPatients methods
- [x] 3.5 Implement getProvider and getProviders methods
- [x] 3.6 Implement getAppointments, createAppointment, cancelAppointment methods
- [x] 3.7 Implement getAvailability method
- [x] 3.8 Add environment variable validation (OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD)

## 4. Sync Service Core

- [x] 4.1 Create src/sync/service.ts with SyncService class skeleton
- [x] 4.2 Implement sync interval loop with SYNC_INTERVAL_MS configuration
- [x] 4.3 Implement sync state tracking (read/update sync_state table)
- [x] 4.4 Implement patient sync (import new, update existing with MRS-wins)
- [x] 4.5 Implement provider sync
- [x] 4.6 Implement availability sync with mrsExists flag handling
- [x] 4.7 Implement appointment import from MRS

## 5. Bidirectional Appointment Sync

- [x] 5.1 Implement push-to-MRS for local appointments (syncedToMrs=false)
- [x] 5.2 Implement push failure handling (increment syncAttempts, record lastSyncError)
- [x] 5.3 Create retry job with exponential backoff on push failure
- [x] 5.4 Implement verifySlotAvailable method for booking flow

## 6. Conflict Detection and Logging

- [x] 6.1 Implement conflict detection for local-only appointments
- [x] 6.2 Implement conflict detection for data divergence
- [x] 6.3 Implement SyncConflict record creation with full context
- [x] 6.4 Implement conflict resolution application (MRS-wins for source data)

## 7. Error Handling and Observability

- [x] 7.1 Implement MRS unavailability handling with consecutiveFailures tracking
- [x] 7.2 Add logging for sync cycle start/completion/errors
- [x] 7.3 Track recordsProcessed and lastSyncDuration per sync cycle
- [x] 7.4 Add warning log when consecutiveFailures exceeds threshold

## 8. Integration

- [x] 8.1 Add OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD to .env.example
- [x] 8.2 Add SYNC_INTERVAL_MS to .env.example
- [x] 8.3 Create src/sync/index.ts to export sync service
- [x] 8.4 Wire sync service startup into server.ts
- [x] 8.5 Update README with sync service documentation
