# openmrs-docker-setup Specification

## Purpose

Docker Compose configuration for running OpenMRS 3 locally with all required services.

## Requirements

### Requirement: Docker Compose runs OpenMRS 3 stack

The repository SHALL contain a `docker-compose.yml` that defines all services needed to run OpenMRS 3: gateway (nginx proxy), frontend (O3 SPA), backend (OpenMRS server), and database (MariaDB).

#### Scenario: Local startup with docker compose
- **WHEN** user runs `docker compose up -d` in the repository root
- **THEN** all four services start and become healthy within 5 minutes

#### Scenario: OpenMRS UI accessible
- **WHEN** all services are running
- **THEN** navigating to `http://localhost/openmrs` displays the OpenMRS 3 login page

### Requirement: Services use official OpenMRS images

The docker-compose.yml SHALL use official `openmrs/openmrs-reference-application-3-*` images for gateway, frontend, and backend services, with a configurable version tag.

#### Scenario: Version tag configuration
- **WHEN** user sets `TAG=3.0.0` environment variable before running docker compose
- **THEN** all OpenMRS services use the `3.0.0` tagged images

### Requirement: Database uses MariaDB

The docker-compose.yml SHALL use `mariadb:10.11` or compatible version for the database service.

#### Scenario: Database service starts
- **WHEN** docker compose starts
- **THEN** MariaDB container initializes with `openmrs` database and appropriate charset (utf8mb4)

### Requirement: Inter-service networking

All services SHALL be on the same Docker network so they can communicate using service names as hostnames.

#### Scenario: Backend connects to database
- **WHEN** backend service starts
- **THEN** it successfully connects to `db:3306` using configured credentials
