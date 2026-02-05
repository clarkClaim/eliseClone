# MRS Integration v2 - Implementation Tasks

## 1. Schema Updates

- [x] 1.1 Add rate limit tracking fields to SyncState model (rateLimitRemaining, rateLimitResetAt, backoffUntil)
- [x] 1.2 Create MrsConfig model for per-tenant MRS connection settings
- [x] 1.3 Update Job model type field to include MRS operation types in comments
- [x] 1.4 Generate and apply Prisma migration for schema changes

## 2. MRS Adapter Interface

- [x] 2.1 Create `src/mrs/types.ts` with MRSCapabilities, MRSAdapter interface, and MRS entity types (MRSPatient, MRSProvider, etc.)
- [x] 2.2 Create `src/mrs/errors.ts` with typed errors (MRSAuthenticationError, MRSRateLimitError, MRSTimeoutError, SlotConflictError, SlotNotFoundError)
- [x] 2.3 Create `src/mrs/adapter.ts` exporting the abstract adapter interface
- [x] 2.4 Document MRS system reference in `src/mrs/systems/README.md` (OpenMRS, Epic, Cerner, athena, OpenEMR capabilities)

## 3. OpenMRS Adapter Implementation

- [x] 3.1 Create `src/mrs/adapters/openmrs/client.ts` with HTTP client, Basic Auth, and request helpers
- [x] 3.2 Create `src/mrs/adapters/openmrs/capabilities.ts` defining OpenMRS capability configuration
- [x] 3.3 Implement `getPatients()` - fetch patients from OpenMRS REST API
- [x] 3.4 Implement `getProviders()` and `getLocations()`
- [x] 3.5 Implement `getAvailability(dateRange)` - fetch time slots from appointment scheduling module
- [x] 3.6 Implement `getAppointments(dateRange)` - fetch appointments
- [x] 3.7 Implement `verifySlotAvailable(slotId)` - real-time slot validation
- [x] 3.8 Implement `createAppointment(request)` - POST to appointment scheduling module
- [x] 3.9 Implement `cancelAppointment(mrsId, reason)` - update status to CANCELLED
- [x] 3.10 Implement `connect()`, `disconnect()`, and `healthCheck()` methods
- [x] 3.11 Create `src/mrs/adapters/openmrs/index.ts` exporting OpenMRSAdapter class

## 4. Sync Service Core

- [x] 4.1 Create `src/sync/types.ts` with SyncResult, ChangeSet, and SyncSchedulerConfig types
- [x] 4.2 Create `src/sync/change-detection.ts` with `detectChanges()` function for comparing MRS vs local data
- [x] 4.3 Create `src/sync/conflict-resolution.ts` with conflict detection and resolution rules
- [x] 4.4 Create `src/sync/rate-limiter.ts` with rate limit tracking and backoff logic

## 5. Entity Sync Implementations

- [x] 5.1 Create `src/sync/entities/patients.ts` - patient sync with conflict resolution
- [x] 5.2 Create `src/sync/entities/providers.ts` - provider sync
- [x] 5.3 Create `src/sync/entities/locations.ts` - location sync
- [x] 5.4 Create `src/sync/entities/availability.ts` - availability sync with mrsExists tracking
- [x] 5.5 Create `src/sync/entities/appointments.ts` - bidirectional appointment sync

## 6. Sync Scheduler

- [x] 6.1 Create `src/sync/scheduler.ts` with interval-based sync scheduling per entity type
- [x] 6.2 Implement job creation for sync tasks with proper priorities
- [x] 6.3 Implement adaptive interval adjustment based on rate limits and failures
- [x] 6.4 Create `src/sync/jobs/sync-job-handler.ts` to process sync jobs from queue

## 7. Push Service

- [x] 7.1 Create `src/sync/push/appointment-push.ts` for pushing local appointments to MRS
- [x] 7.2 Create `src/sync/push/cancellation-push.ts` for pushing cancellations to MRS
- [x] 7.3 Implement retry logic with exponential backoff for failed pushes
- [x] 7.4 Create job handlers for push_appointment_to_mrs and push_cancellation_to_mrs

## 8. Booking Flow Updates

- [x] 8.1 Update `check_availability` tool to return freshness metadata (lastSyncedAt, isStale)
- [x] 8.2 Create `src/booking/mrs-booking.ts` with MRS-first booking flow
- [x] 8.3 Implement slot verification step before booking
- [x] 8.4 Implement MRS appointment creation with conflict handling
- [x] 8.5 Implement graceful degradation (local-first with push queue) when MRS unavailable
- [x] 8.6 Update `book_appointment` tool to use new MRS-first flow
- [x] 8.7 Update `cancel_appointment` tool to push cancellations to MRS
- [x] 8.8 Add optional `forceRefresh` parameter to availability queries

## 9. Observability & Monitoring

- [x] 9.1 Add sync metrics logging (duration, records processed, conflicts)
- [x] 9.2 Add push metrics logging (success rate, retry counts)
- [x] 9.3 Create health check endpoint for MRS connection status
- [x] 9.4 Implement alerting for consecutive sync failures (log warning at threshold)

## 10. Demo Reset Handling

- [x] 10.1 Implement demo reset detection (record count drops > 50%)
- [x] 10.2 Create full re-sync trigger mechanism
- [x] 10.3 Add logic to flag recent bookings for review on reset detection

## 11. Testing

- [x] 11.1 Create mock MRS adapter for testing
- [x] 11.2 Write unit tests for change detection logic
- [x] 11.3 Write unit tests for conflict resolution rules
- [x] 11.4 Write integration tests for OpenMRS adapter (against demo instance)
- [x] 11.5 Write integration tests for booking flow with MRS validation
- [x] 11.6 Write tests for graceful degradation scenarios

## 12. Documentation

- [x] 12.1 Update TECHNICAL_EXPLORATION.md with MRS adapter architecture
- [x] 12.2 Update README.md with MRS integration configuration
- [x] 12.3 Document sync configuration options in code comments
- [x] 12.4 Create troubleshooting guide for common sync issues
