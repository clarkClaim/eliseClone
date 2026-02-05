## Why

The sync architecture has grown organically with dual implementations (legacy `SyncService` and modern `SyncScheduler`), mixed slot-based and datetime-based booking models, and inconsistent patterns across entity types. This creates confusion, potential bugs, and makes it difficult for the voice model to confidently report booking status. The voice assistant needs snappy local-first queries with clear guarantees about eventual consistency with the MRS.

**Critical requirement**: The abstraction must remain clean so that implementing a new MRS adapter (like OpenEMR) follows the same patterns. The sync architecture should not have OpenMRS-specific logic leaking into shared code.

### Real-World Issues from Recent Calls

Review of the 4 most recent VAPI calls and server logs revealed these issues:

1. **`no_services_configured` error during reschedule** - When an appointment synced from MRS has no `serviceId`, the reschedule tool can't find any AppointmentType to use. **Root cause: `syncAppointmentTypes()` function exists but is never called in the sync cycle.**

2. **Stale availability showing booked slots as open** - User was offered 8:00 AM and 8:30 AM slots that immediately returned "conflict" errors when booking. Local availability cache was out of sync with actual bookings.

3. **Cancellation push delays** - Logs show repeated "Skipping appointment - has pending local changes" where local status is 'cancelled' but MRS still shows 'scheduled'. Cancellation jobs are processing but changes aren't propagating reliably.

4. **Empty service name in appointment displays** - `serviceName: ""` appearing in tool responses because the service relationship isn't hydrated during appointment sync.

5. **Patient ID inconsistency** - Same caller (Joshua Clark, DOB Nov 9 1997) received different patient IDs across calls, suggesting patient deduplication or lookup issues.

### Missing Startup Behavior

The server currently starts accepting VAPI requests immediately, even before essential data is synced:

- **No appointment types sync** - `syncAppointmentTypes()` exists but is never called
- **No readiness check** - Server accepts requests before initial sync completes
- **No essential data validation** - No check that providers, services, etc. exist before going "ready"
- **No locations sync** - Locations are referenced but not synced from MRS

## What Changes

### Startup & Initialization
- **Add startup sync phase** - On server start, run a blocking initial sync of essential entities before accepting requests
- **Sync appointment types** - Add `syncAppointmentTypes()` to the sync cycle (currently exists but not called)
- **Sync locations** - Add location sync to the cycle
- **Add readiness check** - Server health endpoint reports "not ready" until initial sync completes
- **Validate essential data** - After initial sync, verify at least one provider, one service, and one location exist

### Abstraction & Architecture
- **Preserve abstraction boundaries** - Ensure all MRS-specific logic stays in adapters, sync uses only adapter interface methods
- **Consolidate sync implementations** - Remove legacy `SyncService`, keep only `SyncScheduler` with entity-specific intervals
- **Complete datetime-based booking migration** - Remove all slot-based booking code paths and database references

### Data Integrity
- **Fix service relationship sync** - Ensure appointments synced from MRS have proper service linkage
- **Fix patient deduplication** - Ensure consistent patient lookup across calls
- **Standardize conflict resolution** - Document and enforce consistent MRS-wins vs local-wins rules
- **Add idempotency keys** - Prevent duplicate appointments on push retries

### Reliability
- **Improve push job reliability** - Fix cancellation push to reliably update MRS
- **Improve availability freshness** - Better cache invalidation after local bookings
- **Add transaction boundaries** - Wrap multi-step sync operations in database transactions

### Documentation
- **Document the abstraction** - Clear explanation of ID relationships, sync lifecycle, and how to implement a new adapter

## Capabilities

### New Capabilities

- `sync-startup-behavior`: Defines the startup sequence - what gets synced, in what order, what validation happens, and when the server becomes "ready" to accept requests. Essential for ensuring the voice model never encounters missing data.
- `sync-architecture-docs`: Documentation explaining how the MRS abstraction works, ID relationships, sync lifecycle, conflict resolution patterns, and guide for implementing new adapters (e.g., OpenEMR). This is reference material for developers working with the sync system.
- `idempotent-push-operations`: Idempotency key support for appointment and patient push operations to prevent duplicates on retries.

### Modified Capabilities

- `mrs-sync-service`: Consolidate to single scheduler implementation, remove legacy sync service, add transaction boundaries, fix service relationship sync, **add appointment types and locations to sync cycle**
- `mrs-booking-flow`: Remove slot-based verification paths, clarify datetime-based conflict checking as the only pattern, improve availability cache invalidation
- `mrs-adapter`: Remove deprecated slot-based methods (`getAvailability` for slots, `verifySlotAvailable`), update capability flags, document interface contract for new implementations

## Impact

**Code changes:**
- `src/server.ts` - Add startup sync phase, readiness check, block requests until ready
- `src/sync/service.ts` - Remove or mark as deprecated
- `src/sync/scheduler.ts` - Becomes the canonical sync implementation, add missing entity syncs
- `src/sync/entities/appointments.ts` - Fix service relationship population
- `src/sync/push/appointment-push.ts` - Add idempotency keys
- `src/sync/push/cancellation-push.ts` - Add idempotency keys, fix reliability
- `src/mrs/adapter.ts` - Remove deprecated slot-based methods, add JSDoc for implementers
- `src/mrs/adapters/openmrs/adapter.ts` - Remove slot-based implementations
- `src/mrs/adapters/openemr/adapter.ts` - Ensure follows same patterns as OpenMRS
- `src/scheduling/booking-service.ts` - Remove slot-based code paths, improve cache invalidation
- `src/agent/tools/suggested-availability.ts` - Ensure availability reflects recent bookings
- `src/agent/tools/identify-patient.ts` - Fix patient deduplication
- Database: May need idempotency key column on Job table

**APIs affected:**
- Health endpoint (`/health`) - Add readiness status
- Internal sync APIs (no external API changes)
- Tool responses may include clearer sync status

**Dependencies:**
- No new dependencies required
- Existing MRS adapters (OpenMRS, OpenEMR) need method removal

**Systems:**
- Voice agent will have clearer booking status feedback
- Voice agent will never encounter "no services configured" error
- Sync conflicts will be more consistently resolved
- Reduced complexity for future MRS adapter implementations
- OpenEMR implementation can follow documented patterns
