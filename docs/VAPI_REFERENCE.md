# VAPI Reference

This document contains notes on how VAPI works, common patterns, and troubleshooting tips.

## Overview

VAPI is a voice AI platform that connects:
- **Transcription** (speech-to-text) via Deepgram
- **LLM** (conversation logic) via OpenAI gpt-4o
- **TTS** (text-to-speech) via Deepgram voices
- **Tools** (function calling) via webhooks to our server

## Architecture

```
Phone Call → VAPI → Transcriber → LLM → Tool Calls → Our Server
                                    ↓
                              TTS → Phone Call
```

## Key Concepts

### Tool Calling Behavior

**IMPORTANT**: The LLM (gpt-4o) can and will call multiple tools in parallel if it thinks it's being helpful. This is NOT controllable via VAPI configuration.

**Solutions for sequential tool behavior**:
1. **Design tools to return everything needed** - If Tool A returns all the data the LLM needs, it won't call Tool B
2. **Use `nextAction` hints** - Return a field that tells the LLM what to do next
3. **Prompt engineering** - Use CRITICAL/IMPORTANT markers, but LLMs may still ignore them
4. **Combine related data** - Instead of two tools, have one tool return combined data

**Example**: `identify_patient` returns both appointments AND suggested availability, so the LLM doesn't need to call `get_availability` immediately.

### Async vs Sync Tools

- **Sync (default)**: Tool executes, LLM waits for response, then continues
- **Async**: Tool executes in background, LLM continues talking immediately
- Use async for long-running operations where user shouldn't wait

### Tool Configuration

Tools are defined in `scripts/vapi-setup.ts` and deployed via `pnpm run vapi:setup`.

Each tool has:
- `name`: Function name
- `description`: Helps LLM decide when to use it
- `parameters`: JSON Schema for inputs
- `server.url`: Webhook endpoint

## Commands

```bash
pnpm run vapi:setup              # Deploy all assistants and tools
pnpm run vapi:setup evergreen    # Deploy specific office only
pnpm run vapi:logs               # List recent calls
pnpm run vapi:logs --last        # Show transcript of most recent call
pnpm run vapi:logs --last 3      # Show last 3 call transcripts
pnpm run vapi:list               # List all assistants and phone numbers
pnpm run vapi:assign <assistant> [phone]  # Assign assistant to phone
```

### Assigning Assistants to Phones

The `vapi:assign` command supports flexible matching:

```bash
# By phone nickname (set in VAPI dashboard)
pnpm run vapi:assign "Elise - Unified Tools" openmrs
pnpm run vapi:assign "Claude Multitools" openemr

# By phone number
pnpm run vapi:assign "Elise - Maple Grove" +15551234567

# Partial matching works for both
pnpm run vapi:assign unified openmrs
pnpm run vapi:assign claude openemr

# If only one phone, can omit it
pnpm run vapi:assign "Elise - Unified Tools"
```

**Phone nicknames** are set in the VAPI dashboard. Current phones:
- `OpenMRS` - Primary testing line
- `OpenEMR` - Secondary testing line

### Current Assistants

| Assistant | Model | Voice | Purpose |
|-----------|-------|-------|---------|
| `Elise - Maple Grove Medical` | gpt-4o | 11Labs (Sarah) | **Production** - MRS office |
| `Elise - Evergreen Health` | gpt-4o | Deepgram (Asteria) | **Production** - EMR office |
| `Elise - Unified Tools` | gpt-4o | Deepgram (Asteria) | Testing - single `manage_appointment` tool |
| `Elise - Claude Multitools` | Claude Sonnet 4 | Deepgram (Asteria) | Testing - multi-tool with Claude |

**To test an experimental assistant:**
```bash
pnpm run vapi:assign "Elise - Unified Tools" openmrs
# Make test calls
pnpm run vapi:logs --last
# Switch back to production
pnpm run vapi:assign "Elise - Maple Grove Medical" openmrs
```

## Reading Call Logs

The `vapi:logs --last` command shows:

```
[0.0s] SYSTEM: (system prompt)
[1.2s] BOT: "Hello, this is..."
[5.0s] USER: "Hi, I need to..."
[6.5s] TOOL_CALL: identify_patient
    Args: {"dob":"..."}
[7.0s] TOOL_RESULT: identify_patient
    Result: {...}
[8.5s] BOT: "Hi Joshua, I see..."
```

**Key things to look for**:
- **Timing gaps**: If TOOL_CALL happens immediately after TOOL_RESULT (< 1s), the LLM is calling tools in parallel
- **Tool ordering**: Tools called before BOT speaks = LLM being proactive (often unwanted)
- **Multiple TOOL_CALLs**: If two tools are called close together, they're parallel

## Common Issues

### LLM Calls Tools Too Early

**Problem**: LLM calls `get_availability` right after `identify_patient` before speaking to user.

