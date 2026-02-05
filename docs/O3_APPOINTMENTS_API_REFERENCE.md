# O3 OpenMRS Appointments API Reference

This document describes the Bahmni Appointments API available on OpenMRS 3 (O3), as used by the public demo at `o3.openmrs.org`.

## Overview

O3 uses the **Bahmni Appointments Module** (`openmrs-module-appointments`), NOT the legacy `appointmentscheduling` module. The APIs are different.

**Base URL:** `https://o3.openmrs.org/openmrs/ws/rest/v1`
**Auth:** Basic Auth (`admin:Admin123` for demo)

## Quick Reference

| Resource | Endpoint | Notes |
|----------|----------|-------|
| List appointments | `GET /appointment/all` | Optional `?forDate=` |
| Get appointment | `GET /appointment?uuid={uuid}` | |
| Create appointment | `POST /appointment` | |
| Search appointments | `POST /appointment/search` | |
| Reschedule | `POST /appointment/{uuid}/reschedule` | |
| List services | `GET /appointmentService/all/full` | |
| Get service | `GET /appointmentService?uuid={uuid}` | |

---

## Appointments

### List All Appointments

```http
GET /appointment/all
GET /appointment/all?forDate=2025-02-04
```

**Response:** Array of appointment objects

```json
[
  {
    "uuid": "7c58d69f-3c9a-4c9c-abe6-be18f5f35d41",
    "appointmentNumber": "0000",
    "patient": {
      "uuid": "8ef04919-e001-4976-8851-7e908a01aaf3",
      "identifier": "10000PF",
      "name": "Edward Robinson",
      "gender": "M",
      "age": 21
    },
    "service": {
      "uuid": "7ba3aa21-cc56-47ca-bb4d-a60549f666c0",
      "name": "General Medicine service",
      "speciality": { "name": "General", "uuid": "..." }
    },
    "serviceType": null,
    "location": {
      "uuid": "44c3efb0-2583-4c80-a79e-1f756a03c0a1",
      "name": "Outpatient Clinic"
    },
    "startDateTime": 1770180060000,
    "endDateTime": 1770181860000,
    "appointmentKind": "Scheduled",
    "status": "Scheduled",
    "providers": [
      {
        "uuid": "ca61ab7b-69e8-4a15-a61b-1920cc90f133",
        "name": "Super User",
        "response": "ACCEPTED"
      }
    ],
    "comments": "",
    "recurring": false,
    "voided": false
  }
]
```

### Get Single Appointment

```http
GET /appointment?uuid={appointmentUuid}
```

### Search Appointments

```http
POST /appointment/search
Content-Type: application/json

{
  "patientUuid": "8ef04919-e001-4976-8851-7e908a01aaf3",
  "serviceUuid": "7ba3aa21-cc56-47ca-bb4d-a60549f666c0",
  "startDate": "2025-02-01",
  "endDate": "2025-02-28",
  "providerUuid": "ca61ab7b-69e8-4a15-a61b-1920cc90f133",
  "locationUuid": "44c3efb0-2583-4c80-a79e-1f756a03c0a1",
  "status": "Scheduled"
}
```

All fields are optional. Empty object `{}` returns all appointments.

### Create Appointment

```http
POST /appointment
Content-Type: application/json

{
  "patientUuid": "8ef04919-e001-4976-8851-7e908a01aaf3",
  "serviceUuid": "7ba3aa21-cc56-47ca-bb4d-a60549f666c0",
  "serviceTypeUuid": "fbec4378-2d0d-4509-a56e-be0a53700709",
  "startDateTime": "2025-02-10T09:00:00.000Z",
  "endDateTime": "2025-02-10T09:30:00.000Z",
  "locationUuid": "44c3efb0-2583-4c80-a79e-1f756a03c0a1",
  "appointmentKind": "Scheduled",
  "providers": [
    {
      "uuid": "ca61ab7b-69e8-4a15-a61b-1920cc90f133"
    }
  ],
  "comments": "Follow-up visit"
}
```

**Required fields:** `patientUuid`, `serviceUuid`, `startDateTime`, `endDateTime`, `appointmentKind`

**appointmentKind values:** `Scheduled`, `WalkIn`

