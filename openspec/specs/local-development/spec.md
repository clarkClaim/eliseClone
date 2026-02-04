# local-development Specification

## Purpose

Docker Compose configuration and environment setup for local development.

## ADDED Requirements

### Requirement: Docker Compose provides PostgreSQL

The project SHALL include a docker-compose.yml that runs PostgreSQL for local development.

#### Scenario: Developer starts local database

- **WHEN** a developer runs `docker compose up -d`
- **THEN** a PostgreSQL container starts
- **AND** it is accessible on localhost:5432

#### Scenario: Database data persists

- **WHEN** a developer restarts Docker Compose
- **THEN** database data is preserved via a named volume

---

### Requirement: Environment template exists

The project SHALL include a .env.example file documenting all required environment variables.

#### Scenario: Developer sets up environment

- **WHEN** a developer copies .env.example to .env
- **THEN** they see all required variables with descriptions
- **AND** DATABASE_URL has a working default for local Docker Compose

---

### Requirement: Environment includes all documented variables

The .env.example SHALL include variables for database, VAPI, and OpenMRS as documented in README.

#### Scenario: All integration variables documented

- **WHEN** a developer reviews .env.example
- **THEN** they find DATABASE_URL, VAPI_API_KEY, VAPI_ASSISTANT_ID
- **AND** they find OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD
- **AND** they find optional SYNC_INTERVAL_MS and PORT

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
