## Context

**Current State:** Phase 1 (project scaffolding) is complete with database schema, Prisma models, and local development environment. The schema includes placeholder fields for MRS integration but no actual sync implementation exists.

**Problem:** The original Phase 2 design assumed direct OpenMRS integration. However:
1. Different MRS systems have vastly different APIs, capabilities, and constraints
2. Our booking flow doesn't validate with MRS in real-time, risking conflicts
3. No abstraction exists to swap MRS backends or handle capability differences

**Constraints:**
- Must work with OpenMRS demo instance (which periodically resets)
- MRS systems don't provide webhooks; we must poll
- Rate limits vary by system and are often undocumented
- Some MRS systems are read-only for third-party integrations
- HIPAA requires audit trails for all PHI access

**Stakeholders:**
- Voice agent (needs fast availability queries)
- Patients (need reliable booking confirmation)
- Clinic staff (need visibility into sync status/conflicts)
- Future integrations (Epic, Cerner, etc.)

## Goals / Non-Goals

**Goals:**
- Abstract MRS integration behind a capability-aware interface
- Enable MRS-first booking during live calls for interactive conflict resolution
- Keep reads fast via local caching with known freshness
- Handle rate limits gracefully without failing calls
- Document MRS system differences to guide future adapters
- Provide observability into sync health and conflicts

