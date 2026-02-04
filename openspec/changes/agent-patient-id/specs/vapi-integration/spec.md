# vapi-integration Specification

## Purpose

VAPI webhook handlers for voice calls including assistant configuration, tool-call handling, and conversation tracking.

## ADDED Requirements

### Requirement: Express HTTP server with VAPI webhook endpoint

The system SHALL have an Express HTTP server that handles VAPI webhook requests.

#### Scenario: Server starts and listens on configured port

- **WHEN** the application starts
- **THEN** an Express server listens on the port from `PORT` environment variable (default 3000)
- **AND** the server logs startup message

#### Scenario: VAPI tool-calls endpoint exists

- **WHEN** VAPI sends a POST request to `/vapi/tools`
- **THEN** the server accepts the request with JSON body
- **AND** routes to the tool-call handler

#### Scenario: Health endpoint exists

- **WHEN** a GET request is made to `/health`
- **THEN** the server returns 200 OK with status information

---

### Requirement: Assistant configuration is stored in git

The VAPI assistant configuration SHALL be defined in a JSON file that is version controlled.

#### Scenario: Config file exists

- **WHEN** checking the repository
- **THEN** `config/vapi-assistant.json` exists
- **AND** contains valid VAPI assistant configuration

#### Scenario: Config includes system prompt

- **WHEN** reading the assistant config
- **THEN** a system prompt is defined that instructs the assistant to identify patients
- **AND** the prompt asks for phone number and date of birth

#### Scenario: Config includes identify_patient tool

- **WHEN** reading the assistant config
- **THEN** a tool named `identify_patient` is defined
- **AND** the tool has required parameters for `phone` and `dob`
- **AND** the tool has an optional `name` parameter for fallback lookup
- **AND** the tool's server URL uses a placeholder for the actual server URL

---

### Requirement: Setup script creates or updates VAPI assistant

A setup script SHALL create or update the VAPI assistant from the config file.

#### Scenario: Script creates new assistant

- **WHEN** running `pnpm run setup:vapi` with no existing assistant
- **THEN** the script reads `config/vapi-assistant.json`
- **AND** interpolates environment variables (e.g., `{{SERVER_URL}}`)
- **AND** creates a new assistant via VAPI API
- **AND** outputs the assistant ID

#### Scenario: Script updates existing assistant

- **WHEN** running `pnpm run setup:vapi` with `VAPI_ASSISTANT_ID` set
- **THEN** the script updates the existing assistant with current config
- **AND** preserves the assistant ID

#### Scenario: Script requires VAPI_API_KEY

- **WHEN** running `pnpm run setup:vapi` without `VAPI_API_KEY`
- **THEN** the script exits with an error message about missing API key

---

### Requirement: Tool-call handler responds in VAPI format

The tool-call endpoint SHALL respond with the format VAPI expects.

#### Scenario: Valid tool-call receives response

- **WHEN** VAPI posts a tool-call request with `toolCallId` and function arguments
- **THEN** the server responds with JSON containing `results` array
- **AND** each result has `toolCallId` and `result` fields

#### Scenario: Unknown tool returns error

- **WHEN** VAPI requests a tool that doesn't exist
- **THEN** the server responds with an error result
- **AND** the error message indicates unknown tool

---

### Requirement: Conversation is tracked in database

The system SHALL create and update Conversation records for voice calls.

#### Scenario: Conversation created on call start

- **WHEN** the first tool-call arrives for a new VAPI call ID
- **THEN** a Conversation record is created
- **AND** `externalId` is set to the VAPI call ID
- **AND** `channel` is set to "voice"
- **AND** `callerPhone` is set from call metadata if available

#### Scenario: Conversation updated after patient identified

- **WHEN** a patient is successfully identified
- **THEN** the Conversation record is updated
- **AND** `patientId` is set to the identified patient's ID

---

### Requirement: Environment variables are documented

Required environment variables for VAPI integration SHALL be documented.

#### Scenario: env.example includes VAPI variables

- **WHEN** checking `.env.example`
- **THEN** it includes `VAPI_API_KEY` with description
- **AND** it includes `VAPI_ASSISTANT_ID` with description
- **AND** it includes `SERVER_URL` for webhook configuration
