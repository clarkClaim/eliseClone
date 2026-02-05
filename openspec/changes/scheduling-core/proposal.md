## Why

The voice assistant can identify patients but cannot yet schedule appointments. This change adds the core scheduling capability—checking availability, booking appointments, viewing/canceling existing bookings—so patients can complete their scheduling requests end-to-end via voice.

## Discovery: O3 Bahmni Appointments API

The public O3 demo (`o3.openmrs.org`) has a working **Bahmni Appointments API** that differs significantly from the legacy `appointmentscheduling` module:

| Concept | Legacy API | Bahmni API (O3) |
|---------|------------|-----------------|
| Availability | Pre-defined timeslots | Computed from existing appointments |
| Types | `appointmentType` | `appointmentService` |
| Booking | Requires slot UUID | POST with service + datetime directly |
| Slots | `/appointmentscheduling/timeslot` | N/A - no slot concept |

**Key implication:** We can book directly against O3 when available, with no need to pre-sync availability slots. Availability is computed on-demand by checking for conflicts with existing appointments.

**Reference:** `docs/O3_APPOINTMENTS_API_REFERENCE.md`

## What Changes

**Dual-mode scheduling:**
- **MRS-first mode** (when O3 available): Book directly via Bahmni API, compute availability by querying existing appointments
- **Fallback mode** (when O3 unavailable): Book locally to Postgres, queue for push sync

**Data layer:**
- Sync appointment services from O3 (replaces appointment types)
- Store appointments locally (cache for O3 appointments + source of truth for degraded bookings)
- Compute availability dynamically from service hours + existing appointments
- Seed data for development when O3 is unreachable

**Scheduling tools:**
- Add `check_availability` tool - query open slots by date, provider, service
- Add `book_appointment` tool - MRS-first booking with local fallback
- Add `get_patient_appointments` tool - query from MRS when available, local cache otherwise
- Add `cancel_appointment` tool - cancel via MRS or locally with push queue
- Add `add_to_waitlist` tool - local-only for patients wanting earlier openings

**MRS adapter updates:**
- Update `src/mrs/openmrs/adapter.ts` to use Bahmni appointments API endpoints
- Add methods: `createAppointment`, `searchAppointments`, `cancelAppointment`, `getServices`
- Remove dependency on timeslot-based availability sync

**Infrastructure:**
- On call connect: fetch today's appointments from O3 to warm cache
- Graceful degradation: book locally when MRS unavailable, inform patient, queue push job
- Update VAPI assistant configuration with new tool definitions

**Degraded mode behavior:**
When MRS is unavailable:
- Bookings proceed against local Postgres
- Assistant informs patient: "I've scheduled your appointment. Since we're having trouble connecting to our main system, we'll send you a text to confirm once we've verified everything."
- Job queued to push appointment to MRS and send confirmation SMS after sync

## Capabilities

### New Capabilities
- `scheduling-tools`: Core scheduling tools (check_availability, book_appointment, get_patient_appointments, cancel_appointment, add_to_waitlist) with VAPI integration, MRS-first booking via Bahmni API, and graceful degradation to local Postgres

### Modified Capabilities
- `mrs-adapter`: Update OpenMRS adapter to use Bahmni appointments API instead of legacy appointmentscheduling module

## Impact

**Code:**
- `src/mrs/openmrs/adapter.ts` - update to Bahmni appointments API
- `src/booking/mrs-booking.ts` - adjust for Bahmni API (no slot UUIDs, use service + datetime)
- `src/agent/tools/` - new scheduling tool implementations
- `src/server.ts` - new tool handlers and call-start prefetch
- `config/vapi-assistant.json` - add scheduling tool definitions

**Database:**
- Use AppointmentType model for cached services (already exists)
- Appointments table works as-is (mrsId = Bahmni appointment UUID)
- Availability table may be optional now (computed vs pre-synced)
- Add seed data for offline development

**External systems:**
- O3 OpenMRS (o3.openmrs.org) - live appointment booking via Bahmni API
- VAPI - assistant config updates

**Dependencies on prior work:**
- Builds on `agent-patient-id` (patient identification complete)
- Extends existing MRS adapter infrastructure

**Extension points:**
- Service load/availability API for more sophisticated capacity management
- Reschedule endpoint for atomic reschedule operations
