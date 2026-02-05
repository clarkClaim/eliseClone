## Context

The voice assistant can identify patients via the `identify_patient` and `save_new_patient` tools implemented in Phase 3 (agent-patient-id). The VAPI webhook infrastructure is operational at `/vapi/tools`, routing tool calls through a registry in `src/agent/tools/index.ts`.

**Discovery:** The O3 OpenMRS demo has a working Bahmni Appointments API that's different from the legacy `appointmentscheduling` module. See `docs/O3_APPOINTMENTS_API_REFERENCE.md`.

**Existing infrastructure:**
- `src/booking/mrs-booking.ts` - MRS-first booking flow with graceful degradation
- `src/mrs/openmrs/adapter.ts` - OpenMRS adapter (needs update for Bahmni API)
- `src/sync/health.ts` - Health check infrastructure
- Database schema with Availability, Appointment, Provider, Location, AppointmentType models

**Current gap:** The MRS adapter uses legacy appointmentscheduling API. Need to update for Bahmni and expose scheduling as VAPI tools.

## Goals / Non-Goals

**Goals:**
- Book appointments directly via O3 Bahmni API when MRS is available
- Fall back to local Postgres booking when MRS is unavailable
- Expose scheduling capabilities as VAPI tools
- Handle both modes transparently to the patient
- Compute availability dynamically (no pre-synced slots)

**Non-Goals:**
- SMS confirmation sending (future work)
- Waitlist outbound calling
- Pre-syncing availability slots (Bahmni doesn't use slots)
- Multi-provider scheduling in single call

## Decisions

### 1. MRS-First Architecture: Book to O3, fallback to local

**Decision:** When MRS is available, book directly to O3 via Bahmni API. When unavailable, book locally and queue for push.

**Rationale:**
- O3 is source of truth for appointments visible in OpenMRS UI
- Local booking provides resilience when O3 is down
- Existing graceful degradation infrastructure handles this pattern

**Flow:**
```
check_availability → MRS available?
  ├─ Yes → Query O3 appointments, compute open slots
  └─ No  → Query local appointments, compute from service hours

book_appointment → MRS available?
  ├─ Yes → POST to O3 Bahmni API, cache locally
  └─ No  → Create local, queue push job, warn patient
```

### 2. Availability: Computed, not pre-synced

**Decision:** Compute availability on-demand by checking existing appointments against service hours.

**Rationale:**
- Bahmni API has no slot concept - you just book a datetime
- Avoids sync complexity of maintaining slot state
- Real-time accuracy when querying MRS
- Service hours define bookable windows

**Algorithm:**
1. Get service hours (e.g., 9am-5pm, 30-min intervals)
2. Query appointments for target date
3. Subtract booked times from available intervals
4. Return open slots

**Alternatives considered:**
- Maintain Availability table as cache → rejected (adds sync complexity, Bahmni doesn't use slots)
- Query O3 for every slot check → accepted (fresh data, fast enough for voice UX)

### 3. MRS Adapter: Update for Bahmni Appointments API

**Decision:** Update `src/mrs/openmrs/adapter.ts` with new methods for Bahmni API.

**New methods:**
- `getServices()` → `GET /appointmentService/all/full`
- `searchAppointments(params)` → `POST /appointment/search`
- `createAppointment(data)` → `POST /appointment`
- `cancelAppointment(uuid, reason)` → Status change via Bahmni API

**Rationale:**
- Bahmni endpoints are different from legacy
- Abstract the API differences in adapter layer
- Tools layer stays clean

### 4. Patient Context: From Conversation + MRS lookup

**Decision:** Local patient has mrsId linking to O3 patient UUID. Use this for O3 API calls.

**Rationale:**
- Patients already synced with mrsId from identify_patient phase
- Bahmni API requires `patientUuid` for booking
- Local patient ID used for cache queries

### 5. Service mapping: Sync services as AppointmentTypes

**Decision:** Sync O3 appointment services to local AppointmentType table.

**Rationale:**
- AppointmentType model already exists with mrsId
- Services are relatively static, sync on startup or periodically
- Provides local cache for degraded mode

### 6. Tool Architecture: Thin wrappers with MRS-awareness

**Decision:** Tool handlers check MRS availability, delegate to appropriate path.

```typescript
async function checkAvailability(params) {
  const mrsHealthy = await quickHealthCheck(adapter);
  if (mrsHealthy) {
    return await checkAvailabilityFromMRS(adapter, params);
  } else {
    return await checkAvailabilityFromLocal(params);
  }
}
```

### 7. Seed Data: For offline development only

**Decision:** Seed services, providers, and sample appointments for development without O3.

**Rationale:**
- Developers may not always have O3 connectivity
- Seed data enables full testing of local path
- Production primarily uses MRS-first path

### 8. Background Prefetch: Warm cache on call connect

**Decision:** On `call-started` webhook, fetch today's appointments from O3 in background.

**Rationale:**
- Warms local cache for faster responses
- Non-blocking, doesn't delay call
- Handles case where first availability check hits warm cache

## Risks / Trade-offs

**Risk: O3 demo resets periodically, test data disappears**
→ Mitigation: Seed script recreates demo data. Document O3 reset behavior.

**Risk: Bahmni API rate limits or slowness**
→ Mitigation: Background prefetch reduces real-time calls. Graceful degradation handles failures.

**Risk: Conflict between local and MRS bookings**
→ Mitigation: MRS is source of truth. Local bookings get pushed. If conflict at push time, alert for manual resolution.

**Risk: Service hours not configured in O3**
→ Mitigation: Define default service hours in config. Fall back to 9am-5pm if not specified.

**Trade-off: No pre-synced availability slots**
→ Accepted: Bahmni doesn't use slots. Computing on-demand is simpler and always fresh.

**Trade-off: Dependency on O3 demo for testing**
→ Accepted: Local fallback path allows full testing. Mock adapter available for unit tests.
