## 1. Setup

- [x] 1.1 Create adapter directory structure at `src/mrs/adapters/openemr/`
- [x] 1.2 Add OpenEMR-specific environment variables to `.env.example` (OPENEMR_URL, OPENEMR_CLIENT_ID, OPENEMR_CLIENT_SECRET, OPENEMR_USERNAME, OPENEMR_PASSWORD)
- [x] 1.3 Add `openemr` to `MRSSystemType` union in `src/mrs/types.ts` (already present, verify)

## 2. OAuth Client Implementation

- [x] 2.1 Create `src/mrs/adapters/openemr/client.ts` with `OpenEMRClient` class
- [x] 2.2 Implement OAuth 2.0 password grant token acquisition in client
- [x] 2.3 Implement automatic token refresh on 401 responses
- [x] 2.4 Implement authenticated HTTP methods (get, post, delete) with token injection
- [x] 2.5 Add connection validation method that tests API access

## 3. Data Mappers

- [x] 3.1 Create `src/mrs/adapters/openemr/mappers.ts` for data transformation functions
- [x] 3.2 Implement `mapOpenEMRPatient()` to convert API response to `MRSPatient`
- [x] 3.3 Implement `mapOpenEMRAppointment()` to convert API response to `MRSAppointment`
- [x] 3.4 Implement `mapNewPatientToOpenEMR()` to convert `NewPatient` to API payload
- [x] 3.5 Implement `mapCreateAppointmentToOpenEMR()` to convert `CreateAppointmentRequest` to API payload
- [x] 3.6 Create appointment status mapping (OpenEMR codes ↔ MRSAppointmentStatus)
- [x] 3.7 Implement `mapOpenEMRProvider()` and `mapOpenEMRLocation()` for reference data

## 4. Capabilities Configuration

- [x] 4.1 Create `src/mrs/adapters/openemr/capabilities.ts` with `OPENEMR_CAPABILITIES` constant
- [x] 4.2 Define patient search capabilities (byPhone, byName, byDOB, byIdentifier)
- [x] 4.3 Define appointment capabilities (canCreate, canCancel, status codes)
- [x] 4.4 Define scheduling model as appointment_based with requiresServiceId

## 5. Adapter Core Implementation

- [x] 5.1 Create `src/mrs/adapters/openemr/adapter.ts` with `OpenEMRAdapter` class
- [x] 5.2 Implement constructor accepting config object
- [x] 5.3 Implement `fromEnv()` static factory method
- [x] 5.4 Implement `connect()` with OAuth token acquisition
- [x] 5.5 Implement `disconnect()` to clear token state
- [x] 5.6 Implement `healthCheck()` with latency measurement

## 6. Patient Operations

- [x] 6.1 Implement `getPatient(mrsId)` using `/api/patient/{uuid}` endpoint
- [x] 6.2 Implement `searchPatients(query)` with name and phone support
- [x] 6.3 Implement `getPatients(options)` for bulk patient retrieval
- [x] 6.4 Implement `createPatient(patient)` using `/api/patient` POST endpoint

## 7. Appointment Operations

- [x] 7.1 Implement `getAppointments(filter)` using `/api/appointment` endpoint
- [x] 7.2 Implement `createAppointment(request)` using `/api/patient/{pid}/appointment` POST
- [x] 7.3 Implement `cancelAppointment(mrsId, reason)` using DELETE endpoint
- [x] 7.4 Implement `updateAppointmentStatus(mrsId, status)` if supported, or throw not-implemented
- [x] 7.5 Implement `checkConflicts(request)` by querying existing appointments

## 8. Reference Data Operations

- [x] 8.1 Implement `getProviders()` using FHIR `/fhir/Practitioner` endpoint
- [x] 8.2 Implement `getProvider(mrsId)` for single provider lookup
- [x] 8.3 Implement `getLocations()` using `/api/facility` endpoint
- [x] 8.4 Implement `getAppointmentTypes()` using `/api/list/apptcat` endpoint

## 9. Deprecated Interface Methods

- [x] 9.1 Implement `getAvailability()` returning empty array with deprecation warning
- [x] 9.2 Implement `getProviderAvailability()` returning empty array with deprecation warning
- [x] 9.3 Implement `verifySlotAvailable()` returning available=true with deprecation warning
- [x] 9.4 Implement `getScheduleConfig()` returning empty array (not supported)

## 10. Module Export

- [x] 10.1 Create `src/mrs/adapters/openemr/index.ts` with public exports
- [x] 10.2 Export `OpenEMRAdapter`, `OpenEMRAdapterConfig`, and `OPENEMR_CAPABILITIES`
- [x] 10.3 Update `src/mrs/adapters/index.ts` to include OpenEMR adapter exports

## 11. Documentation

- [x] 11.1 Create `docs/OPENEMR_SETUP.md` with configuration guide
- [x] 11.2 Document OAuth client registration process
- [x] 11.3 Document demo instance limitations (daily reset)
- [x] 11.4 Add OpenEMR adapter usage examples to documentation

## 12. Testing

- [x] 12.1 Create manual test script for OpenEMR demo instance
- [x] 12.2 Verify patient search works against demo
- [x] 12.3 Verify appointment creation works against demo
- [x] 12.4 Verify OAuth token refresh works correctly