### Reschedule Appointment

```http
POST /appointment/{uuid}/reschedule?retainNumber=true
Content-Type: application/json

{
  "startDateTime": "2025-02-11T10:00:00.000Z",
  "endDateTime": "2025-02-11T10:30:00.000Z"
}
```

### Appointment Status Values

| Status | Description |
|--------|-------------|
| `Scheduled` | Booked, not yet arrived |
| `CheckedIn` | Patient has arrived |
| `Completed` | Appointment finished |
| `Cancelled` | Cancelled by patient/provider |
| `Missed` | Patient didn't show up |

### Undo Status Change

```http
POST /appointment/{uuid}/undoStatusChange
```

---

## Appointment Services

Services define what types of appointments can be booked (e.g., "General Medicine", "Cardiology").

### List All Services

```http
GET /appointmentService/all/full
```

**Response:**

```json
[
  {
    "uuid": "7ba3aa21-cc56-47ca-bb4d-a60549f666c0",
    "appointmentServiceId": 1,
    "name": "General Medicine service",
    "description": null,
    "speciality": {
      "uuid": "9f2a8cd0-32c6-4844-8df7-1ac9c4d79943",
      "name": "General"
    },
    "startTime": "",
    "endTime": "",
    "maxAppointmentsLimit": null,
    "durationMins": null,
    "location": {},
    "color": "#feecae",
    "serviceTypes": [
      {
        "uuid": "fbec4378-2d0d-4509-a56e-be0a53700709",
        "name": "Short follow-up",
        "duration": 10
      }
    ],
    "weeklyAvailability": []
  }
]
```

### Get Single Service

```http
GET /appointmentService?uuid={serviceUuid}
```

### Get Service Load (Availability)

```http
GET /appointmentService/load?uuid={serviceUuid}&startDateTime={start}&endDateTime={end}
```

---

## Supporting Resources

These use the standard OpenMRS REST API (not Bahmni-specific).

### Patients

```http
GET /patient?q={searchTerm}&v=default
GET /patient/{uuid}
```

### Providers

```http
GET /provider?v=custom:(uuid,identifier,person:(display))
GET /provider/{uuid}
```

**Demo providers:**
| Name | UUID | Identifier |
|------|------|------------|
| Super User | `ca61ab7b-69e8-4a15-a61b-1920cc90f133` | admin |
| Jake Doctor | `705f5791-07a7-44b8-932f-a81f3526fc98` | doctor |
| Jane Nurse | `1fee2f21-82f3-4aab-8d87-f1cf19034649` | nurse |

### Locations

```http
GET /location?v=custom:(uuid,name)
GET /location/{uuid}
```

**Demo locations:**
| Name | UUID |
|------|------|
| Outpatient Clinic | `44c3efb0-2583-4c80-a79e-1f756a03c0a1` |
| Inpatient Ward | `ba685651-ed3b-4e63-9b35-78893060758a` |
| Community Outreach | `1ce1b7d4-c865-4178-82b0-5932e51503d6` |

---

## Demo Data (o3.openmrs.org)

**Services configured:**
- General Medicine service (`7ba3aa21-cc56-47ca-bb4d-a60549f666c0`)
- Outpatient Department (`1ef43565-9c96-4f58-bfd2-c864c7cedac1`)
- Rehabilitation service (`4ec5c4fe-cfe0-48ff-9e4d-2f201078feae`)

**Note:** The demo resets periodically. Test data may disappear.

---

## Differences from Legacy API

The legacy `appointmentscheduling` module (NOT used by O3) has different endpoints:

| Concept | Legacy Path | Bahmni Path |
|---------|-------------|-------------|
| Appointments | `/appointmentscheduling/appointment` | `/appointment` |
| Types | `/appointmentscheduling/appointmenttype` | `/appointmentService` |
| Timeslots | `/appointmentscheduling/timeslot` | N/A (use service availability) |
| Blocks | `/appointmentscheduling/appointmentblock` | N/A |

---

## FHIR Support

O3's FHIR server does **NOT** support the Appointment resource. Use the REST API above.

Supported FHIR resources: Condition, Patient, Practitioner, Location, Encounter, Observation, etc.

