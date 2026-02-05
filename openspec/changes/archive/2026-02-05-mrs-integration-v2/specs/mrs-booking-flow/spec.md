## ADDED Requirements

### Requirement: Local-First Availability Queries
During live calls, availability queries SHALL use local cached data for fast response, with freshness metadata to inform the agent.

#### Scenario: Query available slots
- **WHEN** agent calls `check_availability` tool
- **THEN** system SHALL query local database (not MRS)
- **AND** response SHALL include `lastSyncedAt` timestamp
- **AND** response SHALL include `isStale` flag if data older than threshold (default: 10 min)

#### Scenario: Stale data handling
- **WHEN** availability data is stale (isStale = true)
- **THEN** agent MAY inform patient: "Let me verify these times are still available"
- **AND** system SHALL trigger priority sync for availability if significantly stale (> 15 min)

---

### Requirement: MRS-First Booking During Live Calls
During live voice/chat calls, the system SHALL validate and create appointments in MRS first, then record locally, to enable interactive conflict resolution.

#### Scenario: Successful MRS-first booking
- **WHEN** patient confirms they want a specific slot
- **THEN** system SHALL:
  1. Call `adapter.verifySlotAvailable(slotId)` to confirm slot is open
  2. Call `adapter.createAppointment(request)` to book in MRS
  3. Create local appointment record with returned `mrs_id`
  4. Mark local availability as booked
  5. Set `syncedToMrs = true` and `syncedToMrsAt = now()`
- **AND** respond to patient with confirmation

#### Scenario: Slot verification fails
- **WHEN** `verifySlotAvailable` returns `available: false`
- **THEN** system SHALL NOT attempt to book
- **AND** SHALL query for alternative slots
- **AND** respond: "I'm sorry, that time was just taken. I have [alternatives] available. Which would you prefer?"

#### Scenario: MRS booking fails with conflict
- **WHEN** `createAppointment` throws `SlotConflictError`
- **THEN** system SHALL NOT create local record
- **AND** SHALL query for alternative slots
- **AND** respond with alternatives for patient to choose

---

### Requirement: Graceful Degradation When MRS Unavailable
When MRS is unavailable during booking, the system SHALL fall back to local-first booking with queued push.

#### Scenario: MRS timeout on verify
- **WHEN** `verifySlotAvailable` times out (> 5 seconds)
- **THEN** system SHALL proceed with local booking
- **AND** queue a push job to create in MRS
- **AND** set `syncedToMrs = false`

#### Scenario: MRS unavailable on create
- **WHEN** `createAppointment` fails due to network/timeout (not conflict)
- **THEN** system SHALL create local appointment
- **AND** queue a push job with high priority
- **AND** set `syncedToMrs = false`
- **AND** respond: "You're booked for [time]. You'll receive a confirmation once our system syncs."

#### Scenario: Detect MRS unavailable early
- **WHEN** recent health check shows MRS unhealthy
- **THEN** system SHALL skip MRS verification
- **AND** proceed directly to local booking with queued push
- **AND** log degraded mode activation

---

### Requirement: Push Appointment to MRS (Async)
When appointments are created locally without MRS confirmation, they SHALL be pushed asynchronously.

#### Scenario: Queue push job
- **WHEN** appointment created with `syncedToMrs = false`
- **THEN** a job SHALL be created with:
  - `type` = 'push_appointment_to_mrs'
  - `payload` = { appointmentId }
  - `priority` = high
  - `maxAttempts` = 5

#### Scenario: Successful push
- **WHEN** push job executes and MRS accepts the appointment
- **THEN** appointment SHALL be updated with:
  - `mrsId` = returned UUID
  - `syncedToMrs = true`
  - `syncedToMrsAt = now()`
  - `lastSyncError = null`

#### Scenario: Push fails with conflict
- **WHEN** push job executes but MRS says slot is taken
- **THEN** a SyncConflict record SHALL be created
- **AND** admin SHALL be alerted
- **AND** appointment status MAY need manual resolution

#### Scenario: Push fails repeatedly
- **WHEN** push job fails and attempts >= maxAttempts
- **THEN** job SHALL be marked failed
- **AND** `lastSyncError` SHALL record the error
- **AND** alert SHALL be generated for admin review

---

### Requirement: Cancellation Flow
Cancellations SHALL be pushed to MRS immediately during live calls, with graceful degradation.

#### Scenario: MRS-first cancellation
- **WHEN** patient confirms cancellation during live call
- **AND** appointment has `mrsId`
- **THEN** system SHALL call `adapter.cancelAppointment(mrsId, reason)`
- **AND** update local appointment status to 'cancelled'
- **AND** mark availability as available again

#### Scenario: Cancel locally-only appointment
- **WHEN** patient cancels appointment with `syncedToMrs = false`
- **THEN** system SHALL cancel locally only
- **AND** remove any pending push job for that appointment

#### Scenario: MRS unavailable on cancel
- **WHEN** cancellation fails due to MRS unavailable
- **THEN** system SHALL cancel locally
- **AND** queue job to push cancellation when MRS recovers

---

### Requirement: Booking Tool Response Format
The booking tools SHALL return structured responses that enable the agent to handle all outcomes.

#### Scenario: Successful booking response
- **WHEN** booking succeeds
- **THEN** response SHALL include:
  - `success: true`
  - `appointmentId`
  - `confirmation: { date, time, provider, location }`
  - `syncStatus: 'synced' | 'pending'`
  - `message` for agent to speak

#### Scenario: Conflict response with alternatives
- **WHEN** booking fails due to conflict
- **THEN** response SHALL include:
  - `success: false`
  - `error: 'slot_conflict'`
  - `alternatives: SlotWithFreshness[]` (nearby available slots)
  - `message` suggesting alternatives

#### Scenario: Degraded booking response
- **WHEN** booking succeeds locally but MRS push pending
- **THEN** response SHALL include:
  - `success: true`
  - `appointmentId`
  - `syncStatus: 'pending'`
  - `message` noting confirmation pending

---

### Requirement: Real-Time Availability Refresh
The system SHALL support on-demand availability refresh when agent suspects stale data.

#### Scenario: Agent requests refresh
- **WHEN** agent calls `refresh_availability` tool
- **THEN** system SHALL immediately fetch availability from MRS for specified date range
- **AND** update local cache
- **AND** return fresh slot data

#### Scenario: Refresh during booking retry
- **WHEN** booking fails and agent needs alternatives
- **THEN** `check_availability` with `forceRefresh: true` SHALL fetch live from MRS
- **AND** cache the results locally

---

### Requirement: Booking Audit Trail
All booking operations SHALL be logged for compliance and debugging.

#### Scenario: Log booking attempt
- **WHEN** booking is attempted
- **THEN** system SHALL log:
  - Patient ID, slot ID, timestamp
  - MRS verification result
  - MRS booking result or error
  - Final outcome (success/failure/degraded)

#### Scenario: Log cancellation
- **WHEN** cancellation is attempted
- **THEN** system SHALL log:
  - Appointment ID, reason
  - MRS cancellation result
  - Final outcome
