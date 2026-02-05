# vapi-management Specification

## Purpose

Management tools and configuration patterns for VAPI voice assistants, including multiple assistant variants, caller ID integration, new patient registration, and operational scripts.

## ADDED Requirements

### Requirement: New patient registration tool

The system SHALL provide a `save_new_patient` tool for registering callers as new patients.

#### Scenario: New patient registered successfully

- **WHEN** the assistant calls `save_new_patient` with name and dob
- **THEN** a new patient record is created
- **AND** the caller's phone (from caller ID) is added to the patient
- **AND** the response includes `{ success: true, patient: { id, name } }`

#### Scenario: Phone already registered

- **WHEN** the caller's phone is already associated with a patient
- **THEN** the tool returns `{ success: false }`
- **AND** the message indicates the phone is already registered

---

### Requirement: Caller ID is injected server-side

The system SHALL automatically inject the caller's phone number from VAPI call metadata, not rely on LLM to pass it.

#### Scenario: Tool receives caller phone automatically

- **WHEN** VAPI calls a tool that needs the caller's phone
- **THEN** the server extracts `call.customer.number` from the request
- **AND** injects it into the tool arguments before processing

#### Scenario: Phone parameter is optional in tool schema

- **WHEN** defining tool schemas for VAPI
- **THEN** `phone` is NOT a required parameter
- **AND** the system prompt does NOT mention "caller ID" (prevents LLM confusion)

---

### Requirement: Multiple assistant variants for A/B testing

The system SHALL support multiple VAPI assistant configurations with different voices and models.

#### Scenario: Assistant configs stored in config/assistants/

- **WHEN** checking the repository
- **THEN** `config/assistants/*.json` contains multiple assistant configurations
- **AND** each has a unique name, voice, and potentially different model

#### Scenario: Setup script creates all assistants

- **WHEN** running `pnpm run vapi:setup`
- **THEN** all assistants from `config/assistants/` are created or updated in VAPI
- **AND** each receives the same tool IDs

---

### Requirement: VAPI management scripts

The system SHALL provide CLI scripts for managing VAPI resources.

#### Scenario: List assistants and phone numbers

- **WHEN** running `pnpm run vapi:list`
- **THEN** all assistants are displayed with ID, name, model, and voice
- **AND** all phone numbers are displayed with their assigned assistant

#### Scenario: Assign assistant to phone number

- **WHEN** running `pnpm run vapi:assign <assistant-name>`
- **THEN** the assistant is assigned to the default phone number
- **AND** fuzzy matching works (e.g., "jessica" matches "Elise (Jessica - Warm)")

#### Scenario: Delete assistant

- **WHEN** running `pnpm run vapi:delete <assistant-name>`
- **THEN** the assistant is removed from VAPI

---

### Requirement: Tool messages silence filler phrases

Tool configurations SHALL override default VAPI filler messages.

#### Scenario: No filler on tool start

- **WHEN** a tool is called
- **THEN** VAPI does not say "just a sec" or similar filler
- **AND** `request-start` message is set to empty string

#### Scenario: LLM responds naturally after tool

- **WHEN** a tool completes successfully
- **THEN** the LLM formulates a response based on the tool result
- **AND** `request-complete` is NOT overridden (left to LLM)

#### Scenario: Error messages are helpful

- **WHEN** a tool fails
- **THEN** a predefined `request-failed` message is spoken
- **AND** the message prompts the user to retry

---

### Requirement: Voice configuration options documented

The system SHALL document voice configuration options for different use cases.

#### Scenario: ElevenLabs voice settings

- **WHEN** configuring an ElevenLabs voice
- **THEN** `stability` (0.4-0.55) and `similarityBoost` (~0.75) are set
- **AND** lower stability creates more expressive speech

#### Scenario: Deepgram voices for low latency

- **WHEN** low latency is priority
- **THEN** Deepgram voices (e.g., `asteria`, `orion`) are recommended
- **AND** voice ID uses short form (not `aura-asteria-en`)

---

### Requirement: Transcriber configuration for accuracy

Assistant configurations SHALL include transcriber settings.

#### Scenario: Deepgram nova-2 for transcription

- **WHEN** checking assistant config
- **THEN** transcriber is set to Deepgram nova-2
- **AND** language is set to "en"
