## Why

Currently, after identifying a patient, the assistant immediately asks "how can I help with scheduling?" This ignores any existing appointments the patient may have. Patients often call to confirm, modify, or cancel existing appointments rather than book new ones. Without awareness of upcoming appointments, the assistant provides a poor experience:

- Patient: "Hi, I need to reschedule"
- Assistant: "What day works for you?" (doesn't know what they're rescheduling)

## What Changes

- Add `upcomingAppointments` array to `identify_patient` response when patient is successfully identified
- Query appointments only after DOB verification succeeds (privacy)
- Update centralized assistant prompt (`_base_assistant.json`) to check for and mention existing appointments before offering to schedule new ones
- Return up to 5 appointments, with first 2 marked as `highlight: true` for the greeting

## Capabilities

### New Capabilities

- `existing-appointments-retrieval`: Query patient's upcoming appointments from the Appointment table, filtering to future dates and non-cancelled status, formatted for voice output

### Modified Capabilities

- `patient-identification`: Response includes `upcomingAppointments` array when `status: "existing"`. Each appointment contains voice-formatted date/time, provider name (if known), and service name.

## Impact

- **Code**: `src/agent/tools/identify-patient.ts`
  - Add `getUpcomingAppointments(patientId)` function
  - Extend `IdentifyPatientResult` interface with optional `upcomingAppointments` field
  - Query joins Appointment → Provider, AppointmentType for names

- **Prompt**: `config/assistants/_base_assistant.json`
  - Update "STEP 1: Patient Identification" section
  - For `status: 'existing'`, check `upcomingAppointments` before offering scheduling
  - All offices get this update (centralized prompt)

- **Database**: No schema changes - uses existing Appointment model with `[patientId, status]` index

- **Deploy**: Run `pnpm run vapi:setup` to push updated prompt to all offices
