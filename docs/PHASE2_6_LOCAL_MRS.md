# Phase 2.6: Fix Availability/Appointments - Explore Local MRS

## Problem Summary

The O3 OpenMRS demo instance (`o3.openmrs.org`) does **not have the appointment scheduling module** installed. This means:

| Entity | O3 Demo Support | API Used |
|--------|-----------------|----------|
| Patients | ✅ Yes | FHIR `/Patient` |
| Providers | ✅ Yes | REST `/provider` |
| Locations | ✅ Yes | REST `/location` |
| Availability/Timeslots | ❌ No | Would need `/appointmentscheduling/timeslot` |
| Appointments | ❌ No | Would need `/appointmentscheduling/appointment` |

The O3 FHIR server only supports: Condition, Group, Immunization, Task, MedicationRequest, MedicationDispense, Patient, DiagnosticReport, Flag, RelatedPerson, ServiceRequest, Practitioner, AllergyIntolerance, EpisodeOfCare, Observation, Medication, Encounter, ValueSet, Person, OperationDefinition, Location.

## Root Cause

OpenMRS has a modular architecture. The appointment scheduling functionality is provided by the **Appointment Scheduling Module** which must be explicitly installed. The public O3 demo doesn't include this module.

## Options to Explore

### Option 1: Run Local OpenMRS with Appointment Module

Set up a local OpenMRS instance with the appointment scheduling module installed.

**Pros:**
- Full control over configuration
- Can install any modules needed
- No rate limits or resets
- Realistic testing environment

**Cons:**
- Requires Docker setup
- More infrastructure to maintain
- Need to seed test data

**Implementation:**
```bash
# OpenMRS Reference Application with modules
docker run -p 8080:8080 openmrs/openmrs-reference-application:latest
```

Or use the OpenMRS SDK:
```bash
mvn openmrs-sdk:setup -DserverId=myserver
mvn openmrs-sdk:install -DartifactId=appointmentscheduling-omod
```

### Option 2: Use O2 OpenMRS Demo

Check if `o2.openmrs.org` (OpenMRS 2.x) has the appointment scheduling module.

```bash
curl -u admin:Admin123 "https://o2.openmrs.org/openmrs/ws/rest/v1/appointmentscheduling/appointmenttype"
```

### Option 3: Mock Appointments Locally

For demo purposes, manage appointments entirely locally without MRS sync:
- Patients/providers sync from MRS
- Availability managed locally (created by admin)
- Appointments managed locally only

**Pros:**
- Works with current O3 demo
- Simpler architecture

**Cons:**
- No true bidirectional sync
- Appointments won't appear in MRS

### Option 4: Use FHIR Appointment Resource (Different Server)

Some FHIR servers support the Appointment resource. Could potentially use a different FHIR server for appointments while using OpenMRS for patient data.

## Current Workarounds

The adapter now:
1. Detects if appointment module is available on connect
2. Sets `capabilities.appointments.canCreate = false` if not
3. Returns empty arrays for availability/appointment queries
4. Throws clear error if appointment creation is attempted

## Next Steps

1. [ ] Test O2 demo for appointment module
2. [ ] Set up local OpenMRS with appointment module via Docker
3. [ ] Document Docker Compose setup for full local stack
4. [ ] Seed test data (providers, locations, availability blocks)
5. [ ] Test full sync cycle with appointment module

## References

- [OpenMRS Appointment Scheduling Module](https://wiki.openmrs.org/display/docs/Appointment+Scheduling+Module)
- [OpenMRS Docker](https://hub.docker.com/r/openmrs/openmrs-reference-application)
- [OpenMRS SDK](https://wiki.openmrs.org/display/docs/OpenMRS+SDK)
