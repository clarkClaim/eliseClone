## Why

Elise may serve multiple clinic locations, each with its own inbound phone number. Currently, OpenMRS configuration (identifier type, location, phone attribute) is global. This means all patients are registered at the same location regardless of which clinic number they call.

## What Changes

- **Add `LocationConfig` model** - Store per-location OpenMRS configuration
- **Lookup config by inbound number** - Route calls to correct location config
- **Pass location context through patient creation** - Use correct UUIDs per location

## Capabilities

### New Capabilities

- `location-config`: Database model and lookup for per-location OpenMRS settings

### Modified Capabilities

- `patient-write-operations`: Accept location context, use location-specific UUIDs
- `save-new-patient`: Determine location from call metadata, pass to adapter

## Impact

- **Database**: New `LocationConfig` table
- **Files**: Adapter, save-new-patient tool, possibly VAPI webhook handler
- **Breaking**: None - single-location continues to work with defaults

## Reference Data

See `config/openmrs-o3-demo.json` for O3 demo location UUIDs:
- Outpatient Clinic (appointments)
- Community Outreach (mobile programs)
- Inpatient Ward (admissions)

## Open Questions

- [ ] How to identify inbound location? VAPI provides destination number?
- [ ] Should location config live in DB or config file?
- [ ] How to handle patient transfers between locations?