**Solutions**:
1. Have `identify_patient` return availability data when appropriate
2. Add `nextAction` field to guide LLM behavior
3. Update prompt with explicit "Do NOT call X until Y"

### Tool Returns Error

Check the TOOL_RESULT in logs. Common errors:
- `service_not_found`: No matching AppointmentType in database
- `time_in_past`: Date parsing issue or timezone problem
- `patient_not_identified`: Call ID not linked to patient

### Prompt Not Taking Effect

VAPI caches assistant config. After changing `_base_assistant.json`:
1. Run `pnpm run vapi:setup` to push changes
2. Wait ~30 seconds for cache to clear
3. Make a new call (don't continue existing call)

## Assistant Configuration

Located in `config/assistants/`:
- `_base_assistant.json`: Centralized prompt template
- `<office>.json`: Office-specific variables and overrides

Template variables use `{{VARIABLE}}` syntax.

## Webhook Endpoints

Our server exposes:
- `POST /vapi/tools` - Handles all tool calls
- Tool name is in `message.toolCalls[].function.name`
- Call ID is in `message.call.id`

## Tool Design Approaches

### Multi-Tool (Default)

Separate tools for each action:
- `book_appointment` - Create new appointments
- `cancel_appointment` - Cancel existing appointments
- `reschedule_appointment` - Move appointments to new time

**Pros**: Clear separation, specific request-start messages
**Cons**: LLM may use wrong tool (e.g., `book_appointment` for cancellation)

### Unified Tool (Experimental)

Single `manage_appointment` tool with `action` enum:
```json
{
  "action": "book" | "cancel" | "reschedule",
  "appointmentId": "...",  // for cancel/reschedule
  "date": "...",           // for book/reschedule
  "time": "..."            // for book/reschedule
}
```

**Pros**: LLM can't pick wrong tool, action is explicit parameter
**Cons**: More complex tool description, no action-specific messages

### Tool Response Patterns

All appointment tools should return `suggestedAvailability` when relevant:
- `identify_patient` → Always includes availability
- `save_new_patient` → Includes availability for immediate booking
- `cancel_appointment` → Includes availability for rebooking
- `reschedule_appointment` (on failure) → Includes alternative times

This eliminates the need for separate `get_availability` calls in most flows.

## Best Practices

1. **Return comprehensive data**: Tools should return everything the LLM needs to continue the conversation
2. **Use `nextAction` hints**: Tell the LLM what to do next
3. **Keep prompts focused**: Don't rely on complex conditional logic in prompts
4. **Test with logs**: Always check `vapi:logs --last` after changes
5. **Avoid parallel tool assumptions**: The LLM WILL call tools in parallel if it wants to
6. **Include `suggestedAvailability`**: Return availability data from tools to reduce follow-up calls

## Debugging Checklist

1. Check logs: `pnpm run vapi:logs --last`
2. Verify deployment: `pnpm run vapi:setup`
3. Restart dev server: The server needs new code to handle tool calls
4. Check database: Are appointment types, providers, schedules populated?
5. Check tool response: Is the tool returning what the prompt expects?

## LLM Options

VAPI supports multiple LLM providers. Options we've tested:

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-4o` | OpenAI | Default. Fast, but may ignore instructions |
| `gpt-4o-mini` | OpenAI | Faster/cheaper, less capable |
| `claude-sonnet-4-20250514` | Anthropic | Better instruction following |

To use a different model, set in assistant config:
```json
{
  "model": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

## VAPI API Patterns

When making direct API calls to VAPI (for scripts or debugging):

### Environment Setup

Always use `loadEnv()` from `src/utils/env.js` to ensure proper credential loading:

```typescript
import { loadEnv } from '../src/utils/env.js';
loadEnv();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
```

### Common API Calls

```typescript
// List assistants
const res = await fetch('https://api.vapi.ai/assistant', {
  headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
});

// List phone numbers
const res = await fetch('https://api.vapi.ai/phone-number', {
  headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
});

// Update assistant
const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ /* updates */ }),
});

// Delete assistant
const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
});

// Assign assistant to phone
const res = await fetch(`https://api.vapi.ai/phone-number/${phoneId}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ assistantId }),
});

// Get call logs
const res = await fetch('https://api.vapi.ai/call?limit=10', {
  headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
});
```

### Running Ad-hoc Scripts

Create a `.ts` file in `scripts/` and run with `pnpm exec tsx`:

```bash
# Create script
cat > scripts/my-script.ts << 'EOF'
import { loadEnv } from '../src/utils/env.js';
loadEnv();

async function main() {
  // Your code here
}
main();
EOF

# Run it
pnpm exec tsx scripts/my-script.ts
```

**Note**: Don't use `tsx -e` with top-level await - it doesn't work with the CJS output format. Always create a script file.

## Resources

- VAPI Docs: https://docs.vapi.ai
- Tool Configuration: https://docs.vapi.ai/tools
- Custom Tools: https://docs.vapi.ai/tools/custom-tools
