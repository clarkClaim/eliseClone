## Why

The current availability search only accepts a single specific date, forcing awkward day-by-day iteration when patients ask for flexible timeframes like "sometime in March" or "Wednesday mornings." This creates a poor voice experience—the bot has to say things like "Let's try checking the dates 1 by 1" and wastes time checking days with no availability (like Sundays).

## What Changes

- **Flexible date parsing**: Accept natural language date expressions that imply ranges or patterns:
  - Months: "March", "sometime in March"
  - Relative ranges: "next week", "two weeks from now", "the first week of March"
  - Day-of-week patterns: "Wednesday mornings", "any Tuesday or Thursday"
  - Open-ended: "as soon as possible", "next available"

- **Multi-day availability search**: Query multiple days in a single tool call and return a curated selection of options (not an overwhelming list)

- **Proactive suggestions**: After patient identification, proactively offer "next available" times without waiting for the patient to ask

- **Smart result summarization**: Return voice-friendly summaries like "I have openings on Monday the 3rd at 9am and 2pm, or Wednesday the 5th in the morning"

## Capabilities

### New Capabilities
- `flexible-availability`: Date range parsing, multi-day queries, result aggregation, and proactive suggestions for the get_availability tool

### Modified Capabilities
- `scheduling`: Add `searchAvailability()` function for range queries and "find first" operations (existing `computeAvailability()` unchanged)

## Impact

- **Tool changes**: `get_availability` tool parameters and response format
- **Date parsing**: New logic to interpret flexible date expressions (can leverage LLM or rule-based)
- **VAPI config**: Updated tool definition in assistant configuration
- **Voice UX**: System prompt updates to leverage proactive suggestions
