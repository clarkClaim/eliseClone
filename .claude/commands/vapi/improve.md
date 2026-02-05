---
name: "VAPI: Improve"
description: "Debug and improve VAPI voice assistant behavior - analyze logs, fix tool issues, update prompts"
category: Voice
tags: [vapi, voice, debugging, tools]
---

Improve VAPI voice assistant behavior. Use this when calls aren't working as expected.

**Input**: The argument describes the issue (e.g., "LLM not mentioning appointments", "booking fails", "check last call").

---

## Quick Context

**Key Files** (read these as needed, not all at once):

| File | Purpose |
|------|---------|
| `docs/VAPI_REFERENCE.md` | How VAPI works, common issues, debugging tips |
| `config/assistants/_base_assistant.json` | The system prompt (this is what you usually need to change) |
| `config/assistants/*.json` | Office-specific overrides |
| `src/agent/tools/*.ts` | Tool implementations (identify-patient, get-availability, book-appointment) |
| `scripts/vapi-setup.ts` | Tool definitions deployed to VAPI |

**Commands**:
```bash
pnpm run vapi:logs --last    # See transcript of last call (START HERE)
pnpm run vapi:setup          # Deploy prompt/tool changes to VAPI
pnpm run build               # Must build before vapi:setup picks up code changes
```

---

## Workflow

### 1. Get the logs first

```bash
pnpm run vapi:logs --last
```

Look for:
- **Timing**: If two TOOL_CALLs happen < 1s apart, LLM is calling in parallel (bad)
- **Tool errors**: Check TOOL_RESULT for error messages
- **Missing speech**: If BOT never mentions something, check if data is in TOOL_RESULT
- **Wrong tool called**: LLM might be using wrong tool or wrong params

### 2. Identify the issue type

| Symptom | Likely Cause | Fix Location |
|---------|--------------|--------------|
| LLM ignores data in tool response | Prompt doesn't tell it to use that data | `_base_assistant.json` |
| LLM calls tools in parallel | Can't prevent this directly | Return all needed data in ONE tool |
| Tool returns error | Code bug or missing data | `src/agent/tools/*.ts` |
| Wrong date/time parsed | Date parsing bug | `src/utils/date.ts` |
| Service/provider not found | Missing from database | Run sync or check seed |

### 3. Common Fixes

**LLM calling tools too eagerly**:
- Can't stop parallel calls via config
- Solution: Make the first tool return everything needed
- Example: `identify_patient` returns `suggestedAvailability` so LLM doesn't need `get_availability`

**LLM not using returned data**:
- Add explicit instructions in prompt: "Use the `fieldName` from the response to..."
- Add `nextAction` hints in tool response to guide behavior

**Tool errors**:
- Check database has required data (appointment types, providers, schedules)
- Check date/time parsing handles the format LLM sends

### 4. Deploy changes

```bash
pnpm run build              # If you changed .ts files
pnpm run vapi:setup         # Push prompt/tool changes to VAPI
# Restart dev server if running
```

### 5. Test again

Make another call and check logs. Repeat until fixed.

---

## Key Insight

**The LLM (gpt-4o) will call multiple tools in parallel if it thinks it's helpful.** You cannot prevent this via VAPI config or prompts alone. The solution is to design tools so the LLM gets everything it needs in ONE call.

Example pattern:
```
identify_patient returns:
  - patient info
  - upcomingAppointments (if any)
  - suggestedAvailability (if no appointments)
  - nextAction: "discuss_appointments" | "offer_scheduling"
```

This removes the need for a second tool call.

---

## Guardrails

- Always check logs FIRST before changing code
- After any .ts change, run `pnpm run build`
- After any config change, run `pnpm run vapi:setup`
- Test with an actual call, not just code review
