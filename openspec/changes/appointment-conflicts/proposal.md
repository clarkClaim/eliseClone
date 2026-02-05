# Appointment Conflict Handling

## Problem

Appointments can become invalid due to:
- **Cancellations**: Provider cancels clinic hours, patient no-shows trigger rebooking
- **Collisions**: Double-booked slots from sync lag or manual MRS edits
- **Schedule changes**: Provider availability changes after appointments booked

Currently, these conflicts exist silently in the database. Patients are not notified and don't have an opportunity to reschedule.

## Proposed Solution

Proactive outbound communication when appointment conflicts are detected:

1. **Detection**: Identify conflicted appointments during sync or via explicit checks
2. **Outbound call**: Call the patient's phone number on file
3. **Live reschedule**: If patient answers, offer to reschedule immediately using voice AI
4. **Voicemail fallback**: If no answer, leave a message asking them to call back to reschedule

## Goals

- Automatically notify patients of appointment conflicts
- Reduce no-shows and patient frustration from showing up to cancelled appointments
- Provide seamless rescheduling experience via voice
- Track notification attempts and outcomes

## Non-Goals

- SMS/email notifications (voice-first for this phase)
- Patient-initiated cancellations (separate flow)
- Waitlist backfill when slots open (separate change)

## Open Questions

1. How many retry attempts before giving up on reaching patient?
2. Should we integrate with voicemail detection to leave appropriate message?
3. What's the SLA for notifying patients after conflict detected?
4. How do we handle patients who don't answer and don't call back?

## Success Criteria

- [ ] Conflicted appointments trigger outbound notification workflow
- [ ] Patients who answer can reschedule in same call
- [ ] Voicemail left for patients who don't answer
- [ ] Notification outcomes tracked in database
