## Why

The public OpenEMR demo at demo.openemr.io is unreliable for development:
- Resets daily at 8 AM UTC, invalidating OAuth clients
- Other users change admin passwords
- API access (REST/FHIR) appears disabled or restricted
- Frequent 502 errors and downtime

We need a local OpenEMR instance with full control over configuration, persistent data, and pre-loaded demo patients/providers for testing the EMR profile integration.

## What Changes

- Create a new directory `../openemr-local/` (sibling to ehsClone) containing Docker Compose setup for OpenEMR
- Pre-configure OpenEMR with API access enabled (REST, FHIR, OAuth password grant)
- Include demo data: patients, providers, appointments, facilities
- Provide scripts to start/stop/reset the instance
- Update `config/profiles/emr.env` to point to local instance by default

## Capabilities

### New Capabilities
- `local-openemr-setup`: Docker Compose configuration for running OpenEMR locally with MySQL, pre-configured for API access and seeded with demo data

### Modified Capabilities
- `local-development`: Update EMR profile to use local OpenEMR instance instead of public demo

## Impact

- **New directory**: `../openemr-local/` with Docker Compose and config files
- **Config change**: `config/profiles/emr.env` updated with local URLs
- **Dependencies**: Requires Docker with ~2GB disk space for OpenEMR + MySQL
- **Ports**: OpenEMR on 8300 (HTTP) and 9300 (HTTPS), MySQL on 3306 (if exposed)
