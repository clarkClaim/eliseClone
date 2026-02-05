## Why

Currently, after identifying a patient, the assistant immediately asks about scheduling a new appointment. This ignores existing appointments the patient may have, leading to confusion ("I already have one scheduled") and missed opportunities to help with rescheduling or cancellations. Patients often call to confirm, modify, or cancel existing appointments rather than book new ones.

## What Changes

- Enhance `identify_patient` response to include upcoming appointments when patient is successfully identified
- Pre-fetch appointments during identification (for performance) but only reveal after DOB is confirmed (for privacy)
- Assistant reports upcoming appointments before offering to schedule new ones
- Support for at least the next 2 upcoming appointments in the response
- If patient has no upcoming appointments, proceed to scheduling flow as before

## Capabilities

### New Capabilities

- `existing-appointments-retrieval`: Capability to fetch and return a patient's upcoming appointments as part of identification, with rules for what to include (future appointments only, limit to reasonable count, sorted by date)

### Modified Capabilities

- `patient-identification`: Response now includes `upcomingAppointments` array when patient is successfully identified. The assistant workflow changes to report existing appointments before offering new scheduling.

## Impact

- **Code**: `src/agent/tools/identify-patient.ts` - add appointment query and include in response
- **VAPI Config**: `config/vapi-assistant.json` - update assistant prompt to handle existing appointments flow
- **Database**: No schema changes - uses existing Appointment model
- **API**: Tool response format changes (additive - new optional field)
