## Why

Patients created locally (e.g., via the `save_new_patient` voice tool) are never synced back to the MRS. The current MRSAdapter interface only supports reading patients from the MRS, not writing them. This creates a split-brain problem where OpenMRS doesn't know about patients registered through the voice assistant, causing issues when those patients try to use the clinic's other systems.

## What Changes

- **Add `createPatient()` to MRSAdapter interface** - Abstract method for creating patients in any MRS
- **Add `updatePatient()` to MRSAdapter interface** - Abstract method for updating patient records in MRS
- **Implement patient creation in OpenMRS adapter** - POST to `/patient` with proper person/identifier structure
- **Update `save-new-patient` tool** - Push to MRS in real-time after local creation
- **Add patient push to sync service** - Background sync for locally-created patients
- **Add sync tracking to Patient model** - Track `syncedToMrs`, `syncAttempts`, `lastSyncError` like appointments

## Capabilities

### New Capabilities

- `patient-write-operations`: Abstract interface and implementation for creating/updating patients in MRS. Covers the adapter interface additions and OpenMRS-specific implementation.

### Modified Capabilities

- `mrs-adapter`: Adding `createPatient()` and `updatePatient()` methods to the interface
- `sync-service`: Adding patient push (local → MRS) alongside existing patient pull (MRS → local)

## Impact

- **Files affected**:
  - `src/mrs/adapter.ts` - Add createPatient/updatePatient to interface
  - `src/mrs/types.ts` - Add NewPatient type
  - `src/mrs/adapters/openmrs/adapter.ts` - Implement OpenMRS patient creation
  - `src/mrs/adapters/openmrs/client.ts` - Add POST /patient method
  - `src/mrs/adapters/openmrs/mappers.ts` - Add patient-to-OpenMRS mapper
  - `src/mrs/adapters/mock/adapter.ts` - Mock implementation
  - `src/agent/tools/save-new-patient.ts` - Push to MRS after local save
  - `src/sync/service.ts` - Add patient push logic
  - `prisma/schema.prisma` - Add sync tracking fields to Patient
- **Database migration**: Add sync tracking columns to patients table
- **External dependency**: OpenMRS patient API (already authenticated)
- **Breaking change**: None - additive only
