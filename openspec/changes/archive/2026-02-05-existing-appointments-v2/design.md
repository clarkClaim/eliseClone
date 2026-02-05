## Context

**Current identify_patient flow:**
1. Validate phone + DOB
2. Find patient by phone, verify DOB (or fall back to name + DOB)
3. Return `{ status: "existing", patient: { id, name, givenName } }`
4. Assistant asks "how can I help with scheduling?"

**Problem:** No visibility into existing appointments. Assistant can't help with confirms/reschedules without extra steps.

**New assistant config architecture:**
- `config/assistants/_base_assistant.json` - Centralized prompt template with `{{VARIABLE}}` placeholders
- `config/assistants/<office>.json` - Office-specific variable values and overrides
- Changes to base prompt affect all offices

**Relevant data model:**
- `Appointment` has: `patientId`, `startTime`, `endTime`, `providerId`, `serviceId`, `status`
- `Provider` has: `name`
- `AppointmentType` has: `name`
- Index exists on `[patientId, status]`

## Goals / Non-Goals

**Goals:**
- Return upcoming appointments when patient identified successfully
- Privacy: only query appointments AFTER DOB verified
- Voice-optimized format using existing helpers (`formatDateForSpeech`, `formatTimeForSpeech`)
- Update centralized prompt so all offices benefit

**Non-Goals:**
- Cancel/modify appointment actions (future change)
- Past appointment history
- Per-office customization of this flow

## Decisions

### Decision 1: Query appointments inside identify_patient

**Choice:** Fetch appointments within `identifyPatient()` after successful identification.

**Why not a separate tool?**
- Extra latency (additional tool call round-trip)
- LLM might forget to call it
- Privacy risk if exposed as standalone tool

**Why not pre-fetch before DOB check?**
- Privacy violation if DOB fails - we'd have queried their appointments already

### Decision 2: Limit to 5 appointments, highlight first 2

**Choice:** `LIMIT 5`, set `highlight: true` on first 2.

**Rationale:**
- 5 is enough for most scenarios without overwhelming voice
- `highlight` tells LLM which to mention in greeting vs. "you have more if needed"
- Sorted by `startTime ASC` - nearest first

### Decision 3: Filter criteria

**Choice:** `startTime > NOW()` and `status NOT IN ('cancelled', 'no_show')`

**Rationale:**
- Past appointments aren't actionable
- Cancelled/no-show would confuse ("you have an appointment" that's already cancelled)
- Include `scheduled`, `confirmed`, `arrived`, `in_service` (active statuses)

### Decision 4: Voice format matches existing helpers

**Choice:** Use `formatDateForSpeech()` → "Today", "Tomorrow", "Monday, March 5"
Use `formatTimeForSpeech()` → "10:00 AM"

**Rationale:** Consistency with availability/booking flows. Already handles timezone, formatting.

### Decision 5: Provider name handling

**Choice:** Include `providerName` only if known (not "unknown" or placeholder).

**Rationale:** Same pattern as `get-availability.ts` - don't say "with unknown provider".

## Risks / Trade-offs

**[Risk] Extra query adds latency** → Mitigated by LIMIT 5 + existing index on (patientId, status). Should add <10ms.

**[Risk] Prompt changes affect all offices** → This is desired. All offices should have consistent appointment handling.

**[Trade-off] Response payload larger** → ~200-500 bytes for appointments. Acceptable.
