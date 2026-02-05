# OpenEMR Adapter - DRAFT

> **Status**: Early draft - needs API exploration before completing

## Why

Currently Elise only supports OpenMRS as an EHR backend. Adding OpenEMR support would:
1. Validate our abstraction layer works across different EHR systems
2. Provide an alternative for clinics using OpenEMR
3. OpenEMR has a public demo instance available for testing

Additionally, the current abstraction uses "MRS" (Medical Record System) terminology which should be renamed to "EHR" (Electronic Health Record) for clarity and industry alignment.

## What Changes

- **BREAKING**: Rename `MRS` → `EHR` across the codebase (adapter interface, types, folder structure)
- Add OpenEMR adapter implementation
- Support patient identification via OpenEMR API
- Support appointment scheduling via OpenEMR API
- Update sync service to work with either EHR system

## Capabilities

### New Capabilities
- `openemr-adapter`: OpenEMR API integration for patients and scheduling

### Modified Capabilities
- TBD after reviewing existing specs and abstraction layer

## Impact

- `src/mrs/` → `src/ehr/` (folder rename)
- `MRSAdapter` → `EHRAdapter` (interface rename)
- All files importing from mrs module
- Environment variables (OPENMRS_* may need EHR_* equivalents)
- Documentation updates

---

## Next Steps

**Before completing this proposal, explore the OpenEMR demo API to understand what's available:**

- Demo URL: https://www.open-emr.org/demo/
- Research: API documentation, authentication, patient endpoints, scheduling endpoints
- Determine: Can we use the public demo as-is, or do we need a local instance?
- Review: Current EHR abstraction - what needs to change to support both systems?

Resume with `/opsx:continue openemr-adapter` after exploration.
