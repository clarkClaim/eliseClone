## 1. Database Schema

- [x] 1.1 Add sync tracking fields to Patient model in `prisma/schema.prisma` (syncedToMrs, syncedToMrsAt, lastSyncError, syncAttempts)
- [x] 1.2 Run `pnpm exec prisma migrate dev` to create migration
- [x] 1.3 Backfill existing patients: set syncedToMrs=true for patients with non-local mrsId

## 2. Types & Interface

- [x] 2.1 Add `NewPatient` interface to `src/mrs/types.ts`
- [x] 2.2 Add `createPatient(patient: NewPatient): Promise<MRSPatient>` to MRSAdapter interface in `src/mrs/adapter.ts`

## 3. OpenMRS Adapter Implementation

- [x] 3.1 Add `createPatient()` method to `src/mrs/adapters/openmrs/client.ts` for POST /patient
- [x] 3.2 Add `mapNewPatientToOpenMRS()` function in `src/mrs/adapters/openmrs/mappers.ts` for building nested person/identifier payload
- [x] 3.3 Add identifier generation function with pattern `ELISE-{YYYYMMDD}-{random}`
- [x] 3.4 Implement `createPatient()` in `src/mrs/adapters/openmrs/adapter.ts` using client and mappers
- [x] 3.5 Add env var config for OPENMRS_PHONE_ATTR_UUID, OPENMRS_IDENTIFIER_TYPE_UUID, OPENMRS_IDENTIFIER_LOCATION_UUID
- [x] 3.6 Document required UUIDs in `.env.example` and `docs/`

## 4. Mock Adapter

- [x] 4.1 Implement `createPatient()` in `src/mrs/adapters/mock/adapter.ts` for testing

## 5. Update save-new-patient Tool

- [x] 5.1 Add MRS adapter import and initialization to `src/agent/tools/save-new-patient.ts`
- [x] 5.2 Add real-time MRS push after local patient creation
- [x] 5.3 Update local patient with returned mrsId on success
- [x] 5.4 Handle push failure: set lastSyncError, leave syncedToMrs=false
- [x] 5.5 Add timeout (5s) for real-time push to avoid slow tool responses

## 6. Sync Service Patient Push

- [x] 6.1 Add `pushPatientsToMRS()` method to `src/sync/service.ts`
- [x] 6.2 Query for unsynced patients (syncedToMrs=false AND mrsId starts with 'local-')
- [x] 6.3 Skip patients missing required fields (givenName, familyName, dob)
- [x] 6.4 Call adapter.createPatient() for each eligible patient
- [x] 6.5 Update patient record on success (mrsId, syncedToMrs, syncedToMrsAt)
- [x] 6.6 Handle failure with retry job and exponential backoff
- [x] 6.7 Add patient push to sync cycle BEFORE appointment push

## 7. Testing

- [ ] 7.1 Test createPatient() against O3 demo manually
- [ ] 7.2 Test save-new-patient tool creates patient in O3
- [ ] 7.3 Test sync service pushes unsynced patients
- [ ] 7.4 Test fallback when MRS unavailable (patient created locally, queued for sync)
- [ ] 7.5 Verify backfill migration works correctly

## 8. Documentation

- [x] 8.1 Update `docs/PHASE2_SYNC_CONSIDERATIONS.md` with patient push details
- [x] 8.2 Add O3 UUID configuration to `docs/VAPI_SETUP.md` or create `docs/OPENMRS_SETUP.md`
