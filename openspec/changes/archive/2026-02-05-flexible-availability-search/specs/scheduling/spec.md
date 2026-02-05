## ADDED Requirements

### Requirement: Search availability across date ranges
The scheduling service SHALL provide a `searchAvailability()` function that efficiently queries availability across multiple days.

The function MUST accept search criteria including:
- `startDate`: Required start of search range
- `endDate`: Optional end of search range
- `daysOfWeek`: Optional array of day numbers to filter (0=Sunday through 6=Saturday)
- `timeOfDay`: Optional filter for morning/afternoon/evening
- `findFirst`: Optional flag to stop at first day with availability
- `maxDays`: Optional safety limit (default: 30)
- `providerId`: Optional provider filter
- `serviceId`: Optional service filter

#### Scenario: Search a date range
- **WHEN** `searchAvailability({ startDate: March 1, endDate: March 7 })` is called
- **THEN** availability is computed for all 7 days and returned as a map keyed by ISO date

#### Scenario: Search with day-of-week filter
- **WHEN** `searchAvailability({ startDate: today, daysOfWeek: [1, 3, 5], maxDays: 14 })` is called
- **THEN** only Mondays, Wednesdays, and Fridays are included in the result

#### Scenario: Find first available
- **WHEN** `searchAvailability({ startDate: today, findFirst: true })` is called
- **THEN** search stops at the first day with availability and returns only that day's slots

### Requirement: Batch database queries for efficiency
The `searchAvailability()` function MUST query schedule templates and appointments in batch (one query each for the entire range) rather than making separate queries per day.

#### Scenario: 30-day range query efficiency
- **WHEN** searching availability for 30 days
- **THEN** at most 2 database queries are made (one for templates, one for appointments), not 60+ queries

#### Scenario: Skip days with no templates
- **WHEN** schedule templates only exist for Mon/Wed/Fri (no weekend templates)
- **THEN** weekend dates are skipped without querying appointments for those days

### Requirement: Time of day filtering at service level
The `searchAvailability()` function SHALL support filtering time windows by time of day:
- `morning`: Windows starting between 6:00 and 11:59
- `afternoon`: Windows starting between 12:00 and 16:59
- `evening`: Windows starting between 17:00 and 20:59

#### Scenario: Morning filter applied
- **WHEN** `searchAvailability({ startDate: today, timeOfDay: "morning", maxDays: 7 })` is called
- **THEN** only time windows starting before 12:00 are included

### Requirement: Respect maxDays safety limit
The `searchAvailability()` function MUST enforce a maximum search range to prevent runaway queries.

If `endDate` is not specified, the search MUST stop after `maxDays` days (default: 30).

#### Scenario: Unbounded search with maxDays
- **WHEN** `searchAvailability({ startDate: today, findFirst: true })` is called with no availability for 60 days
- **THEN** search stops after 30 days (default maxDays) and returns empty result

#### Scenario: Custom maxDays limit
- **WHEN** `searchAvailability({ startDate: today, findFirst: true, maxDays: 7 })` is called
- **THEN** search stops after 7 days even if no availability is found

### Requirement: Return search metadata
The `searchAvailability()` function SHALL return metadata about the search performed:
- `daysSearched`: Number of days that were checked
- `firstAvailableDate`: ISO date of first day with availability (if findFirst was used)

#### Scenario: Metadata included in response
- **WHEN** `searchAvailability({ startDate: today, maxDays: 14 })` is called
- **THEN** response includes `daysSearched: 14` and the availability map

#### Scenario: First available date in metadata
- **WHEN** `searchAvailability({ startDate: today, findFirst: true })` finds availability on day 5
- **THEN** response includes `firstAvailableDate: "2026-02-09"` and `daysSearched: 5`
