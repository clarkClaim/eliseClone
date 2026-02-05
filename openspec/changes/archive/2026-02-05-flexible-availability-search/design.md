## Context

The current availability search flow:
1. Tool receives a `date` string (e.g., "March 5th")
2. `parseDate()` in `src/utils/date.ts` converts it to a single `Date` object
3. `computeAvailability()` in `src/scheduling/availability-service.ts` queries for that one day
4. Tool returns up to 10 slots with a voice-friendly summary

**The limitation exists at both layers:**
- **Tool layer**: Only accepts single date strings, no range/search parameters
- **Scheduling service**: `computeAvailability()` is a point lookup (single date), not a search operation. "Next available" requires scanning forward until availability is found—this doesn't fit the single-day model.

**Key constraint**: VAPI's tool calling model receives the raw user input (e.g., "sometime in March") and decides what to pass to our tool. We can either:
- Parse flexible expressions ourselves (in our tool)
- Let VAPI/LLM interpret the expression and pass structured parameters

## Goals / Non-Goals

**Goals:**
- Accept flexible date expressions: "March", "next week", "Wednesday mornings", "ASAP"
- Return curated multi-day results in a single tool call
- Provide voice-friendly summaries that don't overwhelm the patient
- Proactively surface "next available" when appropriate

**Non-Goals:**
- Complex recurrence patterns ("every other Tuesday")
- Provider preference learning
- Time-of-day preferences beyond morning/afternoon/evening
- Replacing `computeAvailability()` (keep it for single-date lookups)

## Decisions

### 1. Date Expression Interpretation: VAPI-First with Fallback

**Decision**: Let VAPI's LLM interpret flexible date expressions and pass structured parameters to our tool. Add a `dateRange` object as an alternative to the single `date` string.

**Rationale**:
- VAPI's LLM is already parsing "November ninth 1997" → DOB correctly
- LLMs handle natural language ambiguity well ("sometime in March" → March 1-31)
- Avoids maintaining complex regex/NLP logic ourselves
- We still need a fallback for when VAPI passes raw strings we don't understand

**Tool parameters (new)**:
```typescript
interface GetAvailabilityParams {
  // Option A: Single date (existing)
  date?: string;

  // Option B: Date range (new)
  dateRange?: {
    startDate: string;  // ISO or natural language
    endDate: string;    // ISO or natural language
  };

  // Option C: Search criteria (new)
  search?: {
    daysAhead?: number;           // "next 7 days", "next 2 weeks"
    daysOfWeek?: number[];        // [1,3,5] for Mon/Wed/Fri
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    findFirst?: boolean;          // "next available" / "ASAP"
  };

  // Existing
  providerId?: string;
  serviceId?: string;
}
```

**Alternatives considered**:
- **Rule-based parsing**: More predictable but harder to maintain, poor at handling variations like "the first week of March" vs "early March"
- **Dedicated LLM call**: Extra latency and cost, when VAPI's LLM can do this in the tool-calling phase

### 2. Multi-Day Query: Add `searchAvailability()` to Scheduling Service

**Decision**: Add a new `searchAvailability()` function to the scheduling service that handles range queries and "find first" operations efficiently.

**Rationale**:
- "Next available" is a scan operation, not a point lookup—looping day-by-day at the tool layer would be slow (potentially 14+ sequential DB round-trips)
- The scheduling service can optimize: query templates once for the range, query appointments once for the range, skip days with no templates
- Keeps the abstraction clean: `computeAvailability()` for point lookups, `searchAvailability()` for search/scan operations
- Other consumers of the scheduling service may also need range queries

**New function in scheduling service**:
```typescript
export interface AvailabilitySearchCriteria {
  startDate: Date;
  endDate?: Date;              // If omitted, search until findFirst succeeds or maxDays reached
  daysOfWeek?: number[];       // Filter to specific days (0=Sun, 6=Sat)
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  findFirst?: boolean;         // Stop at first day with availability
  maxDays?: number;            // Safety limit (default: 30)
  providerId?: string;
  serviceId?: string;
}

export interface AvailabilitySearchResult {
  // Keyed by ISO date string (e.g., "2026-03-05")
  availabilityByDate: Map<string, TimeWindow[]>;
  // For findFirst: true, the first available date
  firstAvailableDate?: string;
  // Days searched (for transparency)
  daysSearched: number;
}

export async function searchAvailability(
  criteria: AvailabilitySearchCriteria
): Promise<AvailabilitySearchResult>
```

