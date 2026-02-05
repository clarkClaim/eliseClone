## Context

The sync architecture connects the voice assistant to MRS (Medical Record Systems) like OpenMRS. The voice model needs snappy responses (local-first queries) while maintaining eventual consistency with the MRS source of truth.

**Current state:**
- Two sync implementations exist: legacy `SyncService` and modern `SyncScheduler`
- Server starts accepting VAPI requests before essential data is synced
- `syncAppointmentTypes()` exists but is never called - causes `no_services_configured` errors
- Mixed slot-based and datetime-based booking models
- Cancellation push jobs not reliably propagating to MRS

**Constraints:**
- Must maintain abstraction so new MRS adapters (OpenEMR, Epic, etc.) follow the same patterns
- Cannot break existing appointment data - migrations must be backward-compatible
- Voice model response latency must remain under 500ms for availability queries

## Goals / Non-Goals

**Goals:**
- Server validates essential data exists before accepting VAPI requests
- All entity types are synced (including appointment types which are currently missing)
- Single canonical sync implementation (remove dual implementations)
- Clear documentation of abstraction for implementing new adapters
- Idempotent push operations prevent duplicates on retries
- Datetime-based booking is the only code path (remove slot-based legacy)

**Non-Goals:**
- Real-time webhooks from MRS (polling-based sync is sufficient for now)
- Multi-tenant support (single MRS per deployment)
- Automatic conflict resolution for all edge cases (some conflicts still require admin review)
- Performance optimization of sync intervals (current 5-minute cadence is acceptable)

## Decisions

### Decision 1: Startup Sync Before Accepting Requests

**Choice:** Block server startup until initial sync completes and validates essential data.

**Alternatives considered:**
- A) Accept requests immediately, sync in background → Rejected: causes `no_services_configured` errors
- B) Accept requests but return "not ready" errors → Rejected: poor UX, VAPI retries cause issues
- C) **Block startup until sync completes** → Chosen: guarantees data exists before first request

**Implementation:**
```
Server Start
  ├── Initialize MRS adapter
  ├── Health check MRS connection
  ├── Initial sync (blocking):
  │   ├── syncAppointmentTypes() ← NEW
  │   ├── syncLocations() ← NEW
  │   ├── syncProviders()
  │   ├── syncPatients()
  │   └── syncAppointments()
  ├── Validate essential data:
  │   ├── At least 1 provider with schedule template
  │   ├── At least 1 appointment type/service
  │   └── At least 1 location
  └── Start accepting requests
```

**Validation failure behavior:** Log error with details, exit with code 1. This prevents silent failures where the server appears healthy but can't book appointments.

---

### Decision 2: Consolidate to SyncScheduler

**Choice:** Keep `SyncScheduler`, deprecate and eventually remove `SyncService`.

**Alternatives considered:**
- A) Keep both, let deployments choose → Rejected: maintenance burden, config confusion
- B) **Consolidate to SyncScheduler** → Chosen: entity-specific intervals, better observability
- C) Write new implementation → Rejected: unnecessary, SyncScheduler is already well-designed

**Migration path:**
1. Add missing entity syncs to `SyncScheduler` (appointment types, locations)
2. Update `server.ts` to use `SyncScheduler` instead of `SyncService`
3. Mark `SyncService` as deprecated with console warning
4. Remove `SyncService` in future release

---

### Decision 3: Remove Slot-Based Booking Code

**Choice:** Remove all slot-based booking paths, datetime-based is the only model.

**Rationale:** Bahmni (O3) doesn't have pre-defined slots. Slot-based code was for legacy appointmentscheduling module which we no longer use.

**What to remove:**
- `adapter.verifySlotAvailable()` method and implementations
- `adapter.getAvailability()` slot-based variant (keep schedule-based)
- `Availability` table references in booking flow
- `slotId` field usage in appointment creation (keep field for data migration)

**What to keep:**
- `adapter.checkConflicts()` - datetime-based conflict checking
- `adapter.getScheduleConfig()` - for provider schedule templates
- `Availability` table - may still be used for caching computed slots

---

### Decision 4: Idempotency Keys for Push Operations

**Choice:** Add idempotency key column to Job table, include in MRS requests.

**Problem:** If push job retries after timeout (MRS created but DB not updated), duplicate appointments can be created.

**Implementation:**
```typescript
// Job table addition
idempotencyKey: string // UUID generated when job is created

// Appointment push
adapter.createAppointment({
  ...appointmentData,
  idempotencyKey: job.idempotencyKey  // MRS can dedupe
})
```

