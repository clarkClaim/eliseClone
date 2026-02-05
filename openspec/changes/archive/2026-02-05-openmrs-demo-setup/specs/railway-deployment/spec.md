## ADDED Requirements

### Requirement: Railway-compatible configuration

The repository SHALL be deployable to Railway without modifications, using Railway's docker-compose detection.

#### Scenario: Railway deployment
- **WHEN** user runs `railway up` in the repository root
- **THEN** Railway detects the docker-compose.yml and deploys all services

### Requirement: Public URL accessible

After deployment, the OpenMRS instance SHALL be accessible via a public Railway URL.

#### Scenario: Public access
- **WHEN** Railway deployment completes
- **THEN** navigating to `https://<app-name>.up.railway.app/openmrs` displays the OpenMRS login page

### Requirement: README with deployment instructions

The repository SHALL contain a README.md with:
- Prerequisites (Railway CLI, Docker)
- Local development instructions
- Railway deployment steps
- Default credentials
- How to verify the deployment worked

#### Scenario: User follows README to deploy
- **WHEN** a new user follows the README instructions
- **THEN** they can successfully deploy OpenMRS to Railway within 30 minutes

### Requirement: Environment variables documented

The README SHALL document any environment variables that can be configured (e.g., OpenMRS version tag, database credentials).

#### Scenario: Custom configuration
- **WHEN** user wants to change the OpenMRS version
- **THEN** README explains how to set the `TAG` environment variable
