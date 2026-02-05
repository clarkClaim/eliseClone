## Why

The OpenMRS adapter currently uses the legacy `appointmentscheduling` module API which is not available on OpenMRS 3 (O3). The O3 platform uses the Bahmni Appointments Module with completely different API endpoints. This causes all appointment-related operations (sync, create, cancel) to fail with 404 errors against the O3 demo and any O3 deployment.

## What Changes

- **Update appointment type retrieval** to use `/appointmentService/all/full` instead of `/appointmentscheduling/appointmenttype`
- **Update appointment retrieval** to use `POST /appointment/search` or `GET /appointment/all` instead of `/appointmentscheduling/appointment`
- **Update appointment creation** to use `POST /appointment` with new payload format (service-based, not timeslot-based)
- **Update appointment cancellation** to update status instead of using legacy cancel endpoint
- **Rethink availability model** - Bahmni uses service-based availability, not discrete timeslots
- **Update module detection** to probe for Bahmni endpoint instead of legacy endpoint
- **Update all mappers** for new response formats
- **BREAKING**: Remove timeslot-based availability API (replaced with service availability)

## Capabilities

### New Capabilities

- `bahmni-appointments-api`: Integration with Bahmni appointments module REST API for O3 compatibility

### Modified Capabilities

<!-- This is primarily an implementation change to existing adapter behavior, not new requirements -->

## Impact

- **Files affected**:
  - `src/mrs/adapters/openmrs/adapter.ts` - Main adapter methods
  - `src/mrs/adapters/openmrs/client.ts` - May need new methods
  - `src/mrs/adapters/openmrs/mappers.ts` - New response format mappers
  - `src/mrs/adapters/openmrs/capabilities.ts` - Update capability definitions
  - `src/mrs/types.ts` - May need type updates for service-based model
- **Sync service**: Will work correctly once adapter is updated
- **External dependency**: Requires O3 with Bahmni appointments module (confirmed available on `o3.openmrs.org`)
- **Breaking change**: Availability model changes from timeslots to service-based
