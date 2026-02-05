# local-development Delta Specification

## MODIFIED Requirements

### Requirement: Environment template exists

The project SHALL include a .env.example file documenting all required environment variables, including the PROFILE variable and instructions for local OpenEMR setup.

#### Scenario: Developer sets up environment

- **WHEN** a developer copies .env.example to .env
- **THEN** they see all required variables with descriptions
- **AND** DATABASE_URL has a working default for local Docker Compose
- **AND** PROFILE is documented with valid options (mrs, emr)

#### Scenario: EMR profile points to local OpenEMR

- **WHEN** a developer uses `PROFILE=emr`
- **THEN** `config/profiles/emr.env` points to `https://localhost:9300` for OPENEMR_URL
- **AND** includes placeholder for OPENEMR_CLIENT_ID and OPENEMR_CLIENT_SECRET
- **AND** documents that local OpenEMR must be running via `../openemr-local/`