**Implementation approach**:
1. Determine which days of week have ANY schedule templates (skip weekends if no weekend schedules)
2. Query all templates in the date range in one DB call
3. Query all appointments in the date range in one DB call
4. Iterate through dates, computing availability from cached data
5. If `findFirst: true`, stop as soon as we find a day with availability

**Alternatives considered**:
- **Loop at tool layer**: Simpler but slow for "next available" (sequential DB calls until availability found)
- **Replace computeAvailability()**: Overkill—single-date lookups are still useful and simpler

### 3. Result Aggregation: Smart Curated Selection

**Decision**: Return a curated selection (5-8 options) spread across the date range, with voice-friendly summaries.

**Rationale**:
- Listing 100+ slots is useless for voice
- Patients want choices, not exhaustive lists
- Grouping by day makes it easier to discuss

**Aggregation strategy**:
1. If `findFirst: true`: Return the single next available slot
2. Otherwise: Select ~2 slots per day, spread across the range
3. Prioritize variety (different days, different times, different providers if applicable)
4. Cap at 8 total options

**Summary format**:
```
"I have openings on Monday the 3rd at 9 AM and 2 PM, Wednesday the 5th
in the morning, or Friday the 7th. Which works best for you?"
```

### 4. Proactive Suggestions: Tool Output Flag

**Decision**: Add a `suggestNextAvailable` flag in the tool response. The system prompt instructs the assistant to use this after patient identification.

**Rationale**:
- The tool shouldn't unilaterally search—it should be invoked by the LLM
- But we can hint in the system prompt: "After identifying a patient, check availability and proactively suggest times"
- This keeps control with the LLM while enabling the behavior

**Implementation**:
- Add to VAPI system prompt: "After successfully identifying a patient, proactively offer to schedule by calling get_availability with `search: { findFirst: true, daysAhead: 14 }`"
- Tool returns `{ suggestedSlots: [...], proactiveSummary: "I have an opening as soon as Monday at 9 AM. Would you like to schedule that?" }`

### 5. VAPI Tool Definition Update

**Decision**: Update the tool definition to describe the new parameters clearly so VAPI's LLM uses them correctly.

```json
{
  "name": "get_availability",
  "description": "Get available appointment times. Use 'search.daysAhead' for flexible requests like 'next week' or 'sometime soon'. Use 'search.findFirst' for 'ASAP' or 'next available'. Use 'search.daysOfWeek' for specific day patterns like 'any Wednesday'.",
  "parameters": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Specific date like 'March 5th' or 'tomorrow'" },
      "dateRange": {
        "type": "object",
        "properties": {
          "startDate": { "type": "string" },
          "endDate": { "type": "string" }
        }
      },
      "search": {
        "type": "object",
        "properties": {
          "daysAhead": { "type": "number", "description": "Number of days to search" },
          "daysOfWeek": { "type": "array", "items": { "type": "number" }, "description": "0=Sun through 6=Sat" },
          "timeOfDay": { "enum": ["morning", "afternoon", "evening"] },
          "findFirst": { "type": "boolean", "description": "Return only the next available slot" }
        }
      },
      "providerId": { "type": "string" },
      "serviceId": { "type": "string" }
    }
  }
}
```

## Risks / Trade-offs

**LLM interpretation variability** → Mitigation: Clear tool descriptions, fallback parsing for common patterns, and testing with various phrasings.

**Large date ranges** → Mitigation: Cap `maxDays` at 30. Batch queries (templates + appointments in one call each) keep DB load constant regardless of range size.

**Result selection may miss preferred slots** → Mitigation: Include diverse options (early/late, different days). Let patient ask to narrow down ("What about Thursday afternoon specifically?").

**System prompt changes affect behavior** → Mitigation: Test the updated prompt thoroughly. Keep proactive suggestions opt-in by the LLM, not forced.

## Open Questions

1. **Default search range**: When user says "March" in early February, do we search all of March (28-31 days) or suggest narrowing? Leaning toward searching all but summarizing as "I have many openings throughout March. The earliest is..."

2. **Timezone handling**: Currently assumes server timezone. Should we infer patient timezone from their location or phone number? Probably out of scope for this change.

3. **Demo availability gaps**: The demo has Dr. Smith (Mon/Wed/Fri) and Dr. Jones (Tue/Thu). Weekends have no availability. Should the summary mention this proactively? ("We're open Monday through Friday...")
