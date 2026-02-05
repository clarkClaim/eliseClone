## Context

The `identify_patient` tool currently returns patient info (id, name, givenName) upon successful identification. After identification, the assistant immediately offers to schedule a new appointment, unaware of any existing appointments the patient may have.

Patients frequently call to confirm, modify, or cancel existing appointments - not just to book new ones. Without visibility into existing appointments, the assistant provides a suboptimal experience.

The Appointment model already exists in the database with `patientId`, `startTime`, `endTime`, `providerId`, and `status` fields.

## Goals / Non-Goals

**Goals:**
- Return upcoming appointments as part of successful patient identification
- Maintain privacy: only reveal appointments after DOB verification succeeds
- Keep response fast: appointments are already in local database
- Provide enough context for LLM to handle various scenarios (confirm, reschedule, cancel, or book new)

**Non-Goals:**
- Modify/cancel appointment functionality (separate future change)
- Appointment history (past appointments)
- Appointment details beyond what's needed for voice conversation

## Decisions

### Decision 1: Query appointments in identify_patient, not separate tool

**Choice:** Fetch appointments within `identify_patient` when patient is found, include in response.

**Alternatives considered:**
- Separate `get_patient_appointments` tool: Adds latency (extra tool call), LLM might forget to call it
- Pre-fetch before DOB check: Privacy risk if DOB fails

**Rationale:** Single tool call is faster and ensures appointments are always available when patient is identified. Query only happens after successful identification, maintaining privacy.

### Decision 2: Include up to 5 upcoming appointments, highlight first 2

**Choice:** Return max 5 appointments sorted by date, with `nextTwo` flag on first 2.

**Alternatives considered:**
- Return all: Could be overwhelming for voice, wastes tokens
- Return only next 1: Misses common "I have two appointments" scenario

**Rationale:** 5 gives LLM flexibility to mention more if asked, while `nextTwo` provides guidance on what to emphasize in initial greeting.

### Decision 3: Appointment format optimized for voice

**Choice:** Return appointments with `dateForSpeech`, `timeForSpeech`, `providerName` (if known), `serviceName`.

**Alternatives considered:**
- Raw ISO dates: LLM would need to format, inconsistent
- Full appointment object: Too much irrelevant data

**Rationale:** Pre-formatted for voice reduces LLM processing and ensures consistent date/time formatting.

### Decision 4: Only include future appointments with non-cancelled status

**Choice:** Filter to `startTime > now` and `status NOT IN ('cancelled', 'no_show')`.

**Rationale:** Past appointments aren't actionable. Cancelled appointments would confuse patients.

## Risks / Trade-offs

**[Risk] Performance if patient has many appointments** → Query is limited to 5 and uses index on (patientId, startTime). Negligible impact.

**[Risk] Stale data if appointment changes during call** → Acceptable for voice context. Real-time sync not needed for this use case.

**[Trade-off] Response size increases** → Appointments add ~200-500 bytes. Acceptable given value provided.
