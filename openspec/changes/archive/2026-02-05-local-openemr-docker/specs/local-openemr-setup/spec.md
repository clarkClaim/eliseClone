# local-openemr-setup Specification

## Purpose

Docker Compose configuration for running OpenEMR locally with full API access and demo data, located in a sibling directory to the main project.

## ADDED Requirements

### Requirement: OpenEMR Docker Compose setup exists

A directory `../openemr-local/` (sibling to ehsClone) SHALL contain a Docker Compose configuration for running OpenEMR locally.

#### Scenario: Developer clones and starts OpenEMR

- **WHEN** a developer runs `docker compose up -d` in `../openemr-local/`
- **THEN** OpenEMR starts with MariaDB
- **AND** OpenEMR is accessible at http://localhost:8300 and https://localhost:9300
- **AND** admin can log in with credentials `admin`/`pass`

---

### Requirement: API access is pre-configured

OpenEMR SHALL start with REST API, FHIR API, and OAuth password grant enabled via environment variables.

#### Scenario: OAuth password grant works

- **WHEN** a client registers via `/oauth2/default/registration`
- **AND** requests a token with `grant_type=password` and `user_role=users`
- **THEN** OpenEMR returns a valid access token with requested scopes

#### Scenario: REST API endpoints are accessible

- **WHEN** authenticated with a valid token
- **THEN** `/apis/default/api/patient` returns patient data
- **AND** `/apis/default/api/facility` returns facility data
- **AND** `/apis/default/api/appointment` returns appointment data

#### Scenario: FHIR API endpoints are accessible

- **WHEN** authenticated with a valid token including `api:fhir` scope
- **THEN** `/apis/default/fhir/Patient` returns FHIR patient bundle
- **AND** `/apis/default/fhir/Practitioner` returns FHIR practitioner bundle

---

### Requirement: Demo data is loaded

OpenEMR SHALL be initialized with demo data including patients, providers, appointments, and facilities.

#### Scenario: Demo patients exist

- **WHEN** querying the patient API
- **THEN** multiple sample patients are returned with realistic data

#### Scenario: Demo providers exist

- **WHEN** querying the practitioner API
- **THEN** at least one provider is returned

#### Scenario: Demo credentials work

- **WHEN** logging into OpenEMR web UI
- **THEN** `admin`/`pass` works
- **AND** `physician`/`physician` works
- **AND** `clinician`/`clinician` works

---

### Requirement: Helper scripts exist

The setup SHALL include scripts to simplify common operations.

#### Scenario: Start script

- **WHEN** developer runs `./start.sh` (or equivalent npm script)
- **THEN** Docker Compose starts in detached mode

#### Scenario: Stop script

- **WHEN** developer runs `./stop.sh`
- **THEN** Docker Compose stops containers

#### Scenario: Reset script

- **WHEN** developer runs `./reset.sh`
- **THEN** Docker volumes are removed
- **AND** OpenEMR is restarted fresh
- **AND** demo data is reloaded

---

### Requirement: README documents usage

The `../openemr-local/` directory SHALL include a README with setup instructions.

#### Scenario: Developer finds documentation

- **WHEN** developer opens `../openemr-local/README.md`
- **THEN** they find prerequisites (Docker)
- **AND** quick start instructions
- **AND** API endpoint documentation
- **AND** credentials for demo users
- **AND** instructions for resetting data
