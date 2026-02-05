## ADDED Requirements

### Requirement: Test assistant naming convention

Test assistant configuration files SHALL follow the naming pattern `test-<variable>-<value>.json` where `<variable>` indicates what is being tested (model, voice, tools, latency) and `<value>` identifies the specific variant.

The assistant name in the configuration SHALL include "Test" to clearly distinguish from production assistants.

#### Scenario: Model variant naming
- **WHEN** creating a test assistant to compare Claude model
- **THEN** the file is named `test-model-claude.json` and the assistant name is "Elise - Test Model Claude"

#### Scenario: Voice variant naming
- **WHEN** creating a test assistant to compare Jessica voice
- **THEN** the file is named `test-voice-jessica.json` and the assistant name is "Elise - Test Voice Jessica"

### Requirement: Test assistant configuration structure

Each test assistant configuration file SHALL include the following fields:
- `_comment`: Description of what this variant tests
- `profile`: The backend profile to use (typically "mrs")
- `template`: Variable substitutions including ASSISTANT_NAME with "Test" in the name
- `overrides`: Configuration overrides for model, voice, or delays

#### Scenario: Complete configuration structure
- **WHEN** a test assistant config is created
- **THEN** it contains `_comment`, `profile`, `template`, and `overrides` fields

#### Scenario: Template variables
- **WHEN** a test assistant config defines template variables
- **THEN** ASSISTANT_NAME contains "Test" and OFFICE_NAME matches the profile's office

### Requirement: Model variant configurations

Model test variants SHALL isolate the LLM model as the only changed variable from baseline. The following model variants SHALL be created:
- `test-model-gpt4o.json`: gpt-4o (baseline)
- `test-model-gpt4o-mini.json`: gpt-4o-mini (speed/cost)
- `test-model-claude.json`: claude-sonnet-4-20250514 (instruction-following)

#### Scenario: GPT-4o baseline
- **WHEN** deploying test-model-gpt4o.json
- **THEN** the assistant uses gpt-4o model with Deepgram asteria voice and multi-tool configuration

#### Scenario: GPT-4o-mini variant
- **WHEN** deploying test-model-gpt4o-mini.json
- **THEN** the assistant uses gpt-4o-mini model with identical voice and tools to baseline

#### Scenario: Claude variant
- **WHEN** deploying test-model-claude.json
- **THEN** the assistant uses claude-sonnet-4-20250514 model with identical voice and tools to baseline

### Requirement: Voice variant configurations

Voice test variants SHALL isolate the voice provider/voice as the only changed variable from baseline. The following voice variants SHALL be created:
- `test-voice-jessica.json`: 11Labs Jessica Anne (warm, expressive)
- `test-voice-sarah.json`: 11Labs Sarah (professional)
- `test-voice-orion.json`: Deepgram Orion (male voice option)

#### Scenario: Jessica voice variant
- **WHEN** deploying test-voice-jessica.json
- **THEN** the assistant uses 11Labs provider with voiceId "g6xIsTj2HwM6VR4iXFCw", stability 0.45, and similarityBoost 0.75

#### Scenario: Sarah voice variant
- **WHEN** deploying test-voice-sarah.json
- **THEN** the assistant uses 11Labs provider with voiceId "EXAVITQu4vr4xnSDxMaL", stability 0.45, and similarityBoost 0.75

#### Scenario: Orion voice variant
- **WHEN** deploying test-voice-orion.json
- **THEN** the assistant uses Deepgram provider with voiceId "orion"

### Requirement: Tool consolidation variant

A tool consolidation test variant SHALL be created to compare the unified manage_appointment tool approach against the multi-tool approach.

The variant SHALL use `toolFilter` to expose only: identify_patient, save_new_patient, manage_appointment, get_availability.

#### Scenario: Unified tools configuration
- **WHEN** deploying test-tools-unified.json
- **THEN** the assistant has access to 4 tools instead of 6, using manage_appointment for booking, canceling, and rescheduling

#### Scenario: Multi-tool baseline comparison
- **WHEN** comparing unified vs multi-tool approaches
- **THEN** baseline configs expose all 6 individual tools (identify_patient, book_appointment, cancel_appointment, reschedule_appointment, save_new_patient, get_availability)

### Requirement: Latency-optimized variant

A latency-optimized test variant SHALL be created combining the fastest options:
- gpt-4o-mini model (faster inference)
- Deepgram luna voice (fast TTS)
- Reduced responseDelaySeconds (0.2)
- Reduced llmRequestDelaySeconds (0.1)

#### Scenario: Latency optimization settings
- **WHEN** deploying test-latency-optimized.json
- **THEN** the assistant uses gpt-4o-mini, Deepgram luna, responseDelaySeconds 0.2, and llmRequestDelaySeconds 0.1

### Requirement: Test assistant deployment

All test assistant configurations SHALL be deployable via `pnpm run vapi:setup` without modification to the setup script.

Test assistants SHALL be assignable to phone numbers via `pnpm run vapi:assign "<assistant-name>" <phone>`.

#### Scenario: Deploy all test assistants
- **WHEN** running `pnpm run vapi:setup`
- **THEN** all test assistant configs in config/assistants/test-*.json are deployed to VAPI

#### Scenario: Assign test assistant to phone
- **WHEN** running `pnpm run vapi:assign "Elise - Test Voice Jessica" OpenMRS`
- **THEN** the OpenMRS phone number is assigned to the Jessica voice test assistant

### Requirement: Test assistant profile consistency

All test assistant configurations SHALL use the same profile ("mrs") to ensure consistent backend behavior during comparison testing.

#### Scenario: Consistent profile usage
- **WHEN** any test assistant config is loaded
- **THEN** the profile field is set to "mrs"

#### Scenario: Backend tool availability
- **WHEN** a test assistant makes a tool call
- **THEN** the request routes to the same backend server regardless of which test variant is active
