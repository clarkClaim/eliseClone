# local-development Specification

## Purpose

Docker Compose configuration and environment setup for local development.

## ADDED Requirements

### Requirement: Docker Compose provides PostgreSQL

The project SHALL include a docker-compose.yml that runs PostgreSQL for local development, with profile-aware container naming for isolation.

#### Scenario: Developer starts local database

- **WHEN** a developer runs `docker compose up -d` with `PROFILE=mrs`
- **THEN** a PostgreSQL container named `elise-postgres-mrs` starts
- **AND** it is accessible on the port defined by `DB_PORT` (default 5432)

#### Scenario: Database data persists per profile

- **WHEN** a developer restarts Docker Compose
- **THEN** database data is preserved via a profile-specific named volume (`elise_data_${PROFILE}`)

#### Scenario: Multiple profiles can run simultaneously

- **WHEN** running Docker Compose with `PROFILE=mrs` in one clone
- **AND** running Docker Compose with `PROFILE=emr` in another clone
- **THEN** both databases run without conflict (different container names, ports, volumes)

---

### Requirement: Environment template exists

The project SHALL include a .env.example file documenting all required environment variables, including the PROFILE variable.

#### Scenario: Developer sets up environment

- **WHEN** a developer copies .env.example to .env
- **THEN** they see all required variables with descriptions
- **AND** DATABASE_URL has a working default for local Docker Compose
- **AND** PROFILE is documented with valid options (mrs, emr)

---

### Requirement: Environment includes all documented variables

The .env.example SHALL include variables for database, VAPI, PROFILE, and MRS as documented in README.

#### Scenario: All integration variables documented

- **WHEN** a developer reviews .env.example
- **THEN** they find PROFILE with description of valid values
- **AND** they find DATABASE_URL, VAPI_API_KEY, VAPI_ASSISTANT_ID
- **AND** profile-specific variables are documented in config/profiles/*.env

---

### Requirement: Development server runs with hot reload

The project SHALL support running TypeScript directly in development with file watching.

#### Scenario: Developer starts dev server

- **WHEN** a developer runs `npm run dev`
- **THEN** the server starts without a build step
- **AND** changes to .ts files trigger automatic restart

---

### Requirement: Gitignore excludes appropriate files

The project SHALL have a .gitignore that excludes node_modules, dist, .env, and other generated files.

#### Scenario: Sensitive files not committed

- **WHEN** a developer runs `git status` after setup
- **THEN** node_modules/, dist/, and .env are not shown as untracked
