## 1. Update Mappers

- [x] 1.1 Create `mapBahmniAppointmentService()` mapper for appointment services → `MRSAppointmentType`
- [x] 1.2 Create `mapBahmniAppointmentServiceList()` for array mapping
- [x] 1.3 Create `mapBahmniAppointment()` mapper for Bahmni appointment → `MRSAppointment`
- [x] 1.4 Create `mapBahmniAppointmentList()` for array mapping
- [x] 1.5 Add Bahmni status mapping constants (Scheduled↔scheduled, CheckedIn↔checked_in, etc.)
- [x] 1.6 Update or create types for Bahmni response structures

## 2. Update Client Methods

- [x] 2.1 Add `getAppointmentServices()` method to client for `/appointmentService/all/full`
- [x] 2.2 Add `searchAppointments()` method to client for `POST /appointment/search`
- [x] 2.3 Add `createBahmniAppointment()` method to client for `POST /appointment`
- [x] 2.4 Add `getAppointmentByUuid()` method to client for `GET /appointment?uuid=`
- [x] 2.5 Add `updateAppointment()` method to client for appointment updates

## 3. Update Adapter Methods

- [x] 3.1 Update `getAppointmentTypes()` to use Bahmni service endpoint and new mapper
- [x] 3.2 Update `getAppointments()` to use `POST /appointment/search` with filter mapping
- [x] 3.3 Update `createAppointment()` to use Bahmni payload format (patientUuid, serviceUuid, startDateTime, endDateTime, etc.)
- [x] 3.4 Update `cancelAppointment()` to update status instead of using legacy endpoint
- [x] 3.5 Update `updateAppointmentStatus()` to use Bahmni status values
- [x] 3.6 Update `getAvailability()` to return service-based availability (or empty for now)

## 4. Update Module Detection

- [x] 4.1 Update `detectAppointmentModule()` to probe Bahmni endpoint (`/appointment/all` or `/appointmentService/all/full`)
- [x] 4.2 Remove references to legacy `/appointmentscheduling/` endpoints
- [x] 4.3 Update capabilities constants if needed

## 5. Update Types

- [x] 5.1 Update `NewAppointment` interface to use `startDateTime`/`endDateTime` instead of `slotMrsId`
- [x] 5.2 Add `serviceUuid` to `NewAppointment` (replaces `appointmentTypeMrsId` semantically)
- [x] 5.3 Update any sync code that relies on old `NewAppointment` interface

## 6. Testing (Manual - Requires O3 Demo)

- [ ] 6.1 Test `getAppointmentTypes()` against O3 demo
- [ ] 6.2 Test `getAppointments()` against O3 demo
- [ ] 6.3 Test `createAppointment()` against O3 demo
- [ ] 6.4 Test module detection works correctly
- [ ] 6.5 Verify sync service runs without errors

## 7. Cleanup

- [x] 7.1 Remove legacy mapper functions (if no longer used) - kept for backward compatibility, marked as legacy
- [x] 7.2 Remove legacy endpoint constants - updated docs
- [x] 7.3 Update any comments/docs referencing legacy API
- [x] 7.4 Update `docs/O3_APPOINTMENTS_API_REFERENCE.md` migration checklist to mark items complete
