## 1. Project Setup

- [x] 1.1 Add Express as a dependency (`pnpm add express @types/express`)
- [x] 1.2 Add tsx as a dev dependency for running TypeScript scripts (`pnpm add -D tsx`)
- [x] 1.3 Update `.env.example` with VAPI variables (VAPI_API_KEY, VAPI_ASSISTANT_ID, SERVER_URL)
- [x] 1.4 Add Prisma seed configuration to `package.json`

## 2. Seed Data

- [x] 2.1 Create `prisma/seed.ts` with test patient data (5-10 patients)
- [x] 2.2 Include patients with varied DOBs spanning 30+ years
- [x] 2.3 Add phone numbers in E.164 format using 555 test prefix
- [x] 2.4 Include at least one patient with multiple phone numbers
- [x] 2.5 Include at least one patient without any phone number (for name+DOB fallback testing)
- [x] 2.6 Implement idempotent upsert logic to prevent duplicates
- [x] 2.7 Test seed script with `pnpm exec prisma db seed`

## 3. Express Server

- [x] 3.1 Replace placeholder `src/server.ts` with Express server
- [x] 3.2 Add health endpoint at `GET /health`
- [x] 3.3 Add VAPI tool-call endpoint at `POST /vapi/tools`
- [x] 3.4 Parse JSON body and route to tool handlers
- [x] 3.5 Implement VAPI response format (`{ results: [{ toolCallId, result }] }`)
- [x] 3.6 Handle unknown tool requests with error response

## 4. VAPI Assistant Configuration

- [x] 4.1 Create `config/vapi-assistant.json` with assistant configuration
- [x] 4.2 Write system prompt that instructs assistant to identify patients
- [x] 4.3 Define `identify_patient` tool with dob and optional name parameters
- [x] 4.4 Use `{{SERVER_URL}}` placeholder for tool server URL
- [x] 4.5 Create `scripts/setup-vapi.ts` setup script
- [x] 4.6 Implement env var interpolation for config placeholders
- [x] 4.7 Implement create-or-update logic using VAPI API
- [x] 4.8 Add `setup:vapi` script to `package.json`

## 5. Patient Identification Tool

- [x] 5.1 Create phone normalization utility (strip formatting, add +1 if missing)
- [x] 5.2 Create DOB parsing utility (handle ISO, US, natural language formats)
- [x] 5.3 Implement phone lookup in `patient_phones` table
- [x] 5.4 Implement DOB verification against patient record
- [x] 5.5 Implement name + DOB fallback lookup with flexible matching
- [x] 5.6 Add phone to patient record when identified by name + DOB
- [x] 5.7 Return appropriate status: existing, new, not_found_try_name, verification_failed
- [x] 5.8 Include patient details in response when identified

## 6. New Patient Registration Tool

- [x] 6.1 Create `save_new_patient` tool for registering new patients
- [x] 6.2 Validate required fields (name, dob)
- [x] 6.3 Create patient record with caller's phone from caller ID
- [x] 6.4 Handle duplicate phone number detection

## 7. Conversation Tracking

- [x] 7.1 Create or find Conversation record on first tool-call for a VAPI call ID
- [x] 7.2 Set externalId, channel ("voice"), and callerPhone from call metadata
- [x] 7.3 Update Conversation with patientId after successful identification

## 8. Caller ID Integration

- [x] 8.1 Extract caller phone from VAPI call metadata (`call.customer.number`)
- [x] 8.2 Inject caller phone into tool arguments server-side
- [x] 8.3 Remove phone from required tool parameters (system injects it)
- [x] 8.4 Update system prompts to not mention caller ID (prevents LLM confusion)

## 9. Multiple Assistant Variants

- [x] 9.1 Create `config/assistants/` directory for multiple configs
- [x] 9.2 Create Jessica variant (ElevenLabs, warm voice)
- [x] 9.3 Create Sarah variant (ElevenLabs, professional)
- [x] 9.4 Create Asteria variant (Deepgram, fast/low-latency)
- [x] 9.5 Create Orion variant (Deepgram, male voice)
- [x] 9.6 Update `vapi-setup.ts` to handle multiple assistants

## 10. VAPI Management Scripts

- [x] 10.1 Create `vapi-list.ts` to list assistants and phone numbers
- [x] 10.2 Create `vapi-assign.ts` to assign assistant to phone number
- [x] 10.3 Create `vapi-delete.ts` to delete assistants
- [x] 10.4 Support fuzzy matching for assistant names
- [x] 10.5 Auto-detect single phone number for simplified assignment

## 11. Tool Message Configuration

- [x] 11.1 Add `request-start: ""` to silence filler phrases
- [x] 11.2 Keep `request-failed` for error handling
- [x] 11.3 Leave `request-complete` unset (let LLM respond naturally)

## 12. Documentation

- [x] 12.1 Create `docs/VAPI_SETUP.md` with step-by-step setup guide
- [x] 12.2 Create `docs/VOICE_IDEAS.md` with voice configuration research
- [x] 12.3 Create `docs/VAPI_BEST_PRACTICES.md` with tool and voice learnings
- [x] 12.4 Add ngrok tunnel helper script

## 13. Testing

- [x] 13.1 Test seed data loads correctly
- [x] 13.2 Test health endpoint returns 200
- [x] 13.3 Test identify_patient with known phone + correct DOB (existing)
- [x] 13.4 Test identify_patient with unknown phone (not_found_try_name)
- [x] 13.5 Test identify_patient with name + DOB match (existing, phoneAdded)
- [x] 13.6 Test save_new_patient creates new patient
- [x] 13.7 Test voice call end-to-end with VAPI
