## Context

The Elise OpenMRS adapter was built against the legacy `appointmentscheduling` module API. This module is not installed on OpenMRS 3 (O3) deployments. Instead, O3 uses the Bahmni Appointments Module which has a completely different API structure.

**Current state:**
- Adapter probes for `/appointmentscheduling/appointmenttype` → fails on O3
- Falls back to "no appointment support" mode
- All appointment sync/creation fails

**Target state:**
- Adapter uses Bahmni API endpoints
- Works with O3 demo (`o3.openmrs.org`) and any O3 deployment
- Full appointment sync and creation capability

**Reference:** `docs/O3_APPOINTMENTS_API_REFERENCE.md`

## Goals / Non-Goals

**Goals:**
- All appointment operations work against O3 / Bahmni API
- Maintain same MRSAdapter interface (no breaking changes to consumers)
- Support both appointment listing and creation
- Support appointment status updates (cancel, complete, etc.)

**Non-Goals:**
- Supporting legacy `appointmentscheduling` module (deprecated)
- Supporting both APIs simultaneously (O3 only)
- Implementing recurring appointments
- Implementing teleconsultation features

## Decisions

### 1. API Endpoint Mapping

| Operation | Legacy Endpoint | Bahmni Endpoint |
|-----------|-----------------|-----------------|
| List appointment types | `/appointmentscheduling/appointmenttype` | `/appointmentService/all/full` |
| Get appointments | `/appointmentscheduling/appointment?params` | `POST /appointment/search` |
| Get single appointment | `/appointmentscheduling/appointment/{id}` | `GET /appointment?uuid={id}` |
| Create appointment | `POST /appointmentscheduling/appointment` | `POST /appointment` |
| Cancel appointment | `POST /appointmentscheduling/appointment/{id}` with status | Update appointment status to "Cancelled" |
| Get availability | `/appointmentscheduling/timeslot` | Service `weeklyAvailability` + `/appointmentService/load` |

**Rationale:** Direct mapping to equivalent Bahmni endpoints. The only significant change is availability (see below).

### 2. Availability Model Change

**Legacy model (timeslot-based):**
```
Provider → AppointmentBlock → TimeSlots
Each slot is a bookable unit with specific start/end time
```

**Bahmni model (service-based):**
```
AppointmentService → weeklyAvailability → Direct time booking
Services define available hours; appointments specify their own times
```

**Decision:** Map `MRSSlot` concept to service availability windows.
- `getAvailability()` returns service availability periods, not discrete slots
- `createAppointment()` takes start/end time directly, not a slot ID
- Remove `slotMrsId` from `NewAppointment` type, add `startDateTime`/`endDateTime`

**Rationale:** Bahmni doesn't have discrete slots. Trying to synthesize them would add complexity and diverge from how O3 actually works.

### 3. Appointment Type vs Service

**Decision:** Map `MRSAppointmentType` to `AppointmentService`.
- Services have `serviceTypes` for sub-categorization (e.g., "Short follow-up")
- Use service UUID as the appointment type identifier

**Type mapping:**
```typescript
interface MRSAppointmentType {
  mrsId: string;        // service UUID
  name: string;         // service name
  duration?: number;    // from serviceType or service durationMins
  description?: string;
}
```

### 4. Module Detection

**Decision:** Probe for Bahmni endpoint instead of legacy.

```typescript
// Old: /appointmentscheduling/appointmenttype?limit=1
// New: /appointment/all?forDate=<today>
```

**Rationale:** If this returns 200, Bahmni module is available.

### 5. Appointment Creation Payload

**Legacy:**
```json
{
  "patient": "uuid",
  "timeSlot": "slot-uuid",
  "appointmentType": "type-uuid",
  "status": "SCHEDULED"
}
```

**Bahmni:**
```json
{
  "patientUuid": "uuid",
  "serviceUuid": "service-uuid",
  "startDateTime": "2025-02-10T09:00:00.000Z",
  "endDateTime": "2025-02-10T09:30:00.000Z",
  "appointmentKind": "Scheduled",
  "locationUuid": "location-uuid",
  "providers": [{"uuid": "provider-uuid"}]
}
```

**Decision:** Update `NewAppointment` interface and `createAppointment()` to use Bahmni format.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking change to availability model | Document clearly; sync service already handles empty availability gracefully |
| Different appointment status values | Create status mapping table |
| Service vs Type semantic difference | Map transparently; consumers don't need to know |
| No slot verification (slots don't exist) | Check for conflicting appointments at same time instead |

## Migration Plan

1. Update mappers first (low risk, internal only)
2. Update client methods for new endpoints
3. Update adapter methods one at a time
4. Update module detection probe
5. Test against O3 demo
6. Remove legacy endpoint references

**Rollback:** Git revert if needed. No database migrations.

## Open Questions

- [ ] Should we support appointment rescheduling (`POST /appointment/{uuid}/reschedule`)?
- [ ] How to handle provider assignment (Bahmni uses provider response workflow)?
- [ ] Need to update `NewAppointment` type - is this a breaking change for consumers?
