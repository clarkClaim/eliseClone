# VAPI Best Practices

Learnings from building the Elise voice assistant.

## Tool Configuration

### Messages

Tools can have custom messages for different states:

```json
"messages": [
  { "type": "request-start", "content": "" },
  { "type": "request-failed", "content": "I'm having trouble with that." }
]
```

| Message Type | Purpose | Recommendation |
|--------------|---------|----------------|
| `request-start` | Spoken when tool begins | Set to `""` to silence filler ("just a sec") |
| `request-complete` | Spoken after tool succeeds | **Don't override** - let LLM respond naturally |
| `request-failed` | Spoken when tool errors | Keep a helpful fallback message |
| `request-response-delayed` | Spoken if tool is slow | Usually not needed |

**Critical**: Setting `request-complete: ""` silences the LLM response entirely. Only override `request-start` to remove filler.

### Passing Caller Information

**Don't** tell the LLM to use "caller ID" or "call metadata" - it may pass literal strings like `"phone": "caller_id"`.

**Do** either:
1. Use VAPI's dynamic variables: `{{customer.number}}`
2. Inject server-side (our approach) - remove phone from required params, inject in webhook handler

Our approach in `src/agent/tools/index.ts`:
```typescript
const TOOLS_NEEDING_CALLER_PHONE = ['identify_patient', 'save_new_patient'];

// In handler:
if (TOOLS_NEEDING_CALLER_PHONE.includes(fn.name) && callerPhone) {
  args.phone = callerPhone; // Always override with real caller ID
}
```

### Tool Schema Design

- Keep parameters minimal - don't require what the system can inject
- Use clear descriptions - the LLM reads these
- Match tool names exactly in system prompts

## System Prompts

### Keep It Simple

Less is more. The LLM follows instructions better when they're concise:

```
You are Elise, a friendly healthcare scheduling assistant.

To identify patients:
1. Ask for their date of birth
2. Call identify_patient with just the dob (the system automatically knows their phone)
3. Based on result:
   - 'existing': Greet by name, ask how to help
   - 'not_found_try_name': Ask for full name, call again with name
   - 'new': Offer to register as new patient

Style: Warm, concise (1-2 sentences), natural.
```

### Don't Over-Instruct

Avoid long lists of "NEVER do X" - they often backfire. Fix the root cause instead (e.g., tool messages, not prompt hacks).

## Voice Settings

### ElevenLabs

| Parameter | Range | Recommendation |
|-----------|-------|----------------|
| `stability` | 0.0-1.0 | 0.40-0.55 for warm/expressive |
| `similarityBoost` | 0.0-1.0 | ~0.75 for clarity |

Lower stability = more expressive but less consistent.

### Deepgram

Simple voice IDs: `asteria`, `luna`, `orion`, etc. (not `aura-asteria-en`)

Good for low latency - no stability/similarity settings needed.

## Latency Optimization

### Target Metrics
- P50: < 500ms (users notice delays around 300ms)
- P95: < 800ms

### Quick Wins

| Setting | Purpose |
|---------|---------|
| `responseDelaySeconds: 0.3-0.5` | Slight delay prevents cutting off caller |
| `llmRequestDelaySeconds: 0.1-0.2` | Batches rapid inputs |
| Deepgram transcriber | Faster than alternatives |
| GPT-4o-mini | Faster than GPT-4o, good for simple flows |

### Transcriber

```json
"transcriber": {
  "provider": "deepgram",
  "model": "nova-2",
  "language": "en"
}
```

## Assistant Variants

Create multiple configs in `config/assistants/` for A/B testing:

| Variant | Use Case |
|---------|----------|
| `elise-jessica.json` | Warm, healthcare-focused (ElevenLabs) |
| `elise-asteria.json` | Fast, low-latency (Deepgram + GPT-4o-mini) |
| `elise-orion.json` | Male voice option |

Switch with: `pnpm run vapi:assign jessica`

## Common Pitfalls

1. **Filler phrases**: Fix with `request-start: ""` on tools, not prompt instructions
2. **Silence after tool**: Don't set `request-complete: ""`
3. **LLM passing literal strings**: Don't mention "caller ID" in prompts
4. **Over-engineering prompts**: Keep them short and direct

## Resources

- [VAPI Custom Tools](https://docs.vapi.ai/tools/custom-tools)
- [VAPI Dynamic Variables](https://docs.vapi.ai/assistants/dynamic-variables)
- [Speech Latency Guide](https://vapi.ai/blog/speech-latency)
