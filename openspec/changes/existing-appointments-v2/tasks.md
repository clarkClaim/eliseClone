## 1. Extend IdentifyPatientResult Interface

- [ ] 1.1 Add `UpcomingAppointment` interface to `src/agent/tools/identify-patient.ts` with fields: `id`, `dateForSpeech`, `timeForSpeech`, `providerName`, `serviceName`, `highlight`
- [ ] 1.2 Add optional `upcomingAppointments?: UpcomingAppointment[]` to `IdentifyPatientResult` interface

## 2. Implement getUpcomingAppointments Function

- [ ] 2.1 Create `getUpcomingAppointments(patientId: string)` function in `src/agent/tools/identify-patient.ts`
- [ ] 2.2 Query `prisma.appointment.findMany()` with:
  - `where: { patientId, startTime: { gt: new Date() }, status: { notIn: ['cancelled', 'no_show'] } }`
  - `include: { provider: true, service: true }`
  - `orderBy: { startTime: 'asc' }`
  - `take: 5`
- [ ] 2.3 Import and use `formatDateForSpeech()` and `formatTimeForSpeech()` from `../../utils/date.js`
- [ ] 2.4 Set `providerName` to empty string if provider name contains "unknown" (case-insensitive)
- [ ] 2.5 Set `highlight: true` for first 2 results, `false` for rest

## 3. Integrate with identifyPatient Function

- [ ] 3.1 Call `getUpcomingAppointments(patient.id)` after successful phone+DOB identification (line ~75)
- [ ] 3.2 Call `getUpcomingAppointments(patient.id)` after successful name+DOB identification (line ~100)
- [ ] 3.3 Add `upcomingAppointments` to return object for both success paths
- [ ] 3.4 Ensure no appointments query for failed identification paths (status: new, not_found_try_name, verification_failed)

## 4. Update Centralized Assistant Prompt

- [ ] 4.1 Open `config/assistants/_base_assistant.json`
- [ ] 4.2 In "STEP 1: Patient Identification" section, update 'existing' case:
  - Check if `upcomingAppointments` has items
  - If yes: mention highlighted appointments, ask if calling about those or need something else
  - If no: proceed to ask how to help with scheduling
- [ ] 4.3 Add example response format for appointments greeting

## 5. Deploy and Test

- [ ] 5.1 Run `pnpm run build` to verify TypeScript compiles
- [ ] 5.2 Run `pnpm run vapi:setup` to deploy updated prompt to VAPI
- [ ] 5.3 Test call: patient with 1 upcoming appointment
- [ ] 5.4 Test call: patient with 3+ upcoming appointments (verify only 2 mentioned initially)
- [ ] 5.5 Test call: patient with no upcoming appointments
- [ ] 5.6 Test call: patient with cancelled appointment (verify excluded)
- [ ] 5.7 Test call: failed DOB verification (verify no appointments leaked)
