# Scheduling Abstraction Redesign - Testing Guide

Quick testing checklist for the datetime-based scheduling changes.

## Prerequisites

```bash
# Ensure database is running
docker compose up -d

# Run migrations (already done)
pnpm exec prisma migrate dev

# Seed test data (already done)
pnpm exec prisma db seed

# Build
pnpm run build
```

## 1. Verify Seed Data

```bash
pnpm exec prisma studio
```

Check these tables have data:
- `providers` - Dr. Smith, Dr. Jones
- `appointment_types` - 3 services
- `schedule_templates` - 5 records (M/W/F for Smith, T/Th for Jones)
- `patients` - 8 test patients

## 2. Test AvailabilityService

Create a quick test script or use Node REPL:

```typescript
// Test availability computation
import { computeAvailability } from './src/scheduling/index.js';

// Get a Monday (Dr. Smith works M/W/F)
const monday = new Date('2024-03-04'); // A Monday
const availability = await computeAvailability(monday);
console.log('Available slots:', availability.length);
// Should show 30-min slots from 9am-5pm = 16 slots per provider
```

## 3. Test Booking Flow (Local Only)

```typescript
import { bookAppointmentByDatetime } from './src/scheduling/index.js';

// Book without MRS adapter (local-only mode)
const result = await bookAppointmentByDatetime(null, {
  patientId: '<patient-id-from-db>',
  providerId: '<dr-smith-id>',
  serviceId: '<service-id>',
  startTime: new Date('2024-03-04T09:00:00'),
  endTime: new Date('2024-03-04T09:30:00'),
});
console.log(result);
// Should succeed with syncStatus: 'pending'
```

## 4. Test Against O3 Demo (if MRS available)

```bash
# Set environment variables
export OPENMRS_URL=https://o3.openmrs.org/openmrs
export OPENMRS_USER=admin
export OPENMRS_PASSWORD=Admin123

# Start server
pnpm run dev
```

Then test:
- `checkConflicts()` - search for conflicts at a time
- `getScheduleConfig()` - fetch Bahmni service configurations
- `createAppointment()` - book with datetime (needs real patient/service UUIDs)

## 5. Verify No Regressions

```bash
# Build should pass
pnpm run build

# Existing booking flow still works (slot-based)
# Check src/booking/mrs-booking.ts still compiles and runs
```

## Key Things to Verify

| Feature | How to Test |
|---------|-------------|
| Schedule templates created | Check `schedule_templates` table in Prisma Studio |
| Availability computed | Call `computeAvailability()` for a weekday |
| Conflict detection | Book same slot twice, second should fail |
| Local fallback | Book with `adapter=null`, should queue for sync |
| MRS conflict check | Call adapter's `checkConflicts()` method |

## Quick Smoke Test

```bash
# 1. Start server
pnpm run dev

# 2. In another terminal, check health
curl http://localhost:3000/health

# 3. Check Prisma Studio for data
pnpm exec prisma studio
```

## Files Changed

Key files to review:
- `prisma/schema.prisma` - New ScheduleTemplate model, Appointment changes
- `src/scheduling/availability-service.ts` - Computed availability
- `src/scheduling/booking-service.ts` - Datetime-based booking
- `src/mrs/adapter.ts` - New interface methods
- `src/mrs/adapters/openmrs/adapter.ts` - Bahmni implementation
- `src/sync/entities/schedule-templates.ts` - Template sync
