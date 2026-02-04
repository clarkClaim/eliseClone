# Technical Exploration

This document captures research findings from deep-diving each external dependency and component before implementation.

---

## Table of Contents

1. [OpenMRS API](#1-openmrs-api)
2. [VAPI Integration](#2-vapi-integration)
3. [Database Schema](#3-database-schema)
4. [Conversation Flow](#4-conversation-flow)
5. [Tool Schemas](#5-tool-schemas)
6. [Sync Logic](#6-sync-logic)
7. [System Prompt](#7-system-prompt)

---

## 1. OpenMRS API

### Overview

OpenMRS provides a REST API for patient management and appointment scheduling via an optional module. The appointment scheduling module is separate from core OpenMRS and must be installed.

**Base URL:** `https://demo.openmrs.org/openmrs/ws/rest/v1/`
**Auth:** Basic Authentication (base64 encoded `username:password`)

### Key Resources

#### Appointment Scheduling Module

Base path: `/appointmentscheduling/`

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Appointment Block | `GET/POST /appointmentblockwithtimeslot` | Provider's available time windows |
| Time Slot | `GET /timeslot` | Individual bookable slots (auto-generated from blocks) |
| Appointment | `GET/POST/PUT /appointment` | Patient bookings |
| Appointment Type | `GET /appointmenttype` | Types of appointments (checkup, procedure, etc.) |

#### Core Resources

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Patient | `GET/POST /patient` | Patient records |
| Provider | `GET /provider` | Healthcare providers |
| Location | `GET /location` | Facility locations |

### Appointment Block Structure

Appointment blocks define when a provider is available. Time slots are automatically generated within blocks.

```json
POST /appointmentscheduling/appointmentblockwithtimeslot
{
  "location": "aff27d58-a15c-49a6-9beb-d30dcfc0c66e",
  "startDate": "2024-01-15T09:00:00.000+0000",
  "endDate": "2024-01-15T17:00:00.000+0000",
  "provider": "f4d6a64f-d996-4367-aa90-559c10db9b91",
  "types": [{"uuid": "7dd9ac8e-c436-11e4-a470-82b0ea87e2d8"}]
}
```

**Limitation:** Time slot duration cannot be configured via REST API (only through UI).

### Appointment Structure

```json
POST /appointmentscheduling/appointment
{
  "timeSlot": "6c3afe83-ce18-4a8f-be58-afebd5e00a7e",
  "appointmentType": "4da187c6-c436-11e4-a470-82b0ea87e2d8",
  "patient": "1e9caea5-d31e-4436-80ec-2b10b88a5739",
  "status": "SCHEDULED",
  "reason": "Annual checkup"
}
```

**Appointment Properties:**
- `uuid` - Unique identifier
- `timeSlot` - Reference to time slot (required, immutable after creation)
- `patient` - Reference to patient (required)
- `appointmentType` - Type of appointment (required, immutable)
- `status` - Current status
- `reason` - Reason for visit
- `cancelReason` - Reason if cancelled
- `visit` - Associated visit (optional)

**Appointment Statuses:**
```
SCHEDULED → ARRIVED → IN_SERVICE → COMPLETED
    ↓
CANCELLED / MISSED
```

### Search Parameters

`GET /appointmentscheduling/appointment` supports:
- `fromDate`, `toDate` - Date range
- `location`, `provider` - Resource filtering
- `appointmentType`, `status`, `statusType` - Type filtering
- `patient`, `visit`, `visitType` - Patient filtering

### What We Must Compute Locally

1. **Availability** = Time slots WHERE no appointment exists (or appointment.status = CANCELLED)
2. **Provider schedule** = Appointment blocks for provider in date range
3. **Patient lookup by phone** = Not in OpenMRS; we maintain phone→patient mapping locally

### Sources

- [OpenMRS REST API Docs](https://rest.openmrs.org/)
- [Appointment Scheduling Module](https://github.com/openmrs/openmrs-module-appointmentscheduling)
- [OpenMRS Talk Forum](https://talk.openmrs.org/t/rest-api-for-provider-scheduling-calculate-time-slot/12684)

---

## 2. VAPI Integration

### Overview

VAPI provides voice AI infrastructure. We define an assistant with custom tools; VAPI handles speech-to-text, LLM conversation, and text-to-speech. Our server receives webhook calls when tools are invoked.

### Assistant Configuration

```json
{
  "name": "Elise Scheduling Assistant",
  "model": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "firstMessage": "Hi! Thanks for calling. How can I help you today?",
  "serverUrl": "https://your-server.fly.dev/vapi/webhook",
  "tools": [
    // Custom tool definitions (see below)
  ]
}
```

### Custom Tool Definition Format

```json
{
  "type": "function",
  "function": {
    "name": "check_availability",
    "description": "Check available appointment slots for a provider on a date",
    "parameters": {
      "type": "object",
      "properties": {
        "provider_name": {
          "type": "string",
          "description": "Name of the doctor, or 'any' for any available provider"
        },
        "date": {
          "type": "string",
          "description": "Date to check in YYYY-MM-DD format, or relative like 'tomorrow'"
        }
      },
      "required": ["date"]
    }
  },
  "server": {
    "url": "https://your-server.fly.dev/vapi/tools"
  }
}
```

### Webhook Request (Tool Invocation)

When VAPI's LLM decides to call a tool, it sends a POST to our server:

```json
POST /vapi/tools
Headers:
  Authorization: Bearer <VAPI_API_KEY>
  Content-Type: application/json

Body:
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "call-uuid-here",
      "phoneNumber": {
        "from": "+15551234567",
        "to": "+15559876543"
      }
    },
    "toolCallList": [
      {
        "id": "toolu_01DTPAzUm5Gk3zxrpJ969oMF",
        "name": "check_availability",
        "arguments": {
          "provider_name": "any",
          "date": "2024-01-15"
        }
      }
    ]
  }
}
```

### Webhook Response Format

Our server must respond with results matching each tool call:

```json
{
  "results": [
    {
      "toolCallId": "toolu_01DTPAzUm5Gk3zxrpJ969oMF",
      "result": "I found 4 available slots on January 15th: 9am, 10am, 2pm, and 3pm with Dr. Smith. Would you like to book one of these?"
    }
  ]
}
```

### Built-in Tools

**transferCall** - Transfer to another number (for escalation):
```json
{
  "type": "transferCall",
  "destinations": [
    { "type": "number", "number": "+15038072108" }
  ]
}
```

**endCall** - Terminate the call:
```json
{
  "type": "endCall"
}
```

**sms** - Send text message (requires Twilio):
```json
{
  "type": "sms"
}
```

### Assistant Hooks (Automatic Actions)

Hooks trigger actions on specific events:

```json
{
  "hooks": [
    {
      "on": "call.ending",
      "filters": [
        { "type": "endedReason", "endedReason": "pipeline-error" }
      ],
      "actions": [
        { "type": "say", "message": "I'm having technical difficulties. Let me transfer you to someone who can help." },
        { "type": "tool", "tool": "transferCall" }
      ]
    }
  ]
}
```

**Available Events:**
- `call.ending` - Call is ending
- `assistant.speech.interrupted` - Assistant interrupted
- `customer.speech.interrupted` - Customer interrupted
- `customer.speech.timeout` - Customer silent too long

### Outbound Calls (Waitlist)

To initiate an outbound call (e.g., for waitlist notification):

```json
POST https://api.vapi.ai/call
{
  "phoneNumberId": "your-vapi-phone-id",
  "customer": { "number": "+15551234567" },
  "assistantId": "your-assistant-id",
  "assistantOverrides": {
    "firstMessage": "Hi! This is a call from Dr. Smith's office. We had a cancellation and wanted to see if you'd like an earlier appointment."
  }
}
```

### Sources

- [VAPI Custom Tools](https://docs.vapi.ai/tools/custom-tools)
- [VAPI Default Tools](https://docs.vapi.ai/tools/default-tools)
- [VAPI Assistant Hooks](https://docs.vapi.ai/assistants/assistant-hooks)
- [VAPI Appointment Scheduling Example](https://docs.vapi.ai/assistants/examples/appointment-scheduling)

---

## 3. Database Schema

### Design Principles

1. **Single-tenant for demo** - All tables include `tenant_id` for future multi-tenancy, but demo uses one tenant
2. **Postgres for everything** - Data, cache, job queue in one database
3. **Sync from MRS** - Local copies of patients, providers, slots; MRS is source of truth
4. **Optimistic locking** - Version column on availability prevents double-booking

### Schema

```sql
-- ============================================
-- CORE ENTITIES (synced from OpenMRS)
-- ============================================

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT NOT NULL,                    -- OpenMRS patient UUID
  name TEXT NOT NULL,
  given_name TEXT,
  family_name TEXT,
  dob DATE,
  gender TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mrs_id)
);

CREATE TABLE patient_phones (
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_type TEXT,                         -- 'mobile', 'home', 'work'
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (patient_id, phone)
);
CREATE INDEX idx_patient_phones_lookup ON patient_phones(phone);

CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT NOT NULL,                    -- OpenMRS provider UUID
  name TEXT NOT NULL,
  specialty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mrs_id)
);

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT NOT NULL,                    -- OpenMRS location UUID
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mrs_id)
);

CREATE TABLE appointment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER,
  description TEXT,
  UNIQUE (tenant_id, mrs_id)
);

-- ============================================
-- SCHEDULING
-- ============================================

CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT,                             -- OpenMRS timeslot UUID (nullable for locally-created)
  provider_id UUID NOT NULL REFERENCES providers(id),
  location_id UUID REFERENCES locations(id),
  appointment_type_id UUID REFERENCES appointment_types(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_booked BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,               -- Optimistic locking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mrs_id)
);
CREATE INDEX idx_availability_search ON availability(tenant_id, provider_id, start_time, is_booked);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  mrs_id TEXT,                             -- OpenMRS appointment UUID
  patient_id UUID NOT NULL REFERENCES patients(id),
  slot_id UUID NOT NULL REFERENCES availability(id),
  status TEXT NOT NULL DEFAULT 'scheduled',
    -- 'scheduled', 'confirmed', 'arrived', 'in_service', 'completed', 'cancelled', 'no_show'
  reason TEXT,
  cancel_reason TEXT,
  booked_via TEXT DEFAULT 'voice',         -- 'voice', 'chat', 'sync', 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mrs_id)
);
CREATE INDEX idx_appointments_patient ON appointments(patient_id, status);
CREATE INDEX idx_appointments_status ON appointments(tenant_id, status);

-- ============================================
-- WAITLIST
-- ============================================

CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  patient_id UUID NOT NULL REFERENCES patients(id),
  provider_id UUID REFERENCES providers(id),  -- NULL = any provider
  appointment_type_id UUID REFERENCES appointment_types(id),
  preferred_date_start DATE,
  preferred_date_end DATE,
  preferred_time_of_day TEXT,              -- 'any', 'morning', 'afternoon'
  status TEXT NOT NULL DEFAULT 'waiting',
    -- 'waiting', 'offered', 'booked', 'declined', 'expired'
  priority INTEGER DEFAULT 0,              -- Higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_contacted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_waitlist_active ON waitlist_entries(tenant_id, status, created_at)
  WHERE status = 'waiting';

-- ============================================
-- JOB QUEUE
-- ============================================

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL,
    -- 'sync_mrs', 'send_reminder', 'waitlist_outbound_call', 'send_confirmation_sms'
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  priority INTEGER DEFAULT 0,              -- Higher = process first
  run_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_jobs_pending ON jobs(status, run_at, priority DESC)
  WHERE status = 'pending';

-- ============================================
-- CONVERSATIONS & AUDIT
-- ============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  external_id TEXT,                        -- VAPI call ID or chat session ID
  patient_id UUID REFERENCES patients(id), -- NULL until identified
  channel TEXT NOT NULL,                   -- 'voice', 'chat'
  caller_phone TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  outcome TEXT,
    -- 'booked', 'cancelled', 'rescheduled', 'info_only', 'escalated', 'abandoned'
  escalation_reason TEXT,
  transcript JSONB,                        -- Conversation history
  metadata JSONB                           -- Additional context
);
CREATE INDEX idx_conversations_patient ON conversations(patient_id);

CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  conversation_id UUID REFERENCES conversations(id),
  patient_id UUID REFERENCES patients(id),
  reason TEXT NOT NULL,
    -- 'verification_failed', 'patient_request', 'error', 'complex_situation'
  transferred_to TEXT,                     -- Phone number
  transfer_status TEXT,                    -- 'connected', 'voicemail', 'no_answer', 'failed'
  context_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

-- ============================================
-- SYNC STATE
-- ============================================

CREATE TABLE sync_state (
  tenant_id TEXT NOT NULL DEFAULT 'default',
  entity_type TEXT NOT NULL,               -- 'patients', 'providers', 'appointments', 'timeslots'
  last_sync_at TIMESTAMPTZ,
  last_sync_cursor TEXT,                   -- For pagination/incremental sync
  sync_status TEXT DEFAULT 'idle',         -- 'idle', 'running', 'failed'
  last_error TEXT,
  PRIMARY KEY (tenant_id, entity_type)
);

-- ============================================
-- OPTIMISTIC LOCKING FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION book_appointment(
  p_tenant_id TEXT,
  p_slot_id UUID,
  p_patient_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_booked_via TEXT DEFAULT 'voice'
) RETURNS TABLE(success BOOLEAN, message TEXT, appointment_id UUID) AS $$
DECLARE
  v_current_version INTEGER;
  v_is_booked BOOLEAN;
  v_appointment_id UUID;
BEGIN
  -- Lock the row and check state
  SELECT version, is_booked INTO v_current_version, v_is_booked
  FROM availability
  WHERE id = p_slot_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  -- Check if slot exists
  IF v_current_version IS NULL THEN
    RETURN QUERY SELECT false, 'Slot not found', NULL::UUID;
    RETURN;
  END IF;

  -- Check version (optimistic lock)
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT false, 'Slot was modified by another request. Please try again.', NULL::UUID;
    RETURN;
  END IF;

  -- Check availability
  IF v_is_booked THEN
    RETURN QUERY SELECT false, 'This slot is no longer available.', NULL::UUID;
    RETURN;
  END IF;

  -- Mark slot as booked
  UPDATE availability
  SET is_booked = true, version = version + 1, updated_at = NOW()
  WHERE id = p_slot_id AND tenant_id = p_tenant_id;

  -- Create appointment
  INSERT INTO appointments (tenant_id, patient_id, slot_id, status, reason, booked_via)
  VALUES (p_tenant_id, p_patient_id, p_slot_id, 'scheduled', p_reason, p_booked_via)
  RETURNING id INTO v_appointment_id;

  RETURN QUERY SELECT true, 'Appointment booked successfully', v_appointment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- JOB CLAIM FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION claim_job(p_tenant_id TEXT DEFAULT NULL)
RETURNS TABLE(
  job_id UUID,
  job_type TEXT,
  job_payload JSONB
) AS $$
DECLARE
  v_job_id UUID;
  v_job_type TEXT;
  v_job_payload JSONB;
BEGIN
  -- Claim the highest priority pending job
  SELECT id, type, payload INTO v_job_id, v_job_type, v_job_payload
  FROM jobs
  WHERE status = 'pending'
    AND run_at <= NOW()
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY priority DESC, run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Mark as processing
  UPDATE jobs
  SET status = 'processing', started_at = NOW(), attempts = attempts + 1, updated_at = NOW()
  WHERE id = v_job_id;

  RETURN QUERY SELECT v_job_id, v_job_type, v_job_payload;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Conversation Flow

### State Machine Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CONVERSATION STATES                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────┐                                                        │
│   │  GREETING   │  "Hi! Thanks for calling. How can I help you today?"   │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          ▼                                                               │
│   ┌─────────────────────┐                                                │
│   │  IDENTIFY_PATIENT   │                                                │
│   │                     │                                                │
│   │  1. Caller ID lookup│                                                │
│   │  2. Verify with DOB │                                                │
│   │  3. Or ask for info │                                                │
│   └──────────┬──────────┘                                                │
│              │                                                           │
│    ┌─────────┴─────────┐                                                 │
│    │                   │                                                 │
│    ▼                   ▼                                                 │
│ VERIFIED           ESCALATE                                              │
│    │               (transfer to 503-807-2108)                            │
│    │                                                                     │
│    ▼                                                                     │
│   ┌─────────────────────┐                                                │
│   │  DETERMINE_INTENT   │  Parse what patient wants to do                │
│   └──────────┬──────────┘                                                │
│              │                                                           │
│   ┌──────────┼──────────┬──────────┬──────────┐                          │
│   ▼          ▼          ▼          ▼          ▼                          │
│ BOOK     CANCEL    RESCHEDULE   CHECK     ADD_TO                         │
│          (flow)    (flow)     APPTS     WAITLIST                         │
│   │                                                                      │
│   ▼                                                                      │
│   ┌─────────────────────┐                                                │
│   │  EXECUTE_ACTION     │  Call appropriate tools                        │
│   └──────────┬──────────┘                                                │
│              │                                                           │
│              ▼                                                           │
│   ┌─────────────────────┐                                                │
│   │  CONFIRM_AND_CLOSE  │  "Anything else I can help with?"              │
│   └──────────┬──────────┘                                                │
│              │                                                           │
│    ┌─────────┴─────────┐                                                 │
│    ▼                   ▼                                                 │
│ MORE_HELP           END_CALL                                             │
│ (loop back)         "Have a great day!"                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Patient Identification Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    PATIENT IDENTIFICATION                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  VOICE CALL                                                              │
│  ──────────                                                              │
│                                                                          │
│    Incoming call with caller ID: +1-555-123-4567                         │
│                        │                                                 │
│                        ▼                                                 │
│               ┌─────────────────┐                                        │
│               │ Phone lookup in │                                        │
│               │ patient_phones  │                                        │
│               └────────┬────────┘                                        │
│                        │                                                 │
│            ┌───────────┴───────────┐                                     │
│            │                       │                                     │
│            ▼                       ▼                                     │
│     FOUND (1 match)          NOT FOUND                                   │
│            │                       │                                     │
│            ▼                       ▼                                     │
│  "Hi! Is this [Name]?"    "Thanks for calling!                           │
│            │               To look up your account,                      │
│            │               what's your date of birth?"                   │
│  ┌─────────┴─────────┐             │                                     │
│  │                   │             ▼                                     │
│  ▼                   ▼     ┌───────────────┐                             │
│ "Yes"              "No"   │ DOB lookup in │                              │
│  │                   │    │ patients table│                              │
│  │                   │    └───────┬───────┘                              │
│  │                   │            │                                      │
│  │                   │   ┌────────┴────────┐                             │
│  │                   │   │                 │                             │
│  │                   │   ▼                 ▼                             │
│  │                   │ 1 MATCH        0 or 2+ MATCHES                    │
│  │                   │   │                 │                             │
│  │                   │   │                 ▼                             │
│  │                   │   │    "And what's your first and last name?"     │
│  │                   │   │                 │                             │
│  │                   │   │                 ▼                             │
│  │                   │   │        ┌───────────────┐                      │
│  │                   │   │        │ Name + DOB    │                      │
│  │                   │   │        │ match lookup  │                      │
│  │                   │   │        └───────┬───────┘                      │
│  │                   │   │                │                              │
│  │                   │   │       ┌────────┴────────┐                     │
│  ▼                   ▼   ▼       ▼                 ▼                     │
│  │                   │   │    MATCH            NO MATCH                  │
│  │                   │   │       │                 │                     │
│  │                   │   │       │                 ▼                     │
│  │                   │   │       │         ┌──────────────┐              │
│  │                   │   │       │         │   ESCALATE   │              │
│  │                   │   │       │         │              │              │
│  │                   │   │       │         │ "I'm having  │              │
│  │                   │   │       │         │ trouble      │              │
│  │                   │   │       │         │ locating your│              │
│  │                   │   │       │         │ record. Let  │              │
│  │                   │   │       │         │ me transfer  │              │
│  │                   │   │       │         │ you."        │              │
│  │                   │   │       │         └──────────────┘              │
│  ▼                   ▼   ▼       ▼                                       │
│  ┌──────────────────────────────────────────┐                            │
│  │           VERIFY WITH DOB                │                            │
│  │                                          │                            │
│  │ "Great! And just to verify, what's your  │                            │
│  │  date of birth?"                         │                            │
│  │                                          │                            │
│  │           ┌────────────────┐             │                            │
│  │           │                │             │                            │
│  │           ▼                ▼             │                            │
│  │       MATCHES         DOESN'T MATCH      │                            │
│  │           │                │             │                            │
│  │           ▼                ▼             │                            │
│  │       VERIFIED         RETRY (max 2)     │                            │
│  │                        then ESCALATE     │                            │
│  └──────────────────────────────────────────┘                            │
│                                                                          │
│  CHAT (similar flow, but initiated with DOB request)                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Intent-Specific Flows

#### Book Appointment Flow

```
1. "I'd like to schedule an appointment"
2. "Do you have a preferred doctor, or would any available provider work?"
3. "And what date works best for you?"
4. [Tool: check_availability(provider, date)]
5. "I have these times available: [list]. Which works for you?"
6. Patient selects time
7. [Tool: book_appointment(slot_id, patient_id)]
   - If success: "You're all set! I've booked you for [date] at [time] with [provider]."
   - If conflict: "I'm sorry, that slot was just taken. Let me check again... [retry]"
8. "Is there anything else I can help you with?"
```

#### Cancel Appointment Flow

```
1. "I need to cancel my appointment"
2. [Tool: get_patient_appointments(patient_id)]
3. "I see you have an appointment on [date] at [time]. Is that the one you'd like to cancel?"
4. Patient confirms
5. "Would you like me to add you to our waitlist for an earlier appointment in the future?"
6. [Tool: cancel_appointment(appointment_id, add_to_waitlist)]
7. "Your appointment has been cancelled. [Waitlist message if applicable]"
8. "Is there anything else I can help you with?"
```

#### Reschedule Flow

```
1. "I need to reschedule my appointment"
2. [Tool: get_patient_appointments(patient_id)]
3. Identify which appointment
4. "What new date works better for you?"
5. [Tool: check_availability(provider, new_date)]
6. Present options
7. Patient selects
8. [Tool: book_appointment(new_slot_id, patient_id)]
9. If successful: [Tool: cancel_appointment(old_appointment_id)]
10. "I've rescheduled you from [old] to [new]. You're all set!"
```

### Escalation Triggers

| Trigger | Response |
|---------|----------|
| Patient says "speak to a person" / "human" / "representative" | Immediate transfer |
| Verification failed 3 times | Transfer with context |
| Tool returns error | "I'm having technical difficulties. Let me transfer you." |
| Patient sounds frustrated (detected) | Offer transfer: "Would you like me to connect you with someone?" |
| Medical emergency mentioned | Immediate transfer + flag as urgent |
| Complex insurance/billing questions | "Let me connect you with someone who can help with that." |

---

## 5. Tool Schemas

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Patient Context** | Server-side session | LLM doesn't need to track patient_id; our server maintains session state after verification |
| **Slot Selection UX** | Natural language (voice), numbered list (chat) | Voice should feel conversational; chat can show structured options |
| **Date Parsing** | Server-side parsing | More robust handling of "tomorrow", "next Tuesday", etc.; can ask clarifying questions |

### Tool: `identify_patient`

**Purpose:** Verify the caller's identity and establish session context.

**When Called:** Early in conversation, after greeting.

```json
{
  "type": "function",
  "function": {
    "name": "identify_patient",
    "description": "Verify the caller's identity using phone number and/or date of birth. Call this early in the conversation to establish who you're speaking with.",
    "parameters": {
      "type": "object",
      "properties": {
        "phone": {
          "type": "string",
          "description": "Caller's phone number (from caller ID or stated by patient)"
        },
        "date_of_birth": {
          "type": "string",
          "description": "Patient's date of birth in any format (e.g., 'March 15 1980', '03/15/1980', '1980-03-15')"
        },
        "name": {
          "type": "string",
          "description": "Patient's full name (use if DOB alone matches multiple patients)"
        }
      },
      "required": []
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
// Success - single match, verified
{
  "result": {
    "verified": true,
    "patient_id": "uuid-here",
    "patient_name": "John Smith",
    "message": "I found your record. Hi John!"
  }
}

// Partial - need more info
{
  "result": {
    "verified": false,
    "needs": "date_of_birth",
    "message": "I found a few patients with that name. Can you tell me your date of birth to verify?"
  }
}

// Failed - no match
{
  "result": {
    "verified": false,
    "needs": "escalate",
    "message": "I'm having trouble finding your record. Let me transfer you to someone who can help."
  }
}
```

---

### Tool: `check_availability`

**Purpose:** Find available appointment slots for booking.

```json
{
  "type": "function",
  "function": {
    "name": "check_availability",
    "description": "Check available appointment slots. Use this when the patient wants to schedule or reschedule an appointment.",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "description": "The date to check. Can be: 'today', 'tomorrow', 'next Monday', 'next week', 'January 15th', or 'YYYY-MM-DD' format."
        },
        "provider_name": {
          "type": "string",
          "description": "Doctor's name (e.g., 'Dr. Smith'), or 'any' for any available provider. Default is 'any'."
        },
        "time_of_day": {
          "type": "string",
          "enum": ["any", "morning", "afternoon"],
          "description": "Preferred time of day. Morning is before noon, afternoon is noon or later."
        },
        "appointment_type": {
          "type": "string",
          "description": "Type of appointment if specified (e.g., 'checkup', 'follow-up', 'physical')"
        }
      },
      "required": ["date"]
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
// Success - slots found
{
  "result": {
    "available": true,
    "date": "2024-01-15",
    "date_formatted": "Monday, January 15th",
    "slots": [
      {
        "slot_id": "uuid-1",
        "time": "9:00 AM",
        "provider_name": "Dr. Smith",
        "duration_minutes": 30,
        "version": 1
      },
      {
        "slot_id": "uuid-2",
        "time": "10:30 AM",
        "provider_name": "Dr. Smith",
        "duration_minutes": 30,
        "version": 1
      },
      {
        "slot_id": "uuid-3",
        "time": "2:00 PM",
        "provider_name": "Dr. Jones",
        "duration_minutes": 30,
        "version": 1
      }
    ],
    "message": "I have 3 openings on Monday the 15th: 9 AM and 10:30 AM with Dr. Smith, or 2 PM with Dr. Jones."
  }
}

// No availability
{
  "result": {
    "available": false,
    "date": "2024-01-15",
    "message": "I don't have any openings on January 15th.",
    "suggestion": "The next available date is January 17th. Would you like me to check that instead?"
  }
}

// Date parsing issue
{
  "result": {
    "available": false,
    "error": "ambiguous_date",
    "message": "I want to make sure I have the right date. Did you mean this coming Friday, January 12th, or Friday the 19th?"
  }
}
```

---

### Tool: `book_appointment`

**Purpose:** Reserve an appointment slot for the patient.

```json
{
  "type": "function",
  "function": {
    "name": "book_appointment",
    "description": "Book an appointment slot for the patient. Only call this after the patient has confirmed they want a specific time slot.",
    "parameters": {
      "type": "object",
      "properties": {
        "slot_id": {
          "type": "string",
          "description": "The UUID of the slot to book (from check_availability results)"
        },
        "slot_version": {
          "type": "integer",
          "description": "The version number of the slot (from check_availability results) - used to prevent double-booking"
        },
        "reason": {
          "type": "string",
          "description": "Reason for the appointment (e.g., 'annual checkup', 'follow-up for back pain')"
        }
      },
      "required": ["slot_id", "slot_version"]
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
// Success
{
  "result": {
    "success": true,
    "appointment_id": "uuid-here",
    "confirmation": {
      "date": "Monday, January 15th",
      "time": "9:00 AM",
      "provider": "Dr. Smith",
      "location": "Main Street Clinic",
      "duration": "30 minutes"
    },
    "message": "You're all set! I've booked you for Monday, January 15th at 9 AM with Dr. Smith at Main Street Clinic."
  }
}

// Conflict - slot taken
{
  "result": {
    "success": false,
    "error": "slot_taken",
    "message": "I'm sorry, that slot was just booked by someone else.",
    "alternatives": [
      {
        "slot_id": "uuid-alt-1",
        "time": "10:30 AM",
        "provider_name": "Dr. Smith",
        "version": 1
      }
    ],
    "suggestion": "The 10:30 AM slot is still available. Would you like that instead?"
  }
}
```

---

### Tool: `get_patient_appointments`

**Purpose:** List the patient's existing appointments.

```json
{
  "type": "function",
  "function": {
    "name": "get_patient_appointments",
    "description": "Get the patient's upcoming appointments. Use this when they want to check, cancel, or reschedule an existing appointment.",
    "parameters": {
      "type": "object",
      "properties": {
        "include_past": {
          "type": "boolean",
          "description": "Whether to include past appointments. Default is false (upcoming only)."
        }
      },
      "required": []
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
// Has appointments
{
  "result": {
    "appointments": [
      {
        "appointment_id": "uuid-1",
        "date": "Monday, January 15th",
        "time": "9:00 AM",
        "provider_name": "Dr. Smith",
        "appointment_type": "Annual Checkup",
        "status": "scheduled",
        "location": "Main Street Clinic"
      },
      {
        "appointment_id": "uuid-2",
        "date": "Wednesday, February 7th",
        "time": "2:30 PM",
        "provider_name": "Dr. Jones",
        "appointment_type": "Follow-up",
        "status": "scheduled",
        "location": "Main Street Clinic"
      }
    ],
    "message": "You have 2 upcoming appointments: one on Monday, January 15th at 9 AM with Dr. Smith, and another on February 7th at 2:30 PM with Dr. Jones."
  }
}

// No appointments
{
  "result": {
    "appointments": [],
    "message": "You don't have any upcoming appointments scheduled."
  }
}
```

---

### Tool: `cancel_appointment`

**Purpose:** Cancel an existing appointment.

```json
{
  "type": "function",
  "function": {
    "name": "cancel_appointment",
    "description": "Cancel an existing appointment. Ask the patient if they want to be added to the waitlist for an earlier future appointment.",
    "parameters": {
      "type": "object",
      "properties": {
        "appointment_id": {
          "type": "string",
          "description": "The UUID of the appointment to cancel"
        },
        "reason": {
          "type": "string",
          "description": "Reason for cancellation"
        },
        "add_to_waitlist": {
          "type": "boolean",
          "description": "Whether to add the patient to the waitlist for earlier appointments"
        }
      },
      "required": ["appointment_id"]
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
// Success with waitlist
{
  "result": {
    "success": true,
    "cancelled_appointment": {
      "date": "Monday, January 15th",
      "time": "9:00 AM",
      "provider": "Dr. Smith"
    },
    "waitlist_added": true,
    "message": "I've cancelled your appointment on January 15th. You're on our waitlist, and we'll call you if an earlier slot opens up."
  }
}

// Success without waitlist
{
  "result": {
    "success": true,
    "cancelled_appointment": {
      "date": "Monday, January 15th",
      "time": "9:00 AM",
      "provider": "Dr. Smith"
    },
    "waitlist_added": false,
    "message": "I've cancelled your appointment on January 15th."
  }
}
```

**Side Effect:** When an appointment is cancelled, the system automatically checks the waitlist and may trigger outbound calls to waitlisted patients.

---

### Tool: `add_to_waitlist`

**Purpose:** Add patient to waitlist for earlier appointment openings.

```json
{
  "type": "function",
  "function": {
    "name": "add_to_waitlist",
    "description": "Add the patient to the waitlist to be notified if an earlier appointment becomes available.",
    "parameters": {
      "type": "object",
      "properties": {
        "preferred_provider": {
          "type": "string",
          "description": "Preferred doctor's name, or 'any' for any provider"
        },
        "date_range_start": {
          "type": "string",
          "description": "Earliest acceptable date"
        },
        "date_range_end": {
          "type": "string",
          "description": "Latest acceptable date"
        },
        "time_preference": {
          "type": "string",
          "enum": ["any", "morning", "afternoon"],
          "description": "Preferred time of day"
        }
      },
      "required": []
    }
  },
  "server": {
    "url": "{{SERVER_URL}}/vapi/tools"
  }
}
```

**Response Examples:**

```json
{
  "result": {
    "success": true,
    "waitlist_position": 3,
    "message": "You're on the waitlist. You're currently number 3 in line. We'll call you if something opens up that matches your preferences."
  }
}
```

---

## 6. Sync Logic

### Overview

The sync service keeps our local Context Store synchronized with OpenMRS. Since OpenMRS may not handle high-frequency API calls well, we cache data locally and sync periodically.

### Sync Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYNC ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────────┐                                  │
│                    │     OpenMRS         │                                  │
│                    │  (Source of Truth   │                                  │
│                    │   for master data)  │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                               │ Poll every 5 minutes                        │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │    SYNC SERVICE     │                                  │
│                    │                     │                                  │
│                    │ • Fetch changes     │                                  │
│                    │ • Transform data    │                                  │
│                    │ • Upsert locally    │                                  │
│                    │ • Handle conflicts  │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
│                               ▼                                             │
│                    ┌─────────────────────┐                                  │
│                    │   CONTEXT STORE     │                                  │
│                    │   (PostgreSQL)      │                                  │
│                    │                     │                                  │
│                    │ • Fast queries      │                                  │
│                    │ • Real-time updates │                                  │
│                    │ • Agent operations  │                                  │
│                    └─────────────────────┘                                  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  DATA FLOW DIRECTION                                                        │
│                                                                             │
│  PATIENTS, PROVIDERS, LOCATIONS, TIME SLOTS:                                │
│     OpenMRS → Context Store (one-way sync)                                  │
│                                                                             │
│  APPOINTMENTS:                                                              │
│     Bidirectional:                                                          │
│     • We create appointments → push to OpenMRS                              │
│     • OpenMRS appointments → sync to Context Store                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sync Jobs

| Job Type | Frequency | Description |
|----------|-----------|-------------|
| `sync_patients` | Every 10 min | Fetch new/updated patients |
| `sync_providers` | Every 30 min | Fetch provider list |
| `sync_timeslots` | Every 5 min | Fetch available slots |
| `sync_appointments` | Every 5 min | Bidirectional appointment sync |
| `full_sync` | Daily at 2 AM | Complete refresh of all data |

### Conflict Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFLICT RESOLUTION RULES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCENARIO                           RESOLUTION                              │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  Patient data differs               OpenMRS wins (source of truth)          │
│                                                                             │
│  Appointment exists in OpenMRS      Import to Context Store                 │
│  but not locally                                                            │
│                                                                             │
│  Appointment exists locally         Flag for review; likely a sync          │
│  but not in OpenMRS                 failure or manual deletion              │
│                                                                             │
│  Slot booked in OpenMRS but         Mark as booked locally; log as          │
│  shows available locally            "external booking"                      │
│                                                                             │
│  Slot booked locally but            Should not happen (we push to           │
│  available in OpenMRS               OpenMRS immediately); if it does,       │
│                                     our booking takes precedence            │
│                                                                             │
│  OpenMRS demo resets                Detect via missing data; trigger        │
│                                     full re-sync; notify admin              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sync Service Implementation

```typescript
interface SyncService {
  // Individual entity sync
  syncPatients(): Promise<SyncResult>;
  syncProviders(): Promise<SyncResult>;
  syncLocations(): Promise<SyncResult>;
  syncTimeSlots(): Promise<SyncResult>;
  syncAppointments(): Promise<SyncResult>;

  // Full sync
  fullSync(): Promise<SyncResult>;

  // Push local changes to MRS
  pushAppointmentToMRS(appointmentId: string): Promise<void>;
  pushCancellationToMRS(appointmentId: string): Promise<void>;
}

interface SyncResult {
  entity: string;
  created: number;
  updated: number;
  deleted: number;
  errors: SyncError[];
  duration_ms: number;
}
```

### Handling OpenMRS Demo Resets

The OpenMRS demo instance periodically resets. We handle this by:

1. **Detection:** If a full sync finds < 50% of expected records, flag as potential reset
2. **Recovery:**
   - Clear local data that references MRS IDs
   - Run full sync to repopulate
   - Log/alert admin
3. **Graceful degradation:** During reset recovery, the agent can still:
   - Take messages ("Let me have someone call you back")
   - Add to waitlist (stored locally)
   - Transfer to human

### Incremental vs Full Sync

**OpenMRS Limitation:** The appointment scheduling module doesn't have great support for "changed since" queries.

**Our Approach:**
- **Time slots:** Query by date range (today + 30 days); compare with local
- **Appointments:** Query by date range; compare with local
- **Patients:** Fetch all and compare (for demo scale this is fine; production would need pagination/filtering)
- **Providers/Locations:** Small datasets, full refresh is fine

### Sync State Tracking

```sql
-- Track sync progress
UPDATE sync_state
SET
  last_sync_at = NOW(),
  last_sync_cursor = 'page-token-or-timestamp',
  sync_status = 'completed'
WHERE tenant_id = 'default' AND entity_type = 'appointments';
```

---

## 7. System Prompt

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Clinic Identity** | "JoshDoc" (tenant-specific) | Phone number maps to tenant; each tenant can have custom name |
| **Personality** | Professional but not robotic | Healthcare context demands professionalism; warmth builds trust |
| **Proactive Offers** | Yes | Offer follow-ups, reminders, waitlist—improves patient care |
| **Confirmation Style** | Brief | "Monday at 9 AM with Dr. Smith" not lengthy recaps |

### System Prompt

```
# Identity & Role

You are the scheduling assistant for JoshDoc, a healthcare clinic. Your job is to help patients:
- Schedule new appointments
- Check their existing appointments
- Cancel or reschedule appointments
- Join the waitlist for earlier openings

You have access to the clinic's scheduling system through tools. Always use the tools to look up real information—never make up appointment times or availability.

# Tone & Style

- Professional and competent, but not robotic or cold
- Keep responses concise—under 25 words when possible
- Speak naturally for a phone conversation
- Use the patient's name occasionally to personalize
- Be direct: "Let me check that" not "Sorry, I need to check"
- When things go wrong, stay calm and solution-focused

Good: "I have a few openings on Tuesday. Would 9 AM or 2 PM work better?"
Bad: "I apologize, but I need to check our system. Please hold while I look up the available appointment slots for you."

# Conversation Flow

1. **Greeting**: Brief, professional welcome
2. **Identification**: Verify who you're speaking with (required before any scheduling)
3. **Intent**: Understand what they need
4. **Action**: Use tools to help them
5. **Confirmation**: Confirm the outcome briefly
6. **Proactive offer**: Suggest related services if appropriate
7. **Wrap-up**: Check if anything else, then close warmly

# Tool Usage

## identify_patient
Call this FIRST before any scheduling actions. Use caller ID phone number initially. If verification fails, ask for date of birth, then name if needed.

## check_availability
Use when patient wants to book or reschedule. Ask for preferred date. For vague requests like "next week," pick a specific day and offer alternatives.

## book_appointment
ONLY call after patient confirms a specific slot. Always include slot_version to prevent double-booking.

## get_patient_appointments
Use when patient asks about existing appointments or wants to cancel/reschedule.

## cancel_appointment
After confirming which appointment, ask if they'd like to join the waitlist before cancelling.

## add_to_waitlist
Offer when:
- No slots on preferred date
- Patient is cancelling but might want earlier slot
- Patient asks about waitlist

# Patient Identification

**If caller ID matches a patient:**
"Hi, is this [Name]?"
- Yes → "Great. What's your date of birth to verify?"
- No → "No problem. What's your date of birth?"

**If no caller ID match:**
"Thanks for calling JoshDoc. What's your date of birth so I can pull up your account?"

**If DOB matches multiple:**
"I found a few accounts. What's your first and last name?"

**If verification fails after 2 attempts:**
"I'm having trouble locating your record. Let me transfer you to someone who can help."
→ Use transferCall tool

# Proactive Service Offers

After completing the patient's request, offer relevant follow-ups:

**After booking:**
- "Do you need to schedule a follow-up appointment as well?"
- "Would you like a reminder text the day before?"

**After cancelling:**
- "Would you like to reschedule, or should I add you to our waitlist?"

**If booking far out:**
- "That's a few weeks away. Want me to add you to the waitlist in case something opens sooner?"

**After any completed action:**
- "Is there anything else I can help you with today?"

Keep offers brief and natural—one offer per interaction, don't overwhelm.

# Error Handling

**Tool error:**
"I'm having trouble with our system. Let me transfer you to someone who can help."
→ Use transferCall

**Slot just taken:**
"That time was just booked. Let me check what else is available..."
→ Call check_availability again

**No availability:**
"I don't have openings on [date]. Want me to check [next day], or add you to our waitlist?"

**Unclear request:**
"I want to make sure I have this right—did you say [understanding]?"

**Long processing:**
"Let me check on that..." (don't leave silence)

# Escalation Rules

Transfer to human (503-807-2108) when:

1. Verification fails after 2-3 attempts
2. Patient asks for a human
3. Technical errors block progress
4. Questions outside scheduling (billing, insurance, medical advice)
5. Patient is frustrated or upset
6. Medical urgency ("emergency", "severe pain")

Before transfer: "Let me connect you with someone who can help."

# Constraints

**Never:**
- Make up availability—always use check_availability
- Confirm booking without calling book_appointment
- Give medical advice
- Discuss billing or insurance (transfer instead)
- Repeat back sensitive info (full DOB, SSN) unnecessarily
- Argue with patients—offer to transfer if upset
- Say "I don't know"—look it up or transfer
- Leave long silences—narrate what you're doing

# Context

- Clinic: JoshDoc
- Hours: Monday-Friday, 8 AM - 5 PM
- Appointment length: 30 minutes (typical)
- Booking window: Up to 30 days in advance
- Escalation number: 503-807-2108
- Today's date: {{CURRENT_DATE}}
```

### Example Conversations

**Happy Path: New Booking**
```
Assistant: Hi, thanks for calling JoshDoc. How can I help you?
Patient: I need to schedule a checkup.
Assistant: I can help with that. Is this Sarah?
Patient: Yes.
Assistant: Great. What's your date of birth to verify?
Patient: March 15, 1985.
Assistant: Perfect. When would you like to come in?
Patient: Sometime next week?
Assistant: Let me check Tuesday. [calls check_availability] I have 9 AM or 2:30 PM with Dr. Smith. Which works better?
Patient: 9 AM.
Assistant: [calls book_appointment] You're set for Tuesday at 9 AM with Dr. Smith. Need a follow-up scheduled too?
Patient: No, that's it.
Assistant: Sounds good. Anything else I can help with?
Patient: Nope, thanks!
Assistant: Have a great day.
```

**Handling Conflict**
```
Assistant: [calls book_appointment, gets conflict] That slot was just taken. Let me check again... [calls check_availability] I still have 2:30 PM available. Would that work?
Patient: Sure.
Assistant: [calls book_appointment] Done. Tuesday at 2:30 with Dr. Smith.
```

**Escalation**
```
Patient: I have a question about my bill.
Assistant: I'll connect you with someone who can help with billing. One moment.
[calls transferCall]
```

**Proactive Waitlist Offer**
```
Patient: I need an appointment this week.
Assistant: [calls check_availability] I don't have anything this week. The earliest is next Tuesday. Want me to book that, or add you to our waitlist in case something opens sooner?
Patient: Both, actually.
Assistant: [calls book_appointment] You're set for Tuesday at 10 AM. [calls add_to_waitlist] And you're on the waitlist—we'll call if something opens up sooner.
```
