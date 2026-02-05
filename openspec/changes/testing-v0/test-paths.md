# Test Paths

Collected from archived changes - tests that were deferred or need to be implemented as part of the testing infrastructure.

---

## O3 Live Tests (`tests/o3/`)

### From: scheduling-abstraction-redesign

- [ ] Test OpenMRS adapter against O3 demo (connect, health check)
- [ ] Test availability computation with schedule templates
- [ ] Test booking flow against O3 demo (create appointment)
- [ ] Test conflict detection (attempt double-book)
- [ ] Test local fallback when MRS unavailable (disconnect network)
- [ ] Test schedule template sync from Bahmni services

### From: fix-openmrs-bahmni-api

- [ ] Test `getAppointmentTypes()` against O3 demo - verify services returned
- [ ] Test `getAppointments()` against O3 demo - verify appointments returned
- [ ] Test `createAppointment()` against O3 demo - verify appointment created
- [ ] Test Bahmni module detection works correctly (probes `/appointment/all`)
- [ ] Verify sync service runs without errors after adapter update

### From: openmrs-demo-setup

- [ ] Test local docker-compose OpenMRS setup (optional)
- [ ] Verify appointments API works locally

---

## Unit Tests (`src/**/*.test.ts`)

### From: scheduling-abstraction-redesign

- [ ] Unit tests for availability computation (`availability-service.ts`)
  - generateTimeWindows from template
  - computeAvailability with various templates
  - isTimeAvailable with overlapping appointments
  - Edge cases: no templates, partial day, effective date filtering

- [ ] Unit tests for booking service (`booking-service.ts`)
  - bookAppointmentByDatetime success flow
  - Conflict detection and rejection
  - Outside schedule hours rejection
  - MRS unavailable fallback path

---

## Integration Tests (`tests/integration/`)

### From: scheduling-abstraction-redesign

- [ ] Verify no regressions in existing functionality after scheduling redesign
- [ ] Test datetime-based booking without slot references
- [ ] Test schedule template CRUD operations

---

## VAPI E2E Tests (Manual)

### From: existing-appointments-v2

- [ ] Test call: patient with 1 upcoming appointment
  - Should mention the appointment after identification
- [ ] Test call: patient with 3+ upcoming appointments
  - Should only mention 2 initially (highlight limit)
- [ ] Test call: patient with no upcoming appointments
  - Should proceed to "how can I help" without appointment mention
- [ ] Test call: patient with cancelled appointment
  - Should not mention cancelled appointments
- [ ] Test call: failed DOB verification
  - Should NOT leak appointment info before verification

---

## Documentation Tasks (from archived changes)

### From: scheduling-abstraction-redesign

- [ ] Update `docs/TECHNICAL_EXPLORATION.md` with new scheduling architecture
- [ ] Document AvailabilityService usage
- [ ] Document migration path for slot-based to datetime-based appointments
- [ ] Remove or deprecate unused slot-related code
- [ ] Update MRS adapter documentation

---

## Deferred Infrastructure (from openmrs-demo-setup)

These were intentionally deferred because public O3 demo works:

- [ ] Create Railway project for private OpenMRS instance
- [ ] Connect repository to Railway
- [ ] Deploy OpenMRS to Railway with `railway up`

---

## Summary by Test Type

| Category | Count | Priority |
|----------|-------|----------|
| O3 Live Tests | 11 | High (validates MRS integration) |
| Unit Tests | 8+ | High (catches regressions fast) |
| Integration Tests | 3 | Medium |
| VAPI E2E (Manual) | 5 | Medium (validates voice UX) |
| Documentation | 5 | Low |
| Deferred Infrastructure | 3 | Low (only if demo issues) |
