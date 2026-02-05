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
pnpm run vapi:list               # List all assistants and phone numbers
pnpm run vapi:assign <phone> <assistant>  # Assign assistant to phone number
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

## Best Practices

1. **Return comprehensive data**: Tools should return everything the LLM needs to continue the conversation
2. **Use `nextAction` hints**: Tell the LLM what to do next
3. **Keep prompts focused**: Don't rely on complex conditional logic in prompts
4. **Test with logs**: Always check `vapi:logs --last` after changes
5. **Avoid parallel tool assumptions**: The LLM WILL call tools in parallel if it wants to

## Debugging Checklist

1. Check logs: `pnpm run vapi:logs --last`
2. Verify deployment: `pnpm run vapi:setup`
3. Restart dev server: The server needs new code to handle tool calls
4. Check database: Are appointment types, providers, schedules populated?
5. Check tool response: Is the tool returning what the prompt expects?

## Resources

- VAPI Docs: https://docs.vapi.ai
- Tool Configuration: https://docs.vapi.ai/tools
- Custom Tools: https://docs.vapi.ai/tools/custom-tools
