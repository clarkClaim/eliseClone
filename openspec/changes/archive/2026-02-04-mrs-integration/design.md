## Context

Phase 1 established the database schema with tables for patients, providers, appointments, availability, waitlist, and jobs. The system can store scheduling data but has no connection to OpenMRS. Currently, there is no patient/provider data and no mechanism to sync appointments bidirectionally.

The OpenMRS 3 demo instance (o3.openmrs.org) provides REST and FHIR APIs for patient, provider, and appointment data. The demo resets periodically, which is acceptable for this implementation.

Key constraints:
- MRS is the source of truth for patient demographics
- Local Context Store must support real-time scheduling queries
- Bookings happen locally first, then sync to MRS (eventual consistency)
- Sync conflicts must be logged for healthcare compliance

## Goals / Non-Goals

**Goals:**
- Define abstract MRS adapter interface for future multi-MRS support
- Implement OpenMRS adapter with authentication and data transformation
- Build sync service that runs on configurable interval (default 5 minutes)
- Handle sync conflicts with configurable resolution rules
- Track sync state for incremental updates
- Support retry logic for failed MRS pushes

**Non-Goals:**
- Real-time webhooks from OpenMRS (polling only for simplicity)
- Multi-tenant support (single-tenant for now)
- Admin UI for conflict resolution (conflicts logged, resolved programmatically)
- Sync of historical data beyond reasonable lookback window

## Decisions

### Decision 1: Abstract adapter interface with concrete OpenMRS implementation

**Choice:** Define `MRSAdapter` interface in `src/mrs/adapter.ts`, implement OpenMRS-specific adapter in `src/mrs/openmrs/`.

**Rationale:** The README architecture already defines this pattern. An abstract interface enables future MRS integrations without changing scheduling logic. OpenMRS is the first implementation.

**Alternatives considered:**
- Direct OpenMRS calls throughout codebase → Would couple scheduling to specific MRS
- Generic HTTP adapter with config → Too flexible, loses type safety

### Decision 2: Polling-based sync on configurable interval

**Choice:** Sync Service polls MRS every N minutes (configurable via `SYNC_INTERVAL_MS`, default 5 minutes). Uses `sync_state` table to track last sync timestamp per entity type.

**Rationale:** Simpler than event-driven. OpenMRS demo doesn't support webhooks reliably. 5-minute lag is acceptable for scheduling use case.

**Alternatives considered:**
- WebSocket/webhook subscription → OpenMRS demo doesn't support well
- Aggressive polling (every 30s) → Unnecessary load on demo instance

### Decision 3: Conflict resolution with MRS-wins for source data

**Choice:**
- Patient demographics: MRS wins (source of truth)
- Provider data: MRS wins
- Appointments created locally but missing in MRS: Flag for review in `SyncConflict` table
- Slots deleted in MRS: Mark `mrsExists=false`, prevent new bookings

**Rationale:** MRS is the medical record system of truth. Local-only appointments could indicate sync failure or external deletion—flagging for review is safer than auto-delete.

**Alternatives considered:**
- Local-wins for appointments → Could overwrite legitimate external changes
- Auto-delete orphaned appointments → Too aggressive for healthcare context

### Decision 4: Bidirectional sync with push-to-MRS tracking

**Choice:** Add `syncedToMrs`, `syncedToMrsAt`, `lastSyncError`, `syncAttempts` columns to track push status. Failed pushes create retry jobs with exponential backoff.

**Rationale:** Bookings must eventually reach MRS. Tracking push state enables monitoring and retry. Following considerations from `PHASE2_SYNC_CONSIDERATIONS.md`.

**Alternatives considered:**
- Fire-and-forget MRS push → No visibility into failures
- Synchronous MRS write on booking → Would slow booking flow, single point of failure

### Decision 5: HTTP client with retry and timeout configuration

**Choice:** Use `fetch` (native in Node 20) with configurable timeout (default 10s) and retry logic (3 attempts with exponential backoff).

**Rationale:** Native fetch is sufficient. No need for axios or other libraries. Retry logic handles transient failures.

**Alternatives considered:**
- axios → Extra dependency not needed
- No retry → Transient failures would require manual intervention

## Risks / Trade-offs

**[Risk] OpenMRS demo resets periodically** → Sync state may become invalid. Mitigation: Handle gracefully—if last sync timestamp is missing from MRS, perform full sync.

**[Risk] Race condition between booking and sync** → Both may update availability. Mitigation: Use version field for optimistic locking (already in schema).

**[Risk] MRS push failures could accumulate** → Appointments stuck in local-only state. Mitigation: Monitor `syncedToMrs=false` count, alert if threshold exceeded.

**[Risk] Sync interval creates data staleness** → Up to 5 minutes of lag. Mitigation: For critical booking flows, verify slot with MRS before confirming.

**[Trade-off] Polling vs webhooks** → Simpler implementation but higher latency. Acceptable for demo scope.

**[Trade-off] Single SyncConflict table for all entity types** → Simpler schema but less granular. EntityType column enables filtering.
