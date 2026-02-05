## Why

We need to determine the optimal combination of LLM model, voice provider/voice, and transcription settings for the VAPI assistant. Currently we have production assistants using `gpt-4o` with 11Labs/Deepgram voices, but haven't systematically tested alternatives. Creating multiple test assistants allows A/B comparison to find the best user experience (warmth, latency, instruction-following) while also exploring whether consolidating our 6 tools into fewer unified tools improves reliability.

## What Changes

- Create 6-8 new test assistant configurations (clearly marked with "Test" in names)
- Each variant tests a specific hypothesis:
  - **Model comparison**: gpt-4o vs gpt-4o-mini vs claude-sonnet-4
  - **Voice warmth**: Jessica Anne (warm) vs Sarah (professional) vs Deepgram Asteria (fast)
  - **Latency optimization**: Deepgram voices + reduced delays vs 11Labs expressiveness
  - **Tool consolidation**: Compare multi-tool (6 tools) vs unified `manage_appointment` approach
- All test assistants share the same backend/tools - only configuration varies
- Test assistants can be assigned to phone numbers for live testing via `vapi:assign`

## Capabilities

### New Capabilities

- `test-assistant-configs`: Configuration files for test assistant variants, including model/voice/tool combinations and naming conventions

### Modified Capabilities

None - this change adds test configurations without modifying existing specs or production assistants.

## Impact

- **Config files**: New JSON files in `config/assistants/` (test-*.json pattern)
- **VAPI account**: New assistants created via `vapi:setup`
- **Phone numbers**: Test assistants can be assigned to existing phone numbers for A/B testing
- **No code changes**: All variants use existing tool implementations
- **No production impact**: Production assistants (evergreen.json, maple-grove.json) unchanged
