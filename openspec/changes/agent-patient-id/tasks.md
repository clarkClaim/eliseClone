## 1. Project Setup

- [ ] 1.1 Add Express as a dependency (`pnpm add express @types/express`)
- [ ] 1.2 Add tsx as a dev dependency for running TypeScript scripts (`pnpm add -D tsx`)
- [ ] 1.3 Update `.env.example` with VAPI variables (VAPI_API_KEY, VAPI_ASSISTANT_ID, SERVER_URL)
- [ ] 1.4 Add Prisma seed configuration to `package.json`

## 2. Seed Data

- [ ] 2.1 Create `prisma/seed.ts` with test patient data (5-10 patients)
- [ ] 2.2 Include patients with varied DOBs spanning 30+ years
- [ ] 2.3 Add phone numbers in E.164 format using 555 test prefix
- [ ] 2.4 Include at least one patient with multiple phone numbers
- [ ] 2.5 Include at least one patient without any phone number (for name+DOB fallback testing)
- [ ] 2.6 Implement idempotent upsert logic to prevent duplicates
- [ ] 2.7 Test seed script with `pnpm exec prisma db seed`

## 3. Express Server

- [ ] 3.1 Replace placeholder `src/server.ts` with Express server
- [ ] 3.2 Add health endpoint at `GET /health`
- [ ] 3.3 Add VAPI tool-call endpoint at `POST /vapi/tools`
- [ ] 3.4 Parse JSON body and route to tool handlers
- [ ] 3.5 Implement VAPI response format (`{ results: [{ toolCallId, result }] }`)
- [ ] 3.6 Handle unknown tool requests with error response

## 4. VAPI Assistant Configuration

- [ ] 4.1 Create `config/vapi-assistant.json` with assistant configuration
- [ ] 4.2 Write system prompt that instructs assistant to identify patients
- [ ] 4.3 Define `identify_patient` tool with phone, dob, and optional name parameters
- [ ] 4.4 Use `{{SERVER_URL}}` placeholder for tool server URL
- [ ] 4.5 Create `scripts/setup-vapi.ts` setup script
- [ ] 4.6 Implement env var interpolation for config placeholders
- [ ] 4.7 Implement create-or-update logic using VAPI API
- [ ] 4.8 Add `setup:vapi` script to `package.json`

## 5. Patient Identification Tool

- [ ] 5.1 Create phone normalization utility (strip formatting, add +1 if missing)
- [ ] 5.2 Create DOB parsing utility (handle ISO, US, natural language formats)
- [ ] 5.3 Implement phone lookup in `patient_phones` table
- [ ] 5.4 Implement DOB verification against patient record
- [ ] 5.5 Implement name + DOB fallback lookup with flexible matching
- [ ] 5.6 Add phone to patient record when identified by name + DOB
- [ ] 5.7 Return appropriate status: existing, new, not_found_try_name, verification_failed
- [ ] 5.8 Include patient details in response when identified

## 6. Conversation Tracking

- [ ] 6.1 Create or find Conversation record on first tool-call for a VAPI call ID
- [ ] 6.2 Set externalId, channel ("voice"), and callerPhone from call metadata
- [ ] 6.3 Update Conversation with patientId after successful identification

## 7. Integration Testing

- [ ] 7.1 Test seed data loads correctly
- [ ] 7.2 Test health endpoint returns 200
- [ ] 7.3 Test identify_patient with known phone + correct DOB (existing)
- [ ] 7.4 Test identify_patient with known phone + wrong DOB (verification_failed)
- [ ] 7.5 Test identify_patient with unknown phone, no name (not_found_try_name)
- [ ] 7.6 Test identify_patient with unknown phone + name + DOB match (existing, phoneAdded)
- [ ] 7.7 Test identify_patient with unknown phone + name + no match (new)
- [ ] 7.8 Run setup:vapi and verify assistant created/updated in VAPI dashboard
