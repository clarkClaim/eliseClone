## 1. Scheduling Service - searchAvailability()

- [x] 1.1 Define `AvailabilitySearchCriteria` and `AvailabilitySearchResult` types in `src/scheduling/availability-service.ts`
- [x] 1.2 Add `getScheduleTemplatesForRange(startDate, endDate)` helper that batch-queries templates for a date range
- [x] 1.3 Add `getAppointmentsForRange(startDate, endDate, providerId?)` helper that batch-queries appointments for a date range
- [x] 1.4 Implement `searchAvailability()` function with batch queries and in-memory computation
- [x] 1.5 Add `findFirst` early termination logic - stop searching when first day with availability is found
- [x] 1.6 Add `daysOfWeek` filtering - skip dates that don't match the filter
- [x] 1.7 Add `timeOfDay` filtering (morning: 6-12, afternoon: 12-17, evening: 17-21)
- [x] 1.8 Add `maxDays` safety limit (default 30) to prevent unbounded searches
- [x] 1.9 Export new types and function from `src/scheduling/index.ts`

## 2. Tool Layer - get-availability Updates

- [x] 2.1 Update `GetAvailabilityParams` interface to add `dateRange` and `search` parameters
- [x] 2.2 Add parameter precedence logic: `search` > `dateRange` > `date`
- [x] 2.3 Add date range parsing - convert `dateRange.startDate`/`endDate` strings to Date objects
- [x] 2.4 Add search criteria mapping - convert tool params to `AvailabilitySearchCriteria`
- [x] 2.5 Integrate `searchAvailability()` call for range/search queries (keep `computeAvailability()` for single date)
- [x] 2.6 Update `GetAvailabilityResult` interface to include `availabilityByDate` for multi-day results

## 3. Result Aggregation and Summaries

- [x] 3.1 Implement slot curation logic - select ~2 slots per day, cap at 8 total, prioritize variety
- [x] 3.2 Update summary generation for multi-day results (list dates and representative times)
- [x] 3.3 Add summary for `findFirst` results ("The next available appointment is...")
- [x] 3.4 Add summary for no availability ("I'm sorry, there are no available appointments...")
- [x] 3.5 Ensure summaries don't list more than 4-5 time options

## 4. VAPI Configuration

- [x] 4.1 Update `get_availability` tool definition in `config/vapi-tool-get-availability.json` with new parameters
- [x] 4.2 Add clear descriptions for `dateRange`, `search.daysAhead`, `search.findFirst`, `search.daysOfWeek`, `search.timeOfDay`
- [x] 4.3 Update assistant system prompt to guide proactive availability suggestions after patient ID
- [x] 4.4 Run VAPI setup script to push updated tool definition

## 5. Testing

- [ ] 5.1 Test single date query still works (backwards compatibility)
- [ ] 5.2 Test date range query returns grouped results
- [ ] 5.3 Test `findFirst` stops at first day with availability
- [ ] 5.4 Test `daysOfWeek` filter returns only matching days
- [ ] 5.5 Test `timeOfDay` filter returns only matching time windows
- [ ] 5.6 Test `maxDays` limit prevents unbounded searches
- [ ] 5.7 Test voice summary is concise and natural-sounding
- [ ] 5.8 End-to-end test with VAPI: "do you have any availability in March" (manual)
- [ ] 5.9 End-to-end test with VAPI: "when is the next available appointment" (manual)
- [ ] 5.10 End-to-end test with VAPI: "Wednesday mornings" (manual)
