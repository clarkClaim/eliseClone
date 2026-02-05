# OpenEMR API Analysis & Adapter Comparison

**Date:** 2026-02-05
**Demo Site:** `demo.openemr.io/a/openemr` (OpenEMR 7.0.4)

## Executive Summary

The OpenEMR demo site requires **OAuth2 password grant to be enabled by an admin**, which it is NOT on the public demo. Your adapter implementation is correct, but you cannot test against the demo without either:

1. Using a local OpenEMR instance with password grant enabled
2. Implementing authorization code flow (interactive browser login)

## Key Findings

### Authentication

| Aspect | OpenEMR Demo | Required for Adapter |
|--------|-------------|---------------------|
| OAuth Discovery | ✅ Works | ✅ Correct endpoint |
| Client Registration | ✅ Works (dynamic) | ✅ Implemented |
| Password Grant | ❌ **DISABLED** | ❌ Fails with "invalid_client" |
| Auth Code Flow | ✅ Supported | Not implemented (interactive) |

**Root Cause:** Password grant must be enabled in Admin → Config → Connectors → "OAuth2 Password Grant". The demo site has this disabled for security.

### API Capabilities from FHIR Metadata

| Resource | Interactions | Search Params | Notes |
|----------|-------------|---------------|-------|
| Patient | create, update, search, read | 16 params | Full CRUD via FHIR |
| Appointment | search, read | 4 params | **NO CREATE in FHIR** |
| Practitioner | create, update, search, read | 13 params | Full access |
| Location | search, read | 7 params | Read-only |
| Organization | create, update, search, read | 10 params | Full CRUD |
| Slot | ❌ NOT FOUND | - | OpenEMR doesn't use slots |
| Schedule | ❌ NOT FOUND | - | OpenEMR doesn't use schedules |

### Supported Scopes (from OpenID config)

```
api:oemr              - Standard REST API access
api:fhir              - FHIR R4 API access
user/patient.read     - Read patient records
user/patient.write    - Write patient records
user/appointment.read - Read appointments
user/appointment.write- Write appointments (Standard API only)
user/practitioner.read
user/facility.read
user/list.read        - Read list options (appointment types, etc.)
```

## Adapter Comparison: OpenEMR vs OpenMRS (Bahmni)

### Similarities ✅

| Feature | OpenMRS (Bahmni) | OpenEMR | Status |
|---------|-----------------|---------|--------|
| Scheduling Model | appointment_based | appointment_based | ✅ Same |
| Slot-Based | No (deprecated) | No | ✅ Same |
| Patient CRUD | Full | Full | ✅ Same |
| Provider Read | Yes | Yes | ✅ Same |
| Conflict Detection | Local query | Local query | ✅ Same |
| DateTime Booking | Yes | Yes | ✅ Same |

### Differences ⚠️

| Feature | OpenMRS (Bahmni) | OpenEMR | Action Needed |
|---------|-----------------|---------|---------------|
| Auth | Basic Auth | OAuth2 | ✅ Implemented |
| Service Config | Bahmni services | Not supported | OpenEMR uses categories |
| Appointment Create | Bahmni module | Standard REST API | ✅ Implemented |
| Reschedule | Native endpoint | Delete + Create | ⚠️ Different approach |
| Status Update | Native endpoint | **NOT SUPPORTED** | ⚠️ Limitation |
| Appointment Types | Bahmni services | `/list/apptstat` | ⚠️ May need adjustment |

### Capability Comparison

```typescript
// OpenMRS Capabilities
{
  appointments: {
    canCreate: true,
    canCancel: true,
    canReschedule: true,        // Native
    canQueryByDateRange: true,
    canQueryByPatient: true,
  },
  scheduling: {
    supportsScheduleConfig: true,  // Bahmni services
  }
}

// OpenEMR Capabilities
{
  appointments: {
    canCreate: true,
    canCancel: true,
    canReschedule: false,       // Must delete + create
    canQueryByDateRange: true,
    canQueryByPatient: true,
  },
  scheduling: {
    supportsScheduleConfig: false, // No Bahmni-style services
  }
}
```

