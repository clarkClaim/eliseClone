## 1. MRS Adapter - Bahmni API Support

- [ ] 1.1 Add `getServices()` method to adapter - `GET /appointmentService/all/full`
- [ ] 1.2 Add `searchAppointments(params)` method - `POST /appointment/search`
- [ ] 1.3 Add `createAppointment(data)` method - `POST /appointment` with Bahmni format
- [ ] 1.4 Update `cancelAppointment()` for Bahmni status change
- [ ] 1.5 Add `computeAvailability(date, options)` - compute from service hours minus booked
- [ ] 1.6 Add Bahmni response mappers (epoch timestamps, providers array, service object)
- [ ] 1.7 Default to O3 demo URL (`o3.openmrs.org`) when OPENMRS_URL not set
- [ ] 1.8 Test adapter methods against live O3 demo

## 2. Seed Data (O3-compatible)

- [ ] 2.1 Add providers matching O3 demo (Super User, Jake Doctor UUIDs)
- [ ] 2.2 Add locations matching O3 demo (Outpatient Clinic UUID)
- [ ] 2.3 Add services matching O3 demo (General Medicine, Rehabilitation UUIDs)
- [ ] 2.4 Add sample local appointments for offline testing
- [ ] 2.5 Use upsert logic to make seed script idempotent
- [ ] 2.6 Test seed script with `pnpm exec prisma db seed`

## 3. Date Parsing Utilities

- [ ] 3.1 Extend `src/utils/date.ts` with natural language date parsing
- [ ] 3.2 Support relative dates: "today", "tomorrow", "next week"
- [ ] 3.3 Support day names: "Monday", "next Tuesday", "this Friday"
- [ ] 3.4 Support month-day formats: "January 15th", "Jan 15"
- [ ] 3.5 Default ambiguous dates to nearest future occurrence
- [ ] 3.6 Add time-of-day filtering utility (morning = before noon)

## 4. Check Availability Tool

- [ ] 4.1 Create `src/agent/tools/check-availability.ts`
- [ ] 4.2 Parse date parameter using date utilities
- [ ] 4.3 Check MRS health; route to MRS-first or local-fallback path
- [ ] 4.4 MRS path: Query O3 appointments, compute open slots from service hours
- [ ] 4.5 Local path: Query local appointments, compute from cached service hours
- [ ] 4.6 Filter by provider name if specified (fuzzy match)
- [ ] 4.7 Filter by service name if specified
- [ ] 4.8 Filter by time of day if specified
- [ ] 4.9 Return slots with time, provider_name, service, and source indicator
- [ ] 4.10 Suggest next available date when no slots found
- [ ] 4.11 Register tool in `src/agent/tools/index.ts`

## 5. Book Appointment Tool

- [ ] 5.1 Create `src/agent/tools/book-appointment.ts`
- [ ] 5.2 Retrieve patient ID and mrsId from Conversation record
- [ ] 5.3 Return error if patient not identified
- [ ] 5.4 Check MRS health; route to MRS-first or local-fallback path
- [ ] 5.5 MRS path: POST to O3 `/appointment` with patient UUID, service, datetime
- [ ] 5.6 MRS path: Cache appointment locally after success
- [ ] 5.7 Local path: Create appointment in Postgres with `syncedToMrs: false`
- [ ] 5.8 Local path: Queue push job for MRS sync
- [ ] 5.9 Return confirmation with `syncStatus` ('synced' or 'pending')
- [ ] 5.10 Handle conflict response from O3 with alternatives
- [ ] 5.11 Register tool in `src/agent/tools/index.ts`

## 6. Get Patient Appointments Tool

- [ ] 6.1 Create `src/agent/tools/get-patient-appointments.ts`
- [ ] 6.2 Retrieve patient mrsId from Conversation record
- [ ] 6.3 Check MRS health; route to MRS-first or local-fallback path
- [ ] 6.4 MRS path: POST to O3 `/appointment/search` with patientUuid
- [ ] 6.5 Local path: Query local appointments for patient
- [ ] 6.6 Filter to upcoming only by default (status != Cancelled, startDateTime > now)
- [ ] 6.7 Include past if `include_past: true`
- [ ] 6.8 Format response with date, time, provider, service, status
- [ ] 6.9 Return appropriate message for empty results
- [ ] 6.10 Register tool in `src/agent/tools/index.ts`

## 7. Cancel Appointment Tool

- [ ] 7.1 Create `src/agent/tools/cancel-appointment.ts`
- [ ] 7.2 Retrieve patient mrsId from Conversation record
- [ ] 7.3 Verify appointment belongs to patient (query O3 or local)
- [ ] 7.4 Return "not found" for non-existent or other-patient appointments
- [ ] 7.5 MRS path: Update status to "Cancelled" via O3 API
- [ ] 7.6 MRS path: Update local cache
- [ ] 7.7 Local path: Mark cancelled locally, queue push job
- [ ] 7.8 Handle already-cancelled appointments gracefully
- [ ] 7.9 Return confirmation with `syncStatus`
- [ ] 7.10 Register tool in `src/agent/tools/index.ts`

## 8. Add to Waitlist Tool

- [ ] 8.1 Create `src/agent/tools/add-to-waitlist.ts`
- [ ] 8.2 Retrieve patient ID from Conversation record
- [ ] 8.3 Look up provider ID from name if specified
- [ ] 8.4 Look up service ID from name if specified
- [ ] 8.5 Parse date range parameters
- [ ] 8.6 Check for existing active waitlist entry for patient
- [ ] 8.7 Upsert waitlist entry (update if exists, create if not)
- [ ] 8.8 Return confirmation with entry details
- [ ] 8.9 Register tool in `src/agent/tools/index.ts`

## 9. Background Appointment Prefetch

- [ ] 9.1 Add handler for `call-started` message type in `src/server.ts`
- [ ] 9.2 Trigger O3 appointment fetch for today in background (don't await)
- [ ] 9.3 Cache fetched appointments locally
- [ ] 9.4 Catch and log errors without failing the webhook response
- [ ] 9.5 Return immediate success response to VAPI

## 10. VAPI Assistant Configuration

- [ ] 10.1 Add `check_availability` tool definition to assistant config
- [ ] 10.2 Add `book_appointment` tool definition
- [ ] 10.3 Add `get_patient_appointments` tool definition
- [ ] 10.4 Add `cancel_appointment` tool definition
- [ ] 10.5 Add `add_to_waitlist` tool definition
- [ ] 10.6 Update system prompt with scheduling flow guidance
- [ ] 10.7 Test `pnpm run setup:vapi` updates assistant correctly

## 11. Integration Testing

- [ ] 11.1 Test check_availability against live O3 demo
- [ ] 11.2 Test book_appointment success flow against O3
- [ ] 11.3 Test get_patient_appointments against O3
- [ ] 11.4 Test cancel_appointment against O3
- [ ] 11.5 Test local fallback when O3 unavailable (disconnect network)
- [ ] 11.6 Test add_to_waitlist create and update flows
- [ ] 11.7 Test end-to-end voice call with VAPI (manual)
