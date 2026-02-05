## Why

~~We need our own OpenMRS demo instance because the public O3 demo (`o3.openmrs.org`) doesn't have the appointment scheduling module installed.~~

**UPDATE:** We discovered that the public O3 demo **does** have the Bahmni appointments module (`openmrs-module-appointments`) installed and working. The original assumption was based on the *legacy* `appointmentscheduling` module, which is different.

The actual need is:
1. Document the correct (Bahmni) appointments API for Elise integration
2. Optionally have a local/deployable O3 instance for development/demos with guaranteed uptime

## What Changes

- ~~Custom Dockerfile with legacy appointment modules~~ (not needed)
- Created `~/projects/elise/openmrs-demo` with stock O3 docker-compose (optional local dev)
- **Created `docs/O3_APPOINTMENTS_API_REFERENCE.md`** documenting the Bahmni appointments API
- Elise adapter needs updating to use Bahmni API instead of legacy API

## Capabilities

### New Capabilities

- `openmrs-docker-setup`: Docker Compose configuration for running OpenMRS 3 locally (optional - public demo works)
- ~~`appointment-module-integration`~~: Not needed - O3 includes Bahmni appointments by default
- ~~`railway-deployment`~~: Deferred - public demo may be sufficient

### Actual Deliverable

- `o3-appointments-api-reference`: Complete API documentation for the Bahmni appointments module as available on O3

### Modified Capabilities

<!-- None -->

## Impact

- **New documentation**: `docs/O3_APPOINTMENTS_API_REFERENCE.md` added to elise-clone
- **Local dev setup**: `~/projects/elise/openmrs-demo` available for optional local O3 instance
- **External dependency**: Elise can use public O3 demo (`o3.openmrs.org`) directly
- **Adapter changes needed**: Elise MRS adapter must be updated from legacy API to Bahmni API
- **Infrastructure**: Railway deployment deferred (may not be needed)

## Key Discovery

The public O3 demo at `o3.openmrs.org` already supports:
- `GET /openmrs/ws/rest/v1/appointment/all` - List appointments
- `POST /openmrs/ws/rest/v1/appointment` - Create appointments
- `GET /openmrs/ws/rest/v1/appointmentService/all/full` - List services

This changes the scope from "deploy custom OpenMRS" to "document existing API and update adapter."
