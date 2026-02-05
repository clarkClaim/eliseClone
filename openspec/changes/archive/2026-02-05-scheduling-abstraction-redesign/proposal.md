## Why

The current scheduling model is **slot-centric**: availability is represented as discrete slots that get booked. This creates friction when integrating with MRS systems like Bahmni/O3 that don't use slots—they model availability as service hours and appointments book directly with datetimes.

After discovering that O3 uses the Bahmni Appointments API (no slots), we need to rethink our core abstraction. Rather than forcing slots onto systems that don't have them, we should adopt a **dates-first model** where:

- **Appointments are the source of truth** (what's actually booked)
- **Schedule templates define availability** (when providers work)
- **Available times are computed** (schedule - appointments), not stored

This aligns naturally with Bahmni and treats slot-based MRS systems as a translation concern at the adapter layer.

## What Changes

**Core data model redesign:**
- Remove dependency on `Availability` table for booking flow
- Add `ScheduleTemplate` model for provider/service availability patterns
- Make `Appointment.slotId` optional; add direct `startTime`, `endTime`, `providerId`
- Availability becomes a computed view, not materialized state

**MRS abstraction layer redesign:**
- Define clear separation: abstract `MRSAdapter` vs concrete `OpenMRSAdapter`
- Add `MRSCapabilities.scheduling` to describe MRS scheduling model
- Adapter methods work with datetimes; slot translation is internal to slot-based adapters
- Clean interface for: get schedule config, search appointments, book by datetime, cancel

**Booking flow redesign:**
- Core booking service works with datetimes, not slot IDs
- Conflict detection via appointment query, not slot lookup
- Adapter translates datetime booking to MRS-native format (slot ID or datetime POST)

## Capabilities

### New Capabilities
- `scheduling-model`: Core scheduling data model with ScheduleTemplate, dates-first Appointment, and computed availability
- `mrs-scheduling-interface`: Abstract MRS adapter interface for scheduling operations with capability-aware routing

### Modified Capabilities
- `mrs-adapter`: Update abstract interface to use datetime-based operations; move slot concepts to concrete implementations
- `database-schema`: Schema changes for ScheduleTemplate, optional slotId, direct time fields on Appointment

## Impact

**Schema changes:**
- New `ScheduleTemplate` model
- `Appointment`: make `slotId` optional, add `startTime`/`endTime`/`providerId`/`serviceId`
- `Availability` table: may become optional/deprecated for Bahmni flow

**Code changes:**
- `src/mrs/adapter.ts` - Redesign abstract interface
- `src/mrs/types.ts` - New types for datetime-based operations
- `src/mrs/adapters/openmrs/` - Implement Bahmni-native booking
- `src/booking/` - Refactor to dates-first model
- `src/sync/entities/availability.ts` - May become optional

**Relationship to scheduling-core:**
This change is a **prerequisite** for scheduling-core. The VAPI tools will be built on top of this cleaner abstraction.

**Migration:**
- Existing Availability data can remain for reference
- New bookings use dates-first flow
- Slot-based MRS support preserved via adapter translation
