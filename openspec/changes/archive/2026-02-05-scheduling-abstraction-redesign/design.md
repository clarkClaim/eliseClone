## Context

The current MRS adapter interface (`src/mrs/adapter.ts`) is **slot-centric**:
- `getAvailability()` returns `MRSSlot[]`
- `verifySlotAvailable(slotId)` checks a specific slot
- `Appointment.slotId` is required

But the OpenMRS/Bahmni adapter already works around this:
- `getAvailability()` returns `[]` (Bahmni has no slots)
- `verifySlotAvailable()` returns `{ available: true }` (always)
- `createAppointment()` uses `startDateTime`/`endDateTime` instead of `slotMrsId`

This indicates the abstraction is wrong. The interface assumes all MRS systems work like slot-based systems, but Bahmni (and likely other modern systems) are appointment-centric.

## Goals / Non-Goals

**Goals:**
- Redesign the abstract MRS interface to be dates-first
- Make slot-based MRS a specialization, not the default assumption
- Clean separation between abstract interface and concrete implementations
- Support both Bahmni (appointment-based) and legacy OpenMRS (slot-based)
- Enable Core booking logic to work with datetimes, not slot IDs

**Non-Goals:**
- Full implementation of slot-based MRS adapter (defer until we have one)
- Migration of existing data (can remain as-is)
- Changes to patient/provider/location operations (already clean)

## Decisions

### 1. Core Model: Appointments + Schedule Templates (no stored slots)

**Decision:** Remove slots as a core concept. The source of truth is:
- **ScheduleTemplate**: When providers/services are available (day-of-week patterns)
- **Appointment**: What's actually booked (with start/end times)
- **Availability**: Computed as `ScheduleTemplate - Appointments`

```
┌─────────────────────────────────────────────────────────────┐
│                     CORE DATA MODEL                          │
│                                                              │
│  ScheduleTemplate                    Appointment             │
│  ┌──────────────────────┐           ┌──────────────────────┐│
│  │ providerId           │           │ patientId            ││
│  │ serviceId            │           │ providerId           ││
│  │ dayOfWeek (0-6)      │           │ serviceId            ││
│  │ startTime ("09:00")  │           │ startTime (DateTime) ││
│  │ endTime ("17:00")    │           │ endTime (DateTime)   ││
│  │ slotDuration (30min) │           │ status               ││
│  │ mrsServiceId?        │           │ mrsId?               ││
│  └──────────────────────┘           └──────────────────────┘│
│            │                                  │              │
│            └────────────┬─────────────────────┘              │
│                         ▼                                    │
│              ┌──────────────────────┐                       │
│              │ Computed Availability │                       │
│              │ (not stored)          │                       │
│              └──────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

**Rationale:**
- Appointments are what actually exist in any MRS
- Schedule templates are stable configuration, rarely change
- Availability is always derivable, no sync needed
- Matches Bahmni's mental model exactly

### 2. Abstract MRS Interface: Capability-Aware, Dates-First

**Decision:** Redesign `MRSAdapter` to expose what ALL MRS systems have:
- Appointments (CRUD)
- Schedule configuration (optional)
- Conflict detection (method varies by MRS)

Remove slot-specific methods from the abstract interface.

```typescript
// NEW: Clean abstract interface
interface MRSAdapter {
  // ... existing: connect, disconnect, healthCheck
  // ... existing: patient, provider, location operations

  // Scheduling operations (dates-first)
  getScheduleConfig?(): Promise<MRSScheduleConfig[]>;

  getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]>;

  createAppointment(request: CreateAppointmentRequest): Promise<MRSAppointment>;

  cancelAppointment(mrsId: string, reason?: string): Promise<void>;

  checkConflicts(request: ConflictCheckRequest): Promise<ConflictCheckResult>;

  // REMOVED: getAvailability(), verifySlotAvailable()
  // These are slot-specific and belong in slot-based adapters only
}
```

**Rationale:**
- Abstract interface should only have methods ALL adapters can implement
- Slot methods don't make sense for Bahmni
- `checkConflicts()` is the generalized version of `verifySlotAvailable()`

### 3. Scheduling Capability Declaration

**Decision:** Add `scheduling` to `MRSCapabilities` to describe MRS scheduling model:

```typescript
interface MRSCapabilities {
  // ... existing capabilities ...

  scheduling: {
    model: 'appointment_based' | 'slot_based';
    supportsScheduleConfig: boolean;  // Can we fetch service hours?
    defaultSlotDuration: number;      // Minutes (for computing slots)
    requiresServiceId: boolean;       // Bahmni needs serviceUuid
  };
}
```

**Rationale:**
- Core booking logic can adapt based on MRS capabilities
- No hardcoded assumptions about how MRS works

### 4. Slot-Based MRS: Specialized Interface

**Decision:** Create extended interface for slot-based MRS systems:

```typescript
interface SlotBasedMRSAdapter extends MRSAdapter {
  getSlots(range: DateRange): Promise<MRSSlot[]>;
  getSlotById(slotId: string): Promise<MRSSlot | null>;
  bookSlot(slotId: string, patientMrsId: string): Promise<MRSAppointment>;
}