## Issues Identified in OpenEMR Adapter

### 1. Appointment Types Endpoint (Minor)

Current: `/list/apptstat` - returns appointment **statuses**
Should be: OpenEMR categories are in different location

**Fix needed:** Check the actual endpoint for appointment categories vs statuses.

### 2. Status Update Not Supported (Blocking)

The adapter throws an error for `updateAppointmentStatus()`:
```typescript
throw new MRSValidationError('Appointment status update not directly supported...');
```

**Analysis:** OpenEMR Standard REST API does support appointment updates via:
```
PUT /apis/default/api/patient/{pid}/appointment/{eid}
```

### 3. Patient Search by Phone

Current: Uses FHIR with `phone` parameter
OpenEMR FHIR: Supports `phone` search param on Patient resource

**Status:** Should work once authenticated.

## Recommended Actions

### Immediate (Testing)

1. **Set up local OpenEMR:**
   ```bash
   cd ../openemr-local && ./start.sh
   ```

2. **Enable password grant:**
   - Admin → Config → Connectors
   - Enable "OAuth2 Password Grant"

3. **Register a client:**
   ```bash
   pnpm tsx scripts/openemr-register-client.ts
   ```

4. **Update `config/profiles/emr.env`:**
   ```env
   OPENEMR_CLIENT_ID=<your_client_id>
   OPENEMR_CLIENT_SECRET=<your_client_secret>
   ```

### Code Changes

1. **Fix Appointment Types endpoint:**
   ```typescript
   // Current (wrong - gets statuses)
   await this.client.get<...>('/list/apptstat');

   // Should be categories - need to verify endpoint
   // Options: /appointment/categories or /calendar/categories
   ```

2. **Implement Status Update:**
   ```typescript
   async updateAppointmentStatus(mrsId: string, status: string): Promise<void> {
     const openemrStatus = OPENEMR_REVERSE_STATUS_MAP[status];
     await this.client.put(`/patient/{pid}/appointment/${mrsId}`, {
       pc_apptstatus: openemrStatus
     });
   }
   ```

3. **Add module detection (like OpenMRS):**
   ```typescript
   private async detectCapabilities(): Promise<void> {
     // Test endpoints and adjust capabilities
   }
   ```

## API Reference

### Standard REST API Endpoints

```
GET  /apis/default/api/patient                    - List patients
GET  /apis/default/api/patient/{uuid}             - Get patient
POST /apis/default/api/patient                    - Create patient
GET  /apis/default/api/patient/{pid}/appointment  - Patient appointments
POST /apis/default/api/patient/{pid}/appointment  - Create appointment
PUT  /apis/default/api/patient/{pid}/appointment/{eid} - Update appointment
DELETE /apis/default/api/patient/{pid}/appointment/{eid} - Delete appointment
GET  /apis/default/api/facility                   - List facilities
GET  /apis/default/api/practitioner               - List practitioners
GET  /apis/default/api/list/{listname}            - Get list options
```

### FHIR R4 Endpoints

```
GET  /apis/default/fhir/Patient                   - Search patients
GET  /apis/default/fhir/Patient/{id}              - Get patient
POST /apis/default/fhir/Patient                   - Create patient
GET  /apis/default/fhir/Practitioner              - Search practitioners
GET  /apis/default/fhir/Appointment               - Search appointments (read-only!)
GET  /apis/default/fhir/Location                  - Search locations
GET  /apis/default/fhir/metadata                  - Capability statement
```

## Sources

- [OpenEMR API README](https://github.com/openemr/openemr/blob/master/API_README.md)
- [OpenEMR AUTHENTICATION.md](https://github.com/openemr/openemr/blob/master/Documentation/api/AUTHENTICATION.md)
- [OpenEMR Password Grant Blog Post](https://benmarte.com/blog/openemr-api-v6/)
- [Authenticating with OpenEMR FHIR](https://mattsch.com/blog/2025/07/23/authenticating-as-a-system-user-with-openemrs-fhir-api-using-oauth2/)
