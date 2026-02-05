## Context

The project has a working database schema with Patient and PatientPhone tables, but no HTTP server or VAPI integration yet. The server.ts file is a placeholder with comments indicating where VAPI webhooks should go.

VAPI is a voice AI platform that handles speech-to-text, LLM orchestration, and text-to-speech. It communicates with our backend via webhooks—calling our server when events occur (call started, user spoke, function call needed, call ended).

This change focuses solely on patient identification. The agent will identify callers by phone + DOB before any scheduling tools are added.

## Goals / Non-Goals

**Goals:**
- Seed database with realistic test patients for development and demos
- Implement VAPI webhook endpoints that receive call events
- Track conversations in the database (using existing Conversation model)
- Identify patients: match caller phone → verify DOB → return patient status
- Provide a working demo: call VAPI number → speak phone/DOB → hear if recognized

**Non-Goals:**
- Scheduling tools (book, cancel, reschedule) — added in future change
- Outbound calls or waitlist flows
- Production security hardening (webhook signature verification can be basic)
- Chat channel support (voice-first for this change)
- MRS sync of patient data (handled separately)

## Decisions

### 1. HTTP Framework: Express

**Decision:** Use Express for the HTTP server.

**Alternatives:**
- Fastify: Faster, better TypeScript support, but less ecosystem familiarity
- Hono: Lightweight, but newer and less battle-tested

**Rationale:** Express is simple, well-documented, and sufficient for webhook handling. VAPI's examples use Express. Can migrate to Fastify later if needed.

---

### 2. VAPI Assistant Config: Git-Tracked JSON + Setup Script

**Decision:** Define the VAPI assistant configuration in a JSON file (`config/vapi-assistant.json`), with a setup script that creates or updates the assistant via VAPI API.

**File Structure:**
```
config/
  vapi-assistant.json   # Full assistant config (system prompt, tools, voice settings)
scripts/
  setup-vapi.ts         # Creates/updates assistant from config file
```

**Assistant Config (vapi-assistant.json):**
```json
{
  "name": "Elise Patient Assistant",
  "firstMessage": "Hello, this is Elise from the clinic. I can help you with scheduling. To get started, could you please provide your phone number?",
  "model": {
    "provider": "openai",
    "model": "gpt-4o",
    "messages": [{ "role": "system", "content": "You are a healthcare scheduling assistant..." }]
  },
  "voice": { "provider": "11labs", "voiceId": "..." },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "identify_patient",
        "description": "Identify a patient by phone number and date of birth",
        "parameters": { ... }
      },
      "server": { "url": "{{SERVER_URL}}/vapi/tools" }
    }
  ]
}
```

**Setup Script Behavior:**
1. Read config from `config/vapi-assistant.json`
2. Interpolate environment variables (e.g., `{{SERVER_URL}}`)
3. Check if assistant exists (by name or stored ID in `.env`)
4. Create new or update existing via VAPI API
5. Output assistant ID for `.env` if new

**Alternatives:**
- Dashboard-only: Not version controlled, manual drift
- Transient assistants: Return full config per-call, 7.5s timeout pressure
- Hardcoded in TypeScript: Less readable than JSON, harder to review prompts

**Rationale:** JSON config is readable, diffable, and keeps prompts/tools versioned with the code. Setup script makes deployment repeatable.

---

### 3. VAPI Runtime: Server URL for Tool Calls

**Decision:** Configure the assistant's Server URL to receive tool-call events. Phone number linked to assistant in VAPI dashboard (one-time manual step).

**Runtime Flow:**
```
1. Patient calls VAPI phone number (linked to our assistant)
2. Assistant greets caller, asks for phone and DOB
3. VAPI sends tool-call POST to our Server URL for "identify_patient"
4. We look up patient, return result in VAPI format
5. VAPI speaks the result to caller
```

**Rationale:** Pre-created assistant is simpler—no per-call config, config lives in git, and we only receive tool-call webhooks at runtime.

---

### 4. Patient Identification: Phone Lookup with Name + DOB Fallback

**Decision:** Implement identification as a single tool that takes phone, DOB, and optionally name. Supports fallback when phone not on file.

**Tool Definition:**
```typescript
{
  name: "identify_patient",
  parameters: {
    phone: string,    // Caller's phone number (required)
    dob: string,      // Date of birth (required)
    name?: string     // Patient name (optional, for fallback lookup)
  },
  returns: {
    status: "existing" | "new" | "not_found_try_name" | "verification_failed",
    patient?: { id, name, ... },  // If existing
    phoneAdded?: boolean          // True if phone was added to patient record
  }
}
```

**Logic:**
1. Normalize phone number (strip formatting)
2. Query patient_phones table for match
3. If phone found + DOB matches → return `{ status: "existing", patient: {...} }`
4. If phone found + DOB wrong → return `{ status: "verification_failed" }`
5. If phone not found + name provided → lookup by name + DOB
   - If match found → add phone to patient, return `{ status: "existing", patient: {...}, phoneAdded: true }`
   - If no match → return `{ status: "new" }`
6. If phone not found + no name → return `{ status: "not_found_try_name" }`

**Rationale:** Patients synced from MRS may not have phone numbers on file. Name + DOB fallback allows identifying these patients and capturing their phone for future calls.

---

### 5. Conversation Tracking: Create on Call Start

**Decision:** Create a Conversation record when VAPI sends the call-started event. Update with patient ID once identified.

**Fields used:**
- `externalId`: VAPI call ID
- `channel`: "voice"
- `callerPhone`: From VAPI call metadata
- `patientId`: Set after successful identification
- `startedAt`/`endedAt`: Call timing
- `outcome`: Set on call end

**Rationale:** Existing Conversation model fits the use case. External ID allows correlating with VAPI logs.

---

### 6. Seed Data: Prisma Seed Script

**Decision:** Use `prisma/seed.ts` with `pnpm exec prisma db seed`.

**Test patients:**
- 5-10 patients with varied names, DOBs, phone numbers
- At least one patient with multiple phone numbers
- Use realistic but obviously fake data (555-xxxx phones)

**Rationale:** Standard Prisma pattern. Repeatable via `--skip-generate` or truncate + reseed.

## Risks / Trade-offs

**[Risk] Phone number format inconsistency** → Normalize all phone numbers to E.164 format on input. Store normalized in database.

**[Risk] DOB parsing errors from speech** → VAPI/LLM handles natural language dates. Our tool receives parsed date. If unparseable, ask user to clarify.

**[Risk] VAPI webhook security** → For MVP, use a secret path (`/vapi/webhook/{secret}`). Production should verify VAPI signatures.

**[Trade-off] Single identify_patient tool** → Simpler but less flexible. If we need phone lookup without verification later, we'd add another tool.

**[Trade-off] No retry on verification failure** → User must call again or ask agent to try different info. Keeps flow simple for MVP.

## Open Questions

1. **Phone Number Source**: Does VAPI provide caller ID, or must user speak their number? (Need to check VAPI call metadata)

2. **Rate Limiting**: Should we limit identification attempts per call to prevent DOB brute-forcing? (Probably yes: 3 attempts then escalate)