**Non-Goals:**
- Implement adapters for Epic/Cerner/athenahealth (future work; document only)
- Real-time push notifications from MRS (not supported; polling only)
- Patient registration in MRS (out of scope; patients must exist)
- Multi-tenant MRS routing (tenant config exists; implementation later)
- FHIR-native integration (OpenMRS FHIR doesn't support appointments)

## Decisions

### 1. MRS Adapter Interface Design

**Decision:** Create a capability-aware adapter interface that adapters implement.

```typescript
interface MRSCapabilities {
  // Search capabilities
  patientSearch: {
    byPhone: boolean;
    byName: boolean;
    byDOB: boolean;
    byIdentifier: boolean;
    globalSearch: boolean;  // Can search all patients vs. specific lookup only
  };

  // Appointment capabilities
  appointments: {
    canCreate: boolean;
    canCancel: boolean;
    canReschedule: boolean;
    canQueryByDateRange: boolean;
    canQueryByPatient: boolean;
    supportsStatuses: string[];  // Which statuses are supported
  };

  // Sync capabilities
  sync: {
    supportsIncrementalSync: boolean;
    supportsWebhooks: boolean;
    hasModifiedSinceQuery: boolean;
  };

  // Rate limiting
  rateLimits: {
    requestsPerMinute: number | null;  // null = unknown
    requestsPerHour: number | null;
    burstLimit: number | null;
    perEndpointLimits: Record<string, number>;
  };
}

interface MRSAdapter {
  // Identity
  readonly systemType: 'openmrs' | 'epic' | 'cerner' | 'athena' | 'openemr';
  readonly capabilities: MRSCapabilities;

  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;

  // Read operations (for sync)
  getPatients(options?: { since?: Date; limit?: number }): Promise<MRSPatient[]>;
  getProviders(): Promise<MRSProvider[]>;
  getLocations(): Promise<MRSLocation[]>;
  getAppointmentTypes(): Promise<MRSAppointmentType[]>;
  getAvailability(range: DateRange): Promise<MRSTimeSlot[]>;
  getAppointments(range: DateRange): Promise<MRSAppointment[]>;

  // Real-time validation (for booking flow)
  verifySlotAvailable(slotId: string): Promise<{ available: boolean; slot?: MRSTimeSlot }>;

  // Write operations
  createAppointment(request: CreateAppointmentRequest): Promise<MRSAppointment>;
  cancelAppointment(mrsId: string, reason?: string): Promise<void>;
  updateAppointmentStatus(mrsId: string, status: string): Promise<void>;
}
```

**Rationale:** Capabilities are discovered, not assumed. The booking flow can check `capabilities.appointments.canCreate` before attempting writes. Sync can check `capabilities.sync.hasModifiedSinceQuery` to optimize polling.

**Alternatives Considered:**
- Single interface without capabilities → Rejected: Would require try/catch everywhere
- Separate interfaces per MRS → Rejected: Harder to write generic sync logic

### 2. MRS System Reference Documentation

**Decision:** Document known MRS systems to guide adapter development.

#### OpenMRS
```yaml
system: openmrs
auth: Basic Auth (username:password base64)
baseUrl: /openmrs/ws/rest/v1/
appointmentModule: /appointmentscheduling/ (separate install)

capabilities:
  patientSearch:
    byPhone: false  # Must maintain locally
    byName: true    # GET /patient?q=name
    byDOB: false    # No direct DOB search
    byIdentifier: true
    globalSearch: true

  appointments:
    canCreate: true
    canCancel: true  # Set status to CANCELLED
    canReschedule: false  # Must cancel + create new
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [SCHEDULED, ARRIVED, IN_SERVICE, COMPLETED, CANCELLED, MISSED]

  sync:
    supportsIncrementalSync: false
    supportsWebhooks: false
    hasModifiedSinceQuery: false

  rateLimits:
    requestsPerMinute: 60  # Conservative estimate
    requestsPerHour: 1000
    burstLimit: 10

  notes:
    - Demo instance resets periodically
    - Time slot duration configured in UI only
    - Appointment requires existing time slot
```

#### Epic (Future Reference)
```yaml
system: epic
auth: OAuth2 SMART-on-FHIR
baseUrl: /api/FHIR/R4/

capabilities:
  patientSearch:
    byPhone: false  # Privacy restricted
    byName: false   # Requires exact match + DOB
    byDOB: true     # With name
    byIdentifier: true
    globalSearch: false  # Must have patient context

  appointments:
    canCreate: true  # With proper scopes
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [proposed, pending, booked, arrived, fulfilled, cancelled, noshow]

  sync:
    supportsIncrementalSync: true  # _lastUpdated param
    supportsWebhooks: false  # Subscriptions limited
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 100
    requestsPerHour: 5000
    burstLimit: 20

  notes:
    - Requires App Orchard approval
    - Patient context often required (no global queries)
    - Strict sandbox testing required
    - Must handle token refresh
```

#### Cerner (Oracle Health) (Future Reference)
```yaml
system: cerner
auth: OAuth2 SMART-on-FHIR
baseUrl: /fhir/r4/

capabilities:
  patientSearch:
    byPhone: false
    byName: true  # With additional demographics
    byDOB: true
    byIdentifier: true
    globalSearch: false

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [proposed, pending, booked, arrived, fulfilled, cancelled, noshow, entered-in-error]

  sync:
    supportsIncrementalSync: true
    supportsWebhooks: false
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 120
    requestsPerHour: 3600
    burstLimit: 25

  notes:
    - Similar to Epic (FHIR R4)
    - Millennium platform specifics
    - Strict data use agreements
```

#### athenahealth (Future Reference)
```yaml
system: athena
auth: OAuth2 (client credentials)
baseUrl: /v1/{practiceid}/

capabilities:
  patientSearch:
    byPhone: true   # More permissive
    byName: true
    byDOB: true
    byIdentifier: true
    globalSearch: true  # Within practice

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [open, scheduled, checked_in, checked_out, cancelled, no_show]

  sync:
    supportsIncrementalSync: true
    supportsWebhooks: true  # Changed data subscriptions
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 200
    requestsPerHour: 10000
    burstLimit: 50

  notes:
    - More developer-friendly than Epic/Cerner
    - Practice-scoped API
    - Supports webhooks for some events
```

#### OpenEMR (Future Reference)
```yaml
system: openemr
auth: OAuth2 or API token
baseUrl: /apis/default/fhir/

capabilities:
  patientSearch:
    byPhone: false
    byName: true
    byDOB: true
    byIdentifier: true
    globalSearch: true

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: false
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: varies  # Version dependent

  sync:
    supportsIncrementalSync: false
    supportsWebhooks: false
    hasModifiedSinceQuery: false

  rateLimits:
    requestsPerMinute: null  # Self-hosted, varies
    requestsPerHour: null
    burstLimit: null

  notes:
    - Open source, similar to OpenMRS
    - Installation-dependent capabilities
    - FHIR support varies by version
```

### 3. Booking Flow: MRS-First During Live Calls

**Decision:** During live voice/chat calls, validate and create in MRS first, then record locally.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LIVE BOOKING FLOW (MRS-First)                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Patient: "I'll take the 2pm slot"                                  │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────┐                        │
│  │  1. VERIFY SLOT (real-time MRS call)    │                        │
│  │     GET /appointmentscheduling/timeslot/{id}                     │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│         ┌─────────┴─────────┐                                       │
│         │                   │                                       │
│         ▼                   ▼                                       │
│     AVAILABLE           NOT AVAILABLE                               │
│         │                   │                                       │
│         │                   ▼                                       │
│         │        "Sorry, that slot was just taken.                  │
│         │         I have 2:30pm and 3pm still open.                 │
│         │         Which would you prefer?"                          │
│         │                   │                                       │
│         │                   └──────── (patient chooses, retry)      │
│         ▼                                                           │
│  ┌─────────────────────────────────────────┐                        │
│  │  2. CREATE IN MRS                       │                        │
│  │     POST /appointmentscheduling/appointment                      │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│         ┌─────────┴─────────┐                                       │
│         │                   │                                       │
│         ▼                   ▼                                       │
│     SUCCESS             FAILURE                                     │
│         │                   │                                       │
│         │         ┌─────────┴─────────┐                             │
│         │         │                   │                             │
│         │         ▼                   ▼                              │
│         │    CONFLICT           MRS UNAVAILABLE                     │
│         │    (slot taken)       (timeout/error)                     │
│         │         │                   │                             │
│         │         ▼                   ▼                              │
│         │    Retry with         DEGRADE: Book locally,              │
│         │    alternatives       queue push job, warn:               │
│         │                       "Booked! Note: confirmation         │
│         │                        pending system sync"               │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────┐                        │
│  │  3. RECORD LOCALLY                      │                        │
│  │     - Create appointment with mrs_id    │                        │
│  │     - Mark availability as booked       │                        │
│  │     - Set syncedToMrs = true            │                        │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│                   ▼                                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │  4. CONFIRM TO PATIENT                  │                        │
│  │     "You're all set for Tuesday at 2pm  │                        │
│  │      with Dr. Smith!"                   │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Rationale:**
- Patient is on the call—we can ask for alternatives if conflict
- MRS is source of truth; booking there first prevents orphaned local records
- Graceful degradation if MRS is slow/down (book locally, sync later)

**Alternatives Considered:**
- Local-first → Rejected: Can't resolve conflicts interactively after patient hangs up
- Dual-write (parallel) → Rejected: Complex rollback if one fails

### 4. Local-First Reads with Freshness Tracking

**Decision:** All availability queries use local cache. Track freshness and warn if stale.

```typescript
interface SlotWithFreshness {
  slot: Availability;
  lastSyncedAt: Date;
  freshnessMs: number;  // How old is this data?
  isStale: boolean;     // > threshold (e.g., 10 min)
}

// Query returns freshness metadata
async function getAvailableSlots(
  date: Date,
  providerId?: string
): Promise<{ slots: SlotWithFreshness[]; syncStatus: SyncStatus }> {
  const slots = await db.availability.findMany({ ... });
  const syncState = await db.syncState.findUnique({
    where: { entityType: 'availability' }
  });

  return {
    slots: slots.map(s => ({
      slot: s,
      lastSyncedAt: syncState.lastSyncAt,
      freshnessMs: Date.now() - syncState.lastSyncAt.getTime(),
      isStale: (Date.now() - syncState.lastSyncAt.getTime()) > STALE_THRESHOLD_MS,
    })),
    syncStatus: {
      lastSync: syncState.lastSyncAt,
      nextSync: syncState.nextSyncAt,
      status: syncState.syncStatus,
    },
  };
}
```

**Rationale:**
- Local reads are fast (milliseconds vs. seconds for MRS)
- Voice agent can't wait for MRS round-trip on every query
- Freshness metadata lets UI/agent warn if data might be outdated
- Real-time validation happens at booking time (Decision 3)

### 5. Continuous Sync with Rate Limit Awareness

**Decision:** Background sync service with adaptive polling and rate limit tracking.

```typescript
interface SyncScheduler {
  // Sync configuration per entity
  schedules: {
    availability: { intervalMs: 5 * 60 * 1000, priority: 'high' };
    appointments: { intervalMs: 5 * 60 * 1000, priority: 'high' };
    patients: { intervalMs: 30 * 60 * 1000, priority: 'medium' };
    providers: { intervalMs: 60 * 60 * 1000, priority: 'low' };
    locations: { intervalMs: 60 * 60 * 1000, priority: 'low' };
  };

  // Rate limit tracking
  rateLimitState: {
    remainingRequests: number;
    resetAt: Date;
    consecutiveFailures: number;
    backoffUntil: Date | null;
  };
}

// Adaptive behavior
- If rate limit hit → Exponential backoff (1min, 2min, 4min, max 30min)
- If MRS slow (>5s response) → Increase interval temporarily
- If MRS unavailable → Skip sync, mark status, alert if persistent
- If consecutive failures > 5 → Alert admin, reduce frequency
```

**Change Detection Strategy (without modified-since):**

```typescript
async function detectChanges(
  entityType: 'availability' | 'appointments',
  mrsData: MRSRecord[],
  localData: LocalRecord[]
): Promise<ChangeSet> {
  const changes: ChangeSet = { created: [], updated: [], deleted: [] };

  const localByMrsId = new Map(localData.map(r => [r.mrsId, r]));
  const mrsIdsSeen = new Set<string>();

  for (const mrsRecord of mrsData) {
    mrsIdsSeen.add(mrsRecord.uuid);
    const local = localByMrsId.get(mrsRecord.uuid);

    if (!local) {
      changes.created.push(mrsRecord);
    } else if (hasChanged(local, mrsRecord)) {
      changes.updated.push({ local, mrs: mrsRecord });
    }
  }

  // Records in local but not in MRS (within sync range)
  for (const [mrsId, local] of localByMrsId) {
    if (!mrsIdsSeen.has(mrsId) && local.mrsId) {
      changes.deleted.push(local);
    }
  }

  return changes;
}
```

### 6. Schema Additions

**Decision:** Add sync tracking per `PHASE2_SYNC_CONSIDERATIONS.md` plus observability.

```prisma
model Appointment {
  // ... existing fields ...

  // MRS sync tracking
  mrsUpdatedAt    DateTime?  @map("mrs_updated_at")
  syncedToMrs     Boolean    @default(false) @map("synced_to_mrs")
  syncedToMrsAt   DateTime?  @map("synced_to_mrs_at")
  lastSyncError   String?    @map("last_sync_error")
  syncAttempts    Int        @default(0) @map("sync_attempts")
}

model Availability {
  // ... existing fields ...

  mrsUpdatedAt    DateTime?  @map("mrs_updated_at")
  mrsExists       Boolean    @default(true) @map("mrs_exists")  // Deleted in MRS?
}

model SyncConflict {
  id            String   @id @default(uuid())
  entityType    String   @map("entity_type")
  entityId      String   @map("entity_id")
  mrsId         String?  @map("mrs_id")
  conflictType  String   @map("conflict_type")
  localState    Json     @map("local_state")
  mrsState      Json?    @map("mrs_state")
  resolution    String?  @map("resolution")
  detectedAt    DateTime @default(now()) @map("detected_at")
  resolvedAt    DateTime? @map("resolved_at")

  @@map("sync_conflicts")
}

model SyncState {
  // ... existing fields ...

  nextSyncAt          DateTime? @map("next_sync_at")
  lastSyncDuration    Int?      @map("last_sync_duration_ms")
  recordsProcessed    Int       @default(0) @map("records_processed")
  consecutiveFailures Int       @default(0) @map("consecutive_failures")
}

model Job {
  // ... existing fields ...

  backoffExponent  Int       @default(0) @map("backoff_exponent")
  nextRetryAt      DateTime? @map("next_retry_at")
}
```

## Risks / Trade-offs

### [Risk] MRS unavailable during booking
**Mitigation:** Graceful degradation—book locally, queue push job, inform patient of pending confirmation. Background job retries with exponential backoff.

### [Risk] Stale local data leads to conflict at booking
**Mitigation:** Real-time MRS verification before booking. If conflict, offer alternatives interactively.

### [Risk] Rate limits block sync
**Mitigation:** Adaptive polling with backoff. Priority queue (availability > patients). Track remaining quota.

### [Risk] OpenMRS demo resets
**Mitigation:** Detect via record count drop (< 50% expected). Trigger full re-sync, alert admin, mark recent bookings for review.

### [Risk] MRS adapter differences cause bugs
**Mitigation:** Comprehensive test suite per adapter. Capability checks before operations. Detailed MRS documentation.

### [Trade-off] MRS-first booking adds latency
**Accepted:** ~500ms-2s extra per booking. Worthwhile for conflict resolution. Mitigated by keeping reads local.

### [Trade-off] Polling vs webhooks
**Accepted:** No MRS supports webhooks reliably. Polling every 5 min is sufficient for appointment booking (not high-frequency trading).

## Open Questions

1. **Conflict Resolution Policy:** When appointment exists locally but not in MRS (sync found deletion), should we auto-cancel and notify patient, or flag for admin review?

2. **Graceful Degradation UX:** What exactly should agent say when MRS is down? Current: "Booked! Note: confirmation pending system sync" — is this too technical?

3. **Rate Limit Discovery:** OpenMRS doesn't document limits. Should we start conservative and increase, or probe to find actual limits?

4. **Multi-MRS Tenant:** Can one tenant have multiple MRS connections (e.g., clinic uses OpenMRS but lab uses separate system)?
