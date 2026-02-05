# MRS System Reference

This document describes the capabilities and characteristics of supported Medical Record Systems (MRS).
Use this as a reference when implementing new adapters or understanding system limitations.

## OpenMRS (with Bahmni Appointments)

**Status:** Implemented (`src/mrs/adapters/openmrs/`)

Uses the Bahmni Appointments module (standard on O3, not the legacy `appointmentscheduling` module).

```yaml
system: openmrs
auth: Basic Auth (username:password base64)
baseUrl: /openmrs/ws/rest/v1/
appointmentModule: Bahmni (/appointment/, /appointmentService/)

capabilities:
  patientSearch:
    byPhone: false  # Must maintain locally
    byName: true    # GET /patient?q=name
    byDOB: false    # No direct DOB search
    byIdentifier: true
    globalSearch: true

  appointments:
    canCreate: true   # POST /appointment
    canCancel: true   # Update status to Cancelled
    canReschedule: true  # POST /appointment/{uuid}/reschedule
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [Scheduled, CheckedIn, Completed, Cancelled, Missed]

  sync:
    supportsIncrementalSync: false
    supportsWebhooks: false
    hasModifiedSinceQuery: false

  rateLimits:
    requestsPerMinute: 60  # Conservative estimate
    requestsPerHour: 1000
    burstLimit: 10

  notes:
    - Demo instance (o3.openmrs.org) resets periodically
    - Uses service-based booking (no discrete timeslots)
    - Appointments booked with explicit start/end times
    - Services define availability windows (weeklyAvailability)
    - FHIR module doesn't support Appointment/Schedule/Slot resources
```

## Epic (Future)

**Status:** Not implemented - reference only

```yaml
system: epic
auth: OAuth2 SMART-on-FHIR
baseUrl: /api/FHIR/R4/

capabilities:
  patientSearch:
    byPhone: false  # Privacy restricted
    byName: false   # Requires exact match + DOB
    byDOB: true     # With name
    byIdentifier: true
    globalSearch: false  # Must have patient context

  appointments:
    canCreate: true  # With proper scopes
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [proposed, pending, booked, arrived, fulfilled, cancelled, noshow]

  sync:
    supportsIncrementalSync: true  # _lastUpdated param
    supportsWebhooks: false  # Subscriptions limited
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 100
    requestsPerHour: 5000
    burstLimit: 20

  notes:
    - Requires App Orchard approval
    - Patient context often required (no global queries)
    - Strict sandbox testing required
    - Must handle token refresh
```

## Cerner (Oracle Health) (Future)

**Status:** Not implemented - reference only

```yaml
system: cerner
auth: OAuth2 SMART-on-FHIR
baseUrl: /fhir/r4/

capabilities:
  patientSearch:
    byPhone: false
    byName: true  # With additional demographics
    byDOB: true
    byIdentifier: true
    globalSearch: false

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [proposed, pending, booked, arrived, fulfilled, cancelled, noshow, entered-in-error]

  sync:
    supportsIncrementalSync: true
    supportsWebhooks: false
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 120
    requestsPerHour: 3600
    burstLimit: 25

  notes:
    - Similar to Epic (FHIR R4)
    - Millennium platform specifics
    - Strict data use agreements
```

## athenahealth (Future)

**Status:** Not implemented - reference only

```yaml
system: athena
auth: OAuth2 (client credentials)
baseUrl: /v1/{practiceid}/

capabilities:
  patientSearch:
    byPhone: true   # More permissive
    byName: true
    byDOB: true
    byIdentifier: true
    globalSearch: true  # Within practice

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: true
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: [open, scheduled, checked_in, checked_out, cancelled, no_show]

  sync:
    supportsIncrementalSync: true
    supportsWebhooks: true  # Changed data subscriptions
    hasModifiedSinceQuery: true

  rateLimits:
    requestsPerMinute: 200
    requestsPerHour: 10000
    burstLimit: 50

  notes:
    - More developer-friendly than Epic/Cerner
    - Practice-scoped API
    - Supports webhooks for some events
```

## OpenEMR (Future)

**Status:** Not implemented - reference only

```yaml
system: openemr
auth: OAuth2 or API token
baseUrl: /apis/default/fhir/

capabilities:
  patientSearch:
    byPhone: false
    byName: true
    byDOB: true
    byIdentifier: true
    globalSearch: true

  appointments:
    canCreate: true
    canCancel: true
    canReschedule: false
    canQueryByDateRange: true
    canQueryByPatient: true
    supportsStatuses: varies  # Version dependent

  sync:
    supportsIncrementalSync: false
    supportsWebhooks: false
    hasModifiedSinceQuery: false

  rateLimits:
    requestsPerMinute: null  # Self-hosted, varies
    requestsPerHour: null
    burstLimit: null

  notes:
    - Open source, similar to OpenMRS
    - Installation-dependent capabilities
    - FHIR support varies by version
```

## Implementing a New Adapter

1. Create a new directory: `src/mrs/adapters/{systemname}/`
2. Implement the `MRSAdapter` interface from `src/mrs/adapter.ts`
3. Define capabilities in a `capabilities.ts` file
4. Create mappers for the MRS's data format
5. Handle authentication in a `client.ts` file
6. Export via an `index.ts` file
7. Update this README with the new system's details
