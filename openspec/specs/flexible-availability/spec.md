## Requirements

### Requirement: Tool accepts flexible date parameters
The `get_availability` tool SHALL accept multiple parameter formats for specifying when to search for availability:
- `date`: A single date string (existing behavior)
- `dateRange`: An object with `startDate` and `endDate` strings
- `search`: An object with flexible search criteria (`daysAhead`, `daysOfWeek`, `timeOfDay`, `findFirst`)

The tool MUST accept at least one of these parameters. If multiple are provided, `search` takes precedence over `dateRange`, which takes precedence over `date`.

#### Scenario: Single date query (existing)
- **WHEN** tool is called with `{ date: "March 5th" }`
- **THEN** availability is returned for that specific date only

#### Scenario: Date range query
- **WHEN** tool is called with `{ dateRange: { startDate: "March 1", endDate: "March 7" } }`
- **THEN** availability is returned for all days in that range

#### Scenario: Days ahead search
- **WHEN** tool is called with `{ search: { daysAhead: 14 } }`
- **THEN** availability is returned for the next 14 days starting from today

#### Scenario: Day-of-week pattern
- **WHEN** tool is called with `{ search: { daysOfWeek: [1, 3, 5], daysAhead: 14 } }`
- **THEN** availability is returned only for Mondays, Wednesdays, and Fridays in the next 14 days

#### Scenario: Find first available
- **WHEN** tool is called with `{ search: { findFirst: true } }`
- **THEN** only the first day with availability is returned (scanning forward from today)

### Requirement: Tool returns curated multi-day results
When querying multiple days, the tool SHALL return a curated selection of slots (not an exhaustive list) to avoid overwhelming voice interactions.

Results MUST be grouped by date and limited to a reasonable number of options (5-8 total slots across all days).

#### Scenario: Large range returns curated results
- **WHEN** tool is called with `{ search: { daysAhead: 30 } }` and 100+ slots exist
- **THEN** response contains at most 8 slots spread across different days

#### Scenario: Results grouped by date
- **WHEN** tool is called with `{ dateRange: { startDate: "March 1", endDate: "March 7" } }`
- **THEN** response includes `availabilityByDate` object keyed by ISO date strings

### Requirement: Tool provides voice-friendly summaries
The tool SHALL return a `summary` field containing natural language text suitable for voice output.

Summaries MUST mention specific dates and times, and MUST NOT list more than 4-5 time options to avoid overwhelming the listener.

#### Scenario: Summary for multiple days
- **WHEN** availability exists on Monday at 9am/2pm and Wednesday at 10am
- **THEN** summary reads like "I have openings on Monday the 3rd at 9 AM and 2 PM, or Wednesday the 5th at 10 AM. Which works best for you?"

#### Scenario: Summary for no availability
- **WHEN** no availability exists in the searched range
- **THEN** summary reads like "I'm sorry, there are no available appointments in that timeframe. Would you like me to check a different time?"

#### Scenario: Summary for find-first
- **WHEN** `findFirst: true` and first availability is Monday at 9am
- **THEN** summary reads like "The next available appointment is Monday the 3rd at 9 AM. Would you like to book that?"

### Requirement: Time of day filtering
When `search.timeOfDay` is specified, the tool SHALL filter slots to the requested time period:
- `morning`: 6am - 12pm
- `afternoon`: 12pm - 5pm
- `evening`: 5pm - 9pm

#### Scenario: Morning filter
- **WHEN** tool is called with `{ search: { daysAhead: 7, timeOfDay: "morning" } }`
- **THEN** only slots between 6am and 12pm are returned

#### Scenario: Afternoon filter
- **WHEN** tool is called with `{ search: { daysAhead: 7, timeOfDay: "afternoon" } }`
- **THEN** only slots between 12pm and 5pm are returned

### Requirement: VAPI tool definition supports flexible parameters
The VAPI assistant configuration MUST include an updated tool definition with descriptions that guide the LLM to use the appropriate parameters for user requests.

#### Scenario: User says "sometime in March"
- **WHEN** user says "do you have any availability in March"
- **THEN** VAPI LLM calls tool with `{ dateRange: { startDate: "March 1", endDate: "March 31" } }` or `{ search: { daysAhead: N } }` covering March

#### Scenario: User says "next available"
- **WHEN** user says "when is the next available appointment" or "as soon as possible"
- **THEN** VAPI LLM calls tool with `{ search: { findFirst: true } }`

#### Scenario: User says "Wednesday mornings"
- **WHEN** user says "do you have anything on Wednesday mornings"
- **THEN** VAPI LLM calls tool with `{ search: { daysOfWeek: [3], timeOfDay: "morning", daysAhead: 14 } }`