---

## Example: Book an Appointment Flow

```bash
# 1. Find available services
curl -u admin:Admin123 \
  "https://o3.openmrs.org/openmrs/ws/rest/v1/appointmentService/all/full"

# 2. Find the patient
curl -u admin:Admin123 \
  "https://o3.openmrs.org/openmrs/ws/rest/v1/patient?q=Edward"

# 3. Create appointment
curl -u admin:Admin123 \
  -X POST \
  -H "Content-Type: application/json" \
  "https://o3.openmrs.org/openmrs/ws/rest/v1/appointment" \
  -d '{
    "patientUuid": "8ef04919-e001-4976-8851-7e908a01aaf3",
    "serviceUuid": "7ba3aa21-cc56-47ca-bb4d-a60549f666c0",
    "startDateTime": "2025-02-10T09:00:00.000Z",
    "endDateTime": "2025-02-10T09:30:00.000Z",
    "appointmentKind": "Scheduled",
    "locationUuid": "44c3efb0-2583-4c80-a79e-1f756a03c0a1",
    "providers": [{"uuid": "ca61ab7b-69e8-4a15-a61b-1920cc90f133"}]
  }'
```

---

## Elise Sync Compatibility

### Bulk Retrieval Support

| Resource | REST API | FHIR API | Recommended |
|----------|----------|----------|-------------|
| **Patients** | ❌ Requires search query | ✅ `GET /Patient?_count=N` with pagination | FHIR |
| **Providers** | ✅ `GET /provider` | ✅ `GET /Practitioner` | REST |
| **Locations** | ✅ `GET /location?limit=N` | ✅ `GET /Location` | REST |
| **Appointments** | ✅ `GET /appointment/all` | ❌ Not supported | REST (Bahmni) |
| **Services** | ✅ `GET /appointmentService/all/full` | ❌ N/A | REST (Bahmni) |

### Current Adapter Status

The Elise OpenMRS adapter (`src/mrs/adapters/openmrs/`) uses Bahmni API:

| Method | Bahmni Endpoint | Status |
|--------|-----------------|--------|
| `getPatients()` | FHIR `/Patient` | ✅ Works |
| `searchPatients()` | REST `/patient?q=` | ✅ Works |
| `getProviders()` | REST `/provider` | ✅ Works |
| `getLocations()` | REST `/location` | ✅ Works |
| `getAppointmentTypes()` | `/appointmentService/all/full` | ✅ Updated |
| `getAppointments()` | `POST /appointment/search` | ✅ Updated |
| `createAppointment()` | `POST /appointment` | ✅ Updated |
| `cancelAppointment()` | Update status to "Cancelled" | ✅ Updated |
| `getAvailability()` | Returns empty (service-based model) | ✅ Updated |

### Availability Model Differences

**Legacy (timeslot-based):**
```
AppointmentBlock → TimeSlots → Appointments
Provider creates blocks, system generates slots, patients book slots
```

**Bahmni (service-based):**
```
AppointmentService → weeklyAvailability → Appointments
Services define hours, appointments booked directly with start/end times
```

Key difference: Bahmni doesn't have discrete "slots" - appointments are booked by specifying a time range within service availability.

### Migration Checklist

- [x] Update `getAppointmentTypes()` → use `/appointmentService/all/full`
- [x] Update `getAppointments()` → use `POST /appointment/search` with date filter
- [x] Update `createAppointment()` → use `POST /appointment` with new payload format
- [x] Update `cancelAppointment()` → update appointment status to "Cancelled"
- [x] Rethink availability sync → returns empty (service-based, no discrete slots)
- [x] Update mappers for new response formats
- [x] Remove `detectAppointmentModule()` probe for legacy endpoint
- [x] Add probe for Bahmni endpoint instead

---

## References

- [Bahmni Appointments Module (GitHub)](https://github.com/Bahmni/openmrs-module-appointments)
- [O3 Appointment Management (OpenMRS Wiki)](https://openmrs.atlassian.net/wiki/spaces/projects/pages/26938348/O3+Appointment+Management)
- [O3 Demo](https://o3.openmrs.org) - Login: admin / Admin123