function isSlotBasedAdapter(adapter: MRSAdapter): adapter is SlotBasedMRSAdapter {
  return adapter.capabilities.scheduling.model === 'slot_based';
}
```

**Rationale:**
- Slot operations are opt-in, not forced on all adapters
- Type guard ensures safe access to slot methods
- Future slot-based MRS adapters can implement this

### 5. CreateAppointmentRequest: Datetime-Based

**Decision:** `CreateAppointmentRequest` uses datetimes, not slot IDs:

```typescript
interface CreateAppointmentRequest {
  patientMrsId: string;
  startDateTime: Date;
  endDateTime: Date;
  serviceId?: string;       // Required for Bahmni
  providerId?: string;
  locationId?: string;
  reason?: string;
}
```

**Rationale:**
- Universal: works for any MRS
- Slot-based adapters can find matching slot internally
- Bahmni adapters use directly

### 6. Conflict Detection: Generalized

**Decision:** Replace `verifySlotAvailable()` with `checkConflicts()`:

```typescript
interface ConflictCheckRequest {
  startDateTime: Date;
  endDateTime: Date;
  providerId?: string;
  serviceId?: string;
  excludeAppointmentId?: string;  // For reschedule
}

interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingAppointments?: MRSAppointment[];
  reason?: string;
}
```

**Rationale:**
- Works for any MRS (query appointments in time range)
- Slot-based MRS can also implement via slot lookup
- Returns details for better error messages

### 7. Local Availability Computation

**Decision:** Core computes availability locally:

```typescript
interface AvailabilityService {
  // Compute available time windows for a date
  getAvailability(
    date: Date,
    options?: {
      providerId?: string;
      serviceId?: string;
      slotDuration?: number;
    }
  ): Promise<TimeWindow[]>;

  // Check if a specific time is available
  isTimeAvailable(
    startTime: Date,
    endTime: Date,
    providerId?: string
  ): Promise<boolean>;
}

interface TimeWindow {
  startTime: Date;
  endTime: Date;
  providerId?: string;
  serviceId?: string;
}
```

**Algorithm:**
```
1. Get schedule template for date's day-of-week
2. Generate time windows based on template (e.g., every 30 min from 9am-5pm)
3. Query appointments for that date
4. Remove windows that overlap with appointments
5. Return remaining windows
```

**Rationale:**
- No MRS call needed for availability (except appointments)
- Works even when MRS is offline (if we have cached appointments)
- Consistent logic regardless of MRS type

### 8. Booking Flow: Unified

**Decision:** Single booking flow that works for any MRS:

```typescript
async function bookAppointment(
  adapter: MRSAdapter,
  request: BookingRequest
): Promise<BookingResult> {
  // 1. Check for conflicts
  const conflicts = await adapter.checkConflicts({
    startDateTime: request.startTime,
    endDateTime: request.endTime,
    providerId: request.providerId,
  });

  if (conflicts.hasConflict) {
    return { success: false, error: 'conflict', conflicts };
  }

  // 2. Create appointment in MRS
  const mrsAppointment = await adapter.createAppointment({
    patientMrsId: request.patientMrsId,
    startDateTime: request.startTime,
    endDateTime: request.endTime,
    serviceId: request.serviceId,
    providerId: request.providerId,
    reason: request.reason,
  });

  // 3. Store locally
  const appointment = await prisma.appointment.create({
    data: {
      mrsId: mrsAppointment.mrsId,
      patientId: request.patientId,
      providerId: request.providerId,
      serviceId: request.serviceId,
      startTime: request.startTime,
      endTime: request.endTime,
      status: 'scheduled',
      syncedToMrs: true,
    }
  });

  return { success: true, appointment };
}
```

**Rationale:**
- Same flow for all MRS types
- Adapter handles MRS-specific translation internally
- No slot IDs in Core booking logic

## Risks / Trade-offs

**Risk: Slot-based MRS may have race conditions**
→ Mitigation: Slot-based adapter implements `checkConflicts()` by verifying slot, then booking atomically if possible.

**Risk: Schedule templates may not match MRS exactly**
→ Mitigation: Sync templates from MRS when available; use sensible defaults otherwise.

**Trade-off: Availability table becomes less useful**
→ Accepted: Can deprecate or repurpose for caching. Computed availability is simpler.

**Trade-off: More computation for availability checks**
→ Accepted: Query is simple (appointments for date). Caching can help if needed.

## Migration Path

1. **Phase 1: Add new models and interfaces** (non-breaking)
   - Add `ScheduleTemplate` model
   - Add new MRS interface methods
   - Update `MRSCapabilities`

2. **Phase 2: Update OpenMRS adapter** (non-breaking)
   - Implement new methods
   - Mark old slot methods as deprecated

3. **Phase 3: Create AvailabilityService** (non-breaking)
   - Computed availability logic
   - Used by booking flow

4. **Phase 4: Update booking flow** (breaking for internal callers)
   - Switch to datetime-based booking
   - Update `mrs-booking.ts`

5. **Phase 5: Cleanup** (breaking)
   - Remove deprecated slot methods
   - Optional: migrate or deprecate Availability table
