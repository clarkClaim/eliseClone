## Context

The VAPI assistant system uses a template-based configuration architecture where office configs inherit from `_base_assistant.json` and apply variable substitutions + overrides. Currently we have:

- **Production assistants**: `maple-grove.json` (MRS profile, 11Labs Sarah), `evergreen.json` (EMR profile, Deepgram Asteria)
- **Experimental assistants**: `unified-tools.json` (single manage_appointment tool), `claude-multitools.json` (Claude Sonnet 4 model)
- **6 individual tools**: identify_patient, book_appointment, cancel_appointment, reschedule_appointment, save_new_patient, get_availability
- **1 unified tool**: manage_appointment (combines book/cancel/reschedule)

Testing is done by assigning different assistants to phone numbers via `vapi:assign` and reviewing transcripts with `vapi:logs --last`.

## Goals / Non-Goals

**Goals:**
- Create test assistant variants that isolate specific variables (model, voice, tool approach)
- Enable systematic A/B testing to determine optimal configuration
- Maintain clear naming conventions so test assistants are easily identifiable
- All test assistants use the same backend tools (no code changes required)

**Non-Goals:**
- Modifying production assistants (evergreen.json, maple-grove.json)
- Creating new tool implementations
- Automated testing infrastructure (manual testing via phone calls)
- Performance metrics collection (qualitative assessment via transcripts)

## Decisions

### 1. Test Assistant Naming Convention

**Decision**: Use `test-<variable>-<value>.json` pattern with "Test" in assistant name.

**Rationale**: Clear identification of what's being tested. Examples:
- `test-model-claude.json` → "Elise - Test Model Claude"
- `test-voice-jessica.json` → "Elise - Test Voice Jessica"
- `test-tools-unified.json` → "Elise - Test Tools Unified"

**Alternative considered**: Numeric suffixes (test-1, test-2) - rejected because they don't convey what's being tested.

### 2. Test Matrix Structure

**Decision**: Create 10 test variants organized by hypothesis:

| Config | Tests | Model | Voice | Tools | Expected Latency |
|--------|-------|-------|-------|-------|------------------|
| `test-model-gpt4o.json` | Baseline | openai/gpt-4o | Deepgram asteria | Multi (6) | ~400ms |
| `test-groq-maverick.json` | **Speed king** | groq/llama-4-maverick-17b-128e-instruct | Deepgram asteria | Multi (6) | ~200ms |
| `test-groq-llama3.json` | Speed + capability | groq/llama-3.3-70b-versatile | Deepgram asteria | Multi (6) | ~250ms |
| `test-claude-haiku.json` | Fast + smart | anthropic/claude-3-5-haiku-20241022 | Deepgram asteria | Multi (6) | ~700ms |
| `test-claude-sonnet.json` | Best instructions | anthropic/claude-3-5-sonnet-20241022 | Deepgram asteria | Multi (6) | ~970ms |
| `test-gemini-flash.json` | Google option | google/gemini-2.0-flash | Deepgram asteria | Multi (6) | ~400ms |
| `test-voice-jessica.json` | Warmth | openai/gpt-4o | 11Labs Jessica | Multi (6) | ~500ms |
| `test-voice-orion.json` | Male voice | openai/gpt-4o | Deepgram orion | Multi (6) | ~400ms |
| `test-tools-unified.json` | Tool consolidation | openai/gpt-4o | Deepgram asteria | Unified (1) | ~400ms |
| `test-ultra-fast.json` | **Minimum latency** | groq/llama-4-maverick-17b-128e-instruct | Deepgram luna | Multi (6) | ~200ms |

**Rationale**: Focus on model comparison first (biggest latency impact), with Groq models as potential game-changers. Claude 3.5 Haiku offers best balance of speed + instruction-following. Reduced voice variants to focus on the key tests.

### 3. Profile Assignment

**Decision**: All test assistants use `mrs` profile (Maple Grove Medical context).

**Rationale**: Consistent backend for fair comparison. The MRS profile has the test patient data and phone number available.

### 4. Voice Provider Settings

**Decision**: Use optimized settings per provider:

**11Labs voices** (Jessica, Sarah):
```json
{
  "provider": "11labs",
  "voiceId": "<voice-id>",
  "stability": 0.45,
  "similarityBoost": 0.75
}
```

**Deepgram voices** (asteria, orion, luna):
```json
{
  "provider": "deepgram",
  "voiceId": "<voice-name>"
}
```

**Rationale**: Lower stability (0.45) for 11Labs increases expressiveness/warmth. Deepgram voices don't need tuning parameters.

### 5. Tool Filter Configuration

**Decision**: Use `toolFilter` array to control which tools are available:

- **Multi-tool configs**: `["identify_patient", "book_appointment", "cancel_appointment", "reschedule_appointment", "save_new_patient", "get_availability"]`
- **Unified-tool config**: `["identify_patient", "save_new_patient", "manage_appointment", "get_availability"]`

**Rationale**: Same backend, different tool exposure. The unified approach tests whether fewer tools with an `action` parameter improves LLM tool selection accuracy.

## Risks / Trade-offs

**[Risk] Too many test variants create confusion**
→ Mitigation: Clear naming convention and documented test matrix. Delete unused variants after testing.

**[Risk] VAPI account clutter with many assistants**
→ Mitigation: Use `vapi:delete` to clean up after testing is complete. Only keep winners.

**[Risk] 11Labs voices have higher latency than Deepgram**
→ Trade-off accepted: Testing warmth vs speed. Document latency observations in test notes.

**[Risk] gpt-4o-mini may not follow complex instructions**
→ Mitigation: Test with real scenarios. If it fails on multi-step tasks, document and move on.

**[Risk] Unified tool may confuse LLM with action enum**
→ Mitigation: Already have `manage_appointment` tool defined - just need to test it. Compare error rates in transcripts.