**Fallback:** For MRS systems that don't support idempotency keys, check for existing appointment with same patient/time/service before creating.

---

### Decision 5: Service Relationship During Appointment Sync

**Choice:** Match appointments to services by name or mrsId during sync.

**Problem:** Appointments synced from MRS have `serviceId = null` because the service relationship isn't populated.

**Implementation:**
```typescript
// During appointment sync from MRS
const mrsAppointment = await adapter.getAppointment(mrsId);
const service = await prisma.appointmentType.findFirst({
  where: {
    OR: [
      { mrsId: mrsAppointment.serviceUuid },
      { name: { contains: mrsAppointment.serviceName, mode: 'insensitive' } }
    ]
  }
});
appointment.serviceId = service?.id ?? null;
```

---

### Decision 6: Health Endpoint Reports Readiness

**Choice:** Extend `/health` to report sync readiness status.

**Response format:**
```json
{
  "status": "ok",
  "ready": true,
  "sync": {
    "initialSyncComplete": true,
    "lastSyncAt": "2024-01-15T10:30:00Z",
    "entities": {
      "providers": { "count": 3, "lastSync": "..." },
      "appointmentTypes": { "count": 5, "lastSync": "..." },
      "locations": { "count": 1, "lastSync": "..." }
    }
  }
}
```

**Kubernetes integration:** Use `readinessProbe` on `/health?ready=true` which returns 503 until initial sync completes.

## Risks / Trade-offs

### Risk: Startup time increases
**Impact:** Server takes longer to become ready (initial sync may take 30-60 seconds).
**Mitigation:**
- Sync entities in parallel where no dependencies exist
- Cache sync results for faster restarts (optional future optimization)
- Document expected startup time in deployment guide

### Risk: MRS unavailable at startup blocks indefinitely
**Impact:** If MRS is down, server never starts.
**Mitigation:**
- Add startup timeout (default: 5 minutes)
- After timeout, start in degraded mode with local-only booking
- Log clear warning about degraded state

### Risk: Removing slot-based code breaks existing deployments
**Impact:** Any deployment using slot-based booking would break.
**Mitigation:**
- Verify no production deployments use slot-based flow (all use datetime-based)
- Keep `slotId` column in database for historical data
- Migration script to null out unused slotId references

### Risk: Idempotency keys not supported by all MRS systems
**Impact:** Duplicate appointments possible on retry for unsupported systems.
**Mitigation:**
- Check for existing appointment before create (time window check)
- Log potential duplicate detection for admin review
- Document which MRS systems support idempotency

### Trade-off: Complexity vs. Reliability
**Trade-off:** Adding idempotency keys and startup validation adds complexity but significantly improves reliability.
**Decision:** Accept complexity. The `no_services_configured` errors and potential duplicates are worse than additional code.

## Migration Plan

### Phase 1: Add Missing Syncs (No Breaking Changes)
1. Add `syncAppointmentTypes()` call to sync cycle
2. Add `syncLocations()` call to sync cycle
3. Fix service relationship in appointment sync
4. Deploy and verify appointment types populate

### Phase 2: Startup Validation
1. Add blocking initial sync to server startup
2. Add essential data validation
3. Update `/health` endpoint with readiness
4. Deploy with increased startup timeout in k8s

### Phase 3: Consolidate Sync Implementations
1. Switch `server.ts` to use `SyncScheduler`
2. Add deprecation warning to `SyncService`
3. Monitor for any issues
4. Remove `SyncService` after 2 weeks stable

### Phase 4: Remove Slot-Based Code
1. Remove `verifySlotAvailable()` from adapter interface
2. Remove slot-based code paths in booking service
3. Update tests
4. Deploy

### Phase 5: Add Idempotency Keys
1. Add `idempotencyKey` column to Job table
2. Update push job creation to generate keys
3. Update adapter to include keys in requests
4. Deploy

### Rollback Strategy
Each phase is independently rollbackable:
- Phase 1-2: Revert commits, redeploy
- Phase 3: Switch back to `SyncService` (it's only deprecated, not removed)
- Phase 4-5: Revert commits, migration down for schema changes

## Open Questions

1. **Should startup sync have a configurable timeout?** Currently planning 5 minutes. Should this be an env var?

2. **What's the minimum essential data set?** Currently requiring 1 provider + 1 service + 1 location. Should we require provider to have a schedule template?

3. **Should we add metrics/observability for sync health?** Could expose Prometheus metrics for sync duration, failure rate, etc.

4. **How to handle appointment types that exist locally but not in MRS?** Currently MRS-wins means they'd be deleted. Should we preserve local-only types?
