## 1. Appointment Retrieval Function

- [ ] 1.1 Create `getUpcomingAppointments(patientId)` function in `src/agent/tools/identify-patient.ts`
- [ ] 1.2 Query appointments with `patientId`, `startTime > now`, `status NOT IN ('cancelled', 'no_show')`
- [ ] 1.3 Limit query to 5 results, order by `startTime ASC`
- [ ] 1.4 Join with Provider and AppointmentType tables for names

## 2. Appointment Formatting

- [ ] 2.1 Create `formatAppointmentForVoice(appointment)` helper function
- [ ] 2.2 Use `formatDateForSpeech()` for date (returns "Today", "Tomorrow", or weekday + date)
- [ ] 2.3 Use `formatTimeForSpeech()` for time
- [ ] 2.4 Include `providerName` only if known (not "unknown" or placeholder)
- [ ] 2.5 Add `highlight: true` to first 2 appointments, `false` to rest

## 3. Integrate with identify_patient

- [ ] 3.1 Call `getUpcomingAppointments()` after successful patient identification (status: "existing")
- [ ] 3.2 Add `upcomingAppointments` array to response for "existing" status
- [ ] 3.3 Ensure appointments are NOT fetched for failed identification (privacy)

## 4. Update VAPI Assistant Prompt

- [ ] 4.1 Update `config/vapi-assistant.json` system prompt with new workflow
- [ ] 4.2 Add instructions to mention highlighted appointments in greeting
- [ ] 4.3 Add instructions to ask if calling about existing appointments or need something else
- [ ] 4.4 Add fallback: if no appointments, proceed to scheduling flow

## 5. Testing

- [ ] 5.1 Test patient with multiple upcoming appointments
- [ ] 5.2 Test patient with no upcoming appointments
- [ ] 5.3 Test patient with cancelled appointments (should be excluded)
- [ ] 5.4 Verify appointments not leaked on failed DOB verification
