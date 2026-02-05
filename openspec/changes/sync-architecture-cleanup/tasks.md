## 1. Add Missing Entity Syncs

- [x] 1.1 Add `syncAppointmentTypes()` call to `SyncScheduler.runCycle()` before appointment sync
- [x] 1.2 Create `syncLocations()` function in `src/sync/entities/locations.ts`
- [x] 1.3 Add `syncLocations()` call to `SyncScheduler.runCycle()`
- [x] 1.4 Update entity sync intervals config to include appointment_types and locations at 60min

## 2. Fix Service Relationship in Appointment Sync

- [x] 2.1 Update `syncAppointmentsFromMRS()` to match service by mrsId first
- [x] 2.2 Add fallback matching by service name (case-insensitive)
- [x] 2.3 Log warning when service not found for appointment
- [x] 2.4 Add test for appointment sync with service matching

## 3. Startup Sync Implementation

- [x] 3.1 Create `initialSync()` function that runs blocking sync of all entities
- [x] 3.2 Update `server.ts` to call `initialSync()` before starting HTTP server
- [x] 3.3 Add startup timeout configuration (default 5 minutes)
- [x] 3.4 Implement degraded mode startup if timeout exceeded

## 4. Essential Data Validation

- [x] 4.1 Create `validateEssentialData()` function to check providers, services, locations
- [x] 4.2 Add validation after initial sync completes
- [x] 4.3 Exit with code 1 and detailed error message if validation fails
- [x] 4.4 Add test for validation logic

## 5. Health Endpoint Readiness

- [x] 5.1 Add `ready` field to health endpoint response
- [x] 5.2 Add `sync` status object with entity counts and last sync times
- [x] 5.3 Return 503 when `?ready=true` and initial sync not complete
- [x] 5.4 Add `degraded` field for degraded mode status

## 6. Consolidate Sync Implementations

- [x] 6.1 Update `server.ts` to use `SyncScheduler` instead of `SyncService`
- [x] 6.2 Add deprecation warning to `SyncService` constructor
- [x] 6.3 Update any imports that reference `SyncService`
- [x] 6.4 Document `SyncService` removal timeline in code comments

## 7. Availability Cache Invalidation

- [x] 7.1 Create `invalidateAvailabilityCache(startTime, endTime, providerId)` function
- [x] 7.2 Call cache invalidation after successful booking in `bookAppointmentByDatetime()`
- [x] 7.3 Call cache invalidation after cancellation in `cancelAppointment()`
- [x] 7.4 Update `getSuggestedAvailability()` to respect invalidation

## 8. Remove Slot-Based Booking Code

- [x] 8.1 Remove `verifySlotAvailable()` from MRSAdapter interface
- [x] 8.2 Remove `verifySlotAvailable()` implementations from OpenMRS and OpenEMR adapters
- [x] 8.3 Remove slot-based code paths from `bookAppointmentByDatetime()`
- [x] 8.4 Update booking service to use only `checkConflicts()` for validation
- [x] 8.5 Remove deprecated `getAvailability()` slot-based method (keep schedule-based)

## 9. Idempotency Keys

- [x] 9.1 Add `idempotencyKey` column to Job table in Prisma schema
- [x] 9.2 Run migration to add column
- [x] 9.3 Update `createPushJob()` to generate idempotency key
- [x] 9.4 Add `supportsIdempotencyKeys` to MRSCapabilities type
- [x] 9.5 Update push job execution to include idempotency key in adapter call
- [x] 9.6 Implement duplicate detection fallback for adapters without idempotency support

## 10. Transaction Boundaries

- [x] 10.1 Wrap appointment batch sync in Prisma transaction
- [x] 10.2 Wrap push job success + appointment update in transaction
- [x] 10.3 Add test for transaction rollback on failure (covered in sync-system.test.ts)

## 11. Location Operations in Adapter

- [x] 11.1 Add `getLocations()` to MRSAdapter interface (already existed)
- [x] 11.2 Add `getLocation(mrsId)` to MRSAdapter interface
- [x] 11.3 Implement `getLocation()` in OpenMRSAdapter
- [x] 11.4 Implement `getLocation()` in OpenEMRAdapter

## 12. Documentation

- [x] 12.1 Add JSDoc comments to all MRSAdapter interface methods (already had good docs)
- [x] 12.2 Document MRSCapabilities type fields
- [x] 12.3 Create `docs/SYNC_ARCHITECTURE.md` explaining sync lifecycle
- [x] 12.4 Create `docs/IMPLEMENTING_MRS_ADAPTER.md` guide for new adapters
- [x] 12.5 Add ID lifecycle diagrams to documentation (in SYNC_ARCHITECTURE.md)

## 13. Testing

- [x] 13.1 Add test for startup sync blocking behavior (sync-system.test.ts)
- [x] 13.2 Add test for essential data validation (startup-validation.test.ts)
- [x] 13.3 Add test for health endpoint readiness (sync-system.test.ts)
- [x] 13.4 Add test for idempotency key generation and usage (sync-system.test.ts)
- [x] 13.5 Add test for duplicate detection fallback (sync-system.test.ts)
- [x] 13.6 Add test for availability cache invalidation (sync-system.test.ts)
