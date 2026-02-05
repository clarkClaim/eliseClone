## Why

Before building scheduling tools, we need a working Agent that can identify patients. This is the foundation of the voice experience: a patient calls in, provides their phone number and date of birth, and the system determines if they're an existing patient or a first-time caller. This enables parallel development with MRS sync work and provides an early demo milestone.

## What Changes

- Add seed data with test patients (names, phones, DOBs) for development and demo
- Implement VAPI webhook integration with session/conversation management
- Build patient identification flow: lookup by phone, verify with DOB
- Return identification result: existing patient (with details) or first-time patient flag

## Capabilities

### New Capabilities

- `seed-data`: Database seed script for test patients with phone numbers and DOBs. Supports repeatable seeding for development and demo scenarios.
- `vapi-integration`: VAPI webhook handlers for voice calls including session management, conversation tracking, and the assistant configuration. Handles inbound calls and maintains conversation state.
- `patient-identification`: Agent flow for identifying callers. Matches phone number against patient_phones table, verifies identity with date of birth, and distinguishes existing patients from first-time callers.

### Modified Capabilities

(none - these are all new capabilities building on the existing database schema)

## Impact

- **Database**: Requires seed data script; uses existing Patient and PatientPhone tables
- **API**: New webhook endpoints for VAPI (`/vapi/webhook` or similar)
- **External Services**: VAPI account and assistant configuration required
- **Environment**: New env vars for VAPI API key, assistant ID
- **Development**: Can be developed in a git worktree to avoid conflicts with MRS sync work
