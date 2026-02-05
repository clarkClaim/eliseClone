## Context

The current codebase has an `MRSAdapter` interface in `src/mrs/adapter.ts` with implementations for OpenMRS (Bahmni) and a mock adapter. The interface defines operations for:
- Connection management (connect, disconnect, healthCheck)
- Patient operations (getPatient, searchPatients, getPatients, createPatient)
- Provider operations (getProvider, getProviders)
- Location operations (getLocations)
- Appointment type operations (getAppointmentTypes)
- Schedule configuration (getScheduleConfig)
- Conflict detection (checkConflicts)
- Appointment operations (getAppointments, createAppointment, cancelAppointment, updateAppointmentStatus)

OpenEMR is an open-source EHR with a well-documented REST API and FHIR support. The demo instance at `demo.openemr.io` provides:
- OAuth 2.0 authentication (authorization code + password grant)
- Standard API endpoints for patients and appointments
- FHIR R4 API with read/search capabilities
- Appointment creation via `POST /api/patient/{pid}/appointment`

## Goals / Non-Goals

**Goals:**
- Implement an OpenEMR adapter that conforms to the existing `MRSAdapter` interface
- Support patient search and creation via OpenEMR API
- Support appointment booking via OpenEMR API
- Enable testing against the public OpenEMR demo instance
- Maintain consistency with existing OpenMRS adapter patterns

**Non-Goals:**
- Renaming MRS → EHR across the codebase (deferred to separate change)
- Supporting OpenEMR-specific features not covered by the interface
- Implementing OpenEMR webhooks or real-time sync
- Supporting OpenEMR patient portal APIs

## Decisions

### 1. Use Standard API over FHIR for writes

**Decision**: Use `/api/*` endpoints for all write operations, FHIR only for reads.

**Rationale**: The FHIR API has read-only Appointment support. Creating appointments requires the standard `/api/patient/{pid}/appointment` endpoint. For consistency, we'll use the standard API for all operations rather than mixing APIs.

**Alternatives considered**:
- FHIR-only: Not viable since FHIR Appointment doesn't support create
- Mixed APIs: Would add complexity managing two authentication contexts

### 2. OAuth 2.0 Password Grant for authentication

**Decision**: Use OAuth 2.0 password grant flow with client credentials.

**Rationale**: The OpenMRS adapter uses session-based auth. OpenEMR requires OAuth 2.0. Password grant allows programmatic token acquisition without user interaction, suitable for server-to-server integration.

**Implementation**:
- Register client at startup (or use pre-registered client ID/secret)
- Acquire access token using password grant
- Store and refresh tokens automatically
- Required scopes: `openid api:oemr user/patient.crus user/appointment.cruds`

**Alternatives considered**:
- Authorization code flow: Requires user interaction, not suitable for background sync
- Client credentials flow: Not supported by OpenEMR

### 3. Map OpenEMR calendar model to existing interface

**Decision**: Adapt OpenEMR's appointment model to work with the existing interface.

**OpenEMR appointment model**:
- Uses `pc_catid` for appointment category (maps to appointmentType)
- Uses `pc_eventDate` + `pc_startTime` + `pc_duration` for timing
- Uses `pc_aid` for provider ID
- Uses `pc_facility` for location ID
- Uses `pc_apptstatus` for status codes

**Mapping strategy**:
- `startTime` / `endTime` → parse from `pc_eventDate`, `pc_startTime`, `pc_duration`
- `providerMrsId` → `pc_aid`
- `locationMrsId` → `pc_facility`
- `appointmentTypeMrsId` → `pc_catid`
- Status mapping: OpenEMR uses codes like `-`, `@`, `x` etc.

### 4. Patient search via name and phone

**Decision**: Implement patient search using OpenEMR's patient list endpoint with query parameters.

**OpenEMR search capabilities** (from FHIR metadata):
- By name (family, given)
- By phone
- By birthdate
- By identifier

These align well with our `PatientQuery` interface.

### 5. Capability configuration

**Decision**: Define OpenEMR-specific capabilities reflecting API limitations.

```typescript
const OPENEMR_CAPABILITIES: MRSCapabilities = {
  patientSearch: {
    byPhone: true,
    byName: true,
    byDOB: true,
    byIdentifier: true,
    globalSearch: true,
  },
  appointments: {
    canCreate: true,
    canCancel: true,  // via DELETE
    canReschedule: false,  // delete + create
    canQueryByDateRange: true,
    canQueryByPatient: true,
    supportsStatuses: ['-', '@', '?', 'x', '%', '<', '>', '#', '$'],
  },
  scheduling: {
    model: 'appointment_based',
    supportsScheduleConfig: false,  // OpenEMR doesn't have service configs
    defaultSlotDuration: 15,
    requiresServiceId: true,  // pc_catid required
  },
  sync: {
    supportsIncrementalSync: false,
    supportsWebhooks: false,
    hasModifiedSinceQuery: false,
  },
  rateLimits: {
    requestsPerMinute: null,
    requestsPerHour: null,
    burstLimit: null,
    perEndpointLimits: {},
  },
};
```

## Risks / Trade-offs

**OAuth complexity** → Mitigation: Encapsulate token management in a dedicated `OpenEMRClient` class with automatic refresh.

**Demo instance resets daily** → Mitigation: Document this limitation; for persistent testing, recommend running local OpenEMR instance via Docker.

**Appointment status mapping** → Mitigation: Create explicit status map with sensible defaults for unknown codes.

**No schedule configuration** → Mitigation: OpenEMR doesn't have Bahmni-style service configurations. Scheduling logic will need to use appointment categories and duration settings, or local schedule templates.

**Client registration may require manual approval** → Mitigation: Document setup process; consider pre-configuring client in local dev setup.

## Open Questions

1. **Provider mapping**: Does OpenEMR use practitioner IDs consistently across APIs? Need to verify `pc_aid` maps to FHIR Practitioner resource.

2. **Appointment categories**: How are appointment types/categories configured in OpenEMR? May need to fetch from `/api/list/apptcat` endpoint.

3. **Location/facility mapping**: Verify facility IDs in appointments align with Location FHIR resources.

4. **Rate limits**: The public demo may have undocumented rate limits. Monitor during testing.
