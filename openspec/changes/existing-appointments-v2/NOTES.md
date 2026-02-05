# Implementation Notes

## Assistant Config Architecture (IMPORTANT)

The assistant prompt system was recently refactored:

- **`config/assistants/_base_assistant.json`** - Centralized prompt template with `{{VARIABLE}}` placeholders
- **`config/assistants/<office>.json`** (e.g., `evergreen.json`, `maple-grove.json`) - Office-specific configs that provide:
  - `template`: Variable values (OFFICE_NAME, FIRST_MESSAGE, STYLE_TONE, etc.)
  - `overrides`: VAPI settings to override (voice, delays)
- **Deploy**: `pnpm run vapi:setup` merges base + variables + overrides and pushes to VAPI for ALL offices

**DO NOT** reference `config/vapi-assistant.json` - it was deleted. Use `_base_assistant.json`.

## Patterns to Follow

### Provider Name Handling
From `src/agent/tools/get-availability.ts`:
```typescript
const providerKnown = !rawProviderName.toLowerCase().includes('unknown');
providerName: providerKnown ? rawProviderName : '',
```
If provider name contains "unknown", set to empty string so LLM doesn't say "with unknown provider".

### Date/Time Formatting
From `src/utils/date.ts`:
- `formatDateForSpeech(date)` → Returns "Today", "Tomorrow", or "Monday, March 5"
- `formatTimeForSpeech(date)` → Returns "10:00 AM"

These are already imported in other tools - use them for consistency.

## Key Files to Reference

| File | Purpose |
|------|---------|
| `src/agent/tools/identify-patient.ts` | Where to add appointment retrieval |
| `src/agent/tools/get-availability.ts` | Reference for provider name handling pattern |
| `src/utils/date.ts` | Date/time formatting helpers |
| `config/assistants/_base_assistant.json` | Centralized prompt to update |
| `prisma/schema.prisma` | Appointment model with relations |

## Database Notes

- `Appointment` has relations: `provider: Provider`, `service: AppointmentType`
- Index exists on `[patientId, status]` - good for our query
- Use `include: { provider: true, service: true }` to get names in one query

## Recent Session Changes (for context)

These changes were made earlier in this session and may be relevant:

1. **Business hours cutoff**: If outside 7 AM - 6 PM, availability search starts from tomorrow
2. **2 hour lead time**: Slots must be ≥2 hours in the future
3. **"Today"/"Tomorrow" in formatDateForSpeech**: Already implemented, use it
4. **Privacy**: Never reveal other patient names in error messages
