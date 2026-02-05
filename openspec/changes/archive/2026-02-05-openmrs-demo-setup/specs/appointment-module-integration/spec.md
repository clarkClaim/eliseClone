## ADDED Requirements

### Requirement: Custom backend Dockerfile with appointment modules

The repository SHALL contain a `Dockerfile` that extends the official OpenMRS backend image and adds the appointment scheduling modules.

#### Scenario: Dockerfile builds successfully
- **WHEN** user runs `docker build -t openmrs-backend-custom .`
- **THEN** the image builds without errors, including the appointment modules

### Requirement: Appointment scheduling module included

The custom backend image SHALL include the `appointmentscheduling` OMOD file in `/openmrs/modules/`.

#### Scenario: Module loads on startup
- **WHEN** the backend container starts
- **THEN** the appointment scheduling module appears in Administration > Manage Modules as "Started"

#### Scenario: REST API available
- **WHEN** backend is running with the module
- **THEN** `GET /openmrs/ws/rest/v1/appointmentscheduling/appointmenttype` returns a valid response (not 404)

### Requirement: Appointment scheduling UI module included

The custom backend image SHALL include the `appointmentschedulingui` OMOD file in `/openmrs/modules/`.

#### Scenario: UI module loads
- **WHEN** the backend container starts
- **THEN** the appointment scheduling UI module appears in Administration > Manage Modules as "Started"

### Requirement: Module files stored in repository

The repository SHALL contain the `.omod` files in a `modules/` directory, with a README noting their source and version.

#### Scenario: Modules directory exists
- **WHEN** user clones the repository
- **THEN** `modules/` directory contains at least two `.omod` files (appointmentscheduling and appointmentschedulingui)

### Requirement: Docker compose uses custom backend

The `docker-compose.yml` SHALL build the backend service from the local Dockerfile instead of using the pre-built image directly.

#### Scenario: Custom image used
- **WHEN** user runs `docker compose up --build`
- **THEN** the backend service uses the locally-built image with appointment modules
