## ADDED Requirements

### Requirement: PROFILE env var selects configuration

The system SHALL use a `PROFILE` environment variable to select which MRS configuration to use.

#### Scenario: Profile determines MRS settings

- **WHEN** `PROFILE=mrs` is set in `.env`
- **THEN** the server loads `config/profiles/mrs.env`
- **AND** connects to OpenMRS with settings from that file

#### Scenario: EMR profile selects OpenEMR

- **WHEN** `PROFILE=emr` is set in `.env`
- **THEN** the server loads `config/profiles/emr.env`
- **AND** connects to OpenEMR with settings from that file

#### Scenario: Missing profile fails fast

- **WHEN** `PROFILE` is not set or empty
- **THEN** the server exits with an error message indicating PROFILE is required

---

### Requirement: Profile configs are committed to git

The system SHALL store MRS-specific configuration in `config/profiles/*.env` files that are safe to commit.

#### Scenario: MRS profile config exists

- **WHEN** a developer clones the repository
- **THEN** `config/profiles/mrs.env` exists with PORT, DB_PORT, OPENMRS_URL, NGROK_DOMAIN

#### Scenario: EMR profile config exists

- **WHEN** a developer clones the repository
- **THEN** `config/profiles/emr.env` exists with PORT, DB_PORT, OPENEMR_URL, NGROK_DOMAIN

#### Scenario: Profile configs contain no secrets

- **WHEN** reviewing profile config files
- **THEN** they contain only public configuration (URLs, ports, domains)
- **AND** they do NOT contain API keys, passwords, or credentials

---

### Requirement: Server loads layered environment files

The server SHALL load both `.env` (secrets) and `config/profiles/${PROFILE}.env` (profile config) at startup.

#### Scenario: Both env files are loaded

- **WHEN** the server starts with `PROFILE=mrs`
- **THEN** it loads `.env` first (secrets like VAPI_API_KEY)
- **AND** it loads `config/profiles/mrs.env` second (PORT, DB_PORT, etc.)

#### Scenario: Profile config can override base values

- **WHEN** a variable appears in both `.env` and the profile config
- **THEN** the profile config value takes precedence

---

### Requirement: Ngrok script reads profile config

The ngrok tunnel script SHALL read the domain from the active profile's configuration.

#### Scenario: Tunnel uses profile-specific domain

- **WHEN** `pnpm run tunnel` is executed with `PROFILE=mrs`
- **THEN** ngrok starts with the domain from `config/profiles/mrs.env`

#### Scenario: Different profiles use different domains

- **WHEN** `PROFILE=mrs` the tunnel uses the MRS ngrok domain
- **AND** when `PROFILE=emr` the tunnel uses the EMR ngrok domain

---

### Requirement: Port allocation is profile-specific

Each profile SHALL define its own server port and database port to enable simultaneous execution.

#### Scenario: MRS profile uses default ports

- **WHEN** `PROFILE=mrs`
- **THEN** server runs on PORT=3000
- **AND** database is on DB_PORT=5432

#### Scenario: EMR profile uses alternate ports

- **WHEN** `PROFILE=emr`
- **THEN** server runs on PORT=3001
- **AND** database is on DB_PORT=5433

#### Scenario: No port conflicts between profiles

- **WHEN** running both `mrs` and `emr` profiles simultaneously (in separate repo clones)
- **THEN** there are no port conflicts
