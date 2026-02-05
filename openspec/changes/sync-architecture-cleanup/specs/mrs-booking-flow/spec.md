## ADDED Requirements

### Requirement: Availability Cache Invalidation After Booking

The system SHALL invalidate availability cache immediately after a local booking to prevent showing stale slots.

#### Scenario: Mark time as unavailable after booking
- **WHEN** a booking succeeds (locally or to MRS)
- **THEN** the system SHALL immediately mark that time slot as unavailable in local cache
- **AND** subsequent availability queries SHALL NOT return that time

#### Scenario: Refresh suggested availability after booking
- **WHEN** `getSuggestedAvailability()` is called after a recent booking
- **THEN** the recently booked time SHALL NOT appear in suggestions
- **AND** the next available time SHALL be suggested instead

#### Scenario: Refresh suggested availability after cancellation
- **WHEN** an appointment is cancelled
- **THEN** that time slot SHALL become available in local cache immediately
- **AND** subsequent availability queries SHALL include that time

## MODIFIED Requirements

### Requirement: MRS-First Booking During Live Calls

During live voice/chat calls, the system SHALL validate and create appointments in MRS first, then record locally, to enable interactive conflict resolution.

#### Scenario: Successful MRS-first booking
- **WHEN** patient confirms they want a specific time
- **THEN** system SHALL:
  1. Call `adapter.checkConflicts(startTime, endTime, providerId)` to verify no conflicts
  2. Call `adapter.createAppointment(request)` to book in MRS
  3. Create local appointment record with returned `mrs_id`
  4. Invalidate availability cache for that time
  5. Set `syncedToMrs = true` and `syncedToMrsAt = now()`
- **AND** respond to patient with confirmation

#### Scenario: Conflict check fails
- **WHEN** `checkConflicts()` returns conflicts
- **THEN** system SHALL NOT attempt to book
- **AND** SHALL query for alternative times
- **AND** respond: "I'm sorry, that time was just taken. I have [alternatives] available. Which would you prefer?"

#### Scenario: MRS booking fails with conflict
- **WHEN** `createAppointment` throws `SlotConflictError`
- **THEN** system SHALL NOT create local record
- **AND** SHALL query for alternative times with cache refresh
- **AND** respond with alternatives for patient to choose

---

### Requirement: Graceful Degradation When MRS Unavailable

When MRS is unavailable during booking, the system SHALL fall back to local-first booking with queued push.

#### Scenario: MRS timeout on conflict check
- **WHEN** `checkConflicts()` times out (> 5 seconds)
- **THEN** system SHALL proceed with local booking
- **AND** check local database for conflicts first
- **AND** queue a push job to create in MRS
- **AND** set `syncedToMrs = false`

#### Scenario: MRS unavailable on create
- **WHEN** `createAppointment` fails due to network/timeout (not conflict)
- **THEN** system SHALL create local appointment
- **AND** invalidate availability cache for that time
- **AND** queue a push job with high priority
- **AND** set `syncedToMrs = false`
- **AND** respond: "You're booked for [time]. You'll receive a confirmation once our system syncs."

#### Scenario: Detect MRS unavailable early
- **WHEN** recent health check shows MRS unhealthy
- **THEN** system SHALL skip MRS conflict check
- **AND** use local database for conflict detection
- **AND** proceed to local booking with queued push
- **AND** log degraded mode activation

## REMOVED Requirements

### Requirement: Slot-Based Booking Verification

**Reason**: Slot-based booking is deprecated. The system now uses datetime-based conflict checking exclusively.

**Migration**: All booking flows now use `checkConflicts(startTime, endTime, providerId)` instead of `verifySlotAvailable(slotId)`. The `slotId` field remains in the database for historical data but is not used for new bookings.
