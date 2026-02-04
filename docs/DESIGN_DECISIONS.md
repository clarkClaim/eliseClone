# Design Decisions

This document captures the key architectural decisions, tradeoffs, and rationale behind the Elise Clone system. It serves as both documentation and a reference for discussing the system design.

---

## Table of Contents

1. [Overview](#overview)
2. [HIPAA & Compliance](#1-hipaa--compliance)
3. [Patient Identification](#2-patient-identification)
4. [Concurrency & Double-Booking Prevention](#3-concurrency--double-booking-prevention)
5. [Failure Handling & Escalation](#4-failure-handling--escalation)
6. [Multi-Tenancy](#5-multi-tenancy)
7. [Technology Choices](#6-technology-choices)
8. [What We'd Do Differently in Production](#7-what-wed-do-differently-in-production)

---

## Overview

Elise Clone is an AI-powered healthcare scheduling system supporting voice (VAPI) and chat interfaces. The system integrates with medical record systems (MRS) to manage appointments without overbooking.

**Core Design Principles:**

| Principle | Description |
|-----------|-------------|
| **Postgres for Everything** | Single database for data, cache, and job queue |
| **Unified Agent Core** | Same conversation logic for voice and chat |
| **MRS Abstraction** | Swap MRS backends without changing core logic |
| **Database-per-Tenant** | Strongest data isolation for healthcare |
| **Graceful Degradation** | Human fallback when AI fails |

---

## 1. HIPAA & Compliance

### Context

Healthcare applications must comply with HIPAA (Health Insurance Portability and Accountability Act) regulations for handling Protected Health Information (PHI). This includes patient names, dates of birth, medical records, and appointment information.

### Decision: Technical Support Without Full Compliance

For this demo, we implement the **technical foundations** that would support HIPAA compliance, without the full operational compliance overhead (BAAs, audits, etc.).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HIPAA: DEMO vs PRODUCTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Requirement              Demo Implementation       Production Addition     │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  Encryption at Rest       ✅ Fly.io Postgres        Same                    │
│                              (automatic)                                    │
│                                                                             │
│  Encryption in Transit    ✅ TLS everywhere         Same                    │
│                                                                             │
│  Audit Logging            ⚪ Schema exists,         Full PHI tracking,      │
│                              not enforced           SIEM integration        │
│                                                                             │
│  PHI in Logs              ⚪ Log freely             Scrub or encrypt        │
│                              (demo only)                                    │
│                                                                             │
│  BAAs                     ⚪ Documented need        Execute agreements      │
│                                                                             │
│  Access Controls          ✅ Tenant isolation       Add RBAC, MFA, SSO      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Legend: ✅ = Implemented   ⚪ = Acknowledged, minimal implementation
```

### What We Get for Free

**Encryption at Rest:** Fly.io Postgres includes encryption at rest by default. No additional configuration or cost.

**Encryption in Transit:** All connections use TLS:
- HTTPS for all API endpoints
- TLS for database connections
- TLS for OpenMRS API calls
- TLS for VAPI webhooks

### Audit Log Schema (Structure Only)

We define the schema to show architectural awareness, even if not fully utilized in the demo:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who
  actor_type TEXT NOT NULL,           -- 'patient', 'agent', 'system', 'admin'
  actor_id TEXT NOT NULL,
  session_id UUID,

  -- What
  action TEXT NOT NULL,               -- 'read', 'create', 'update', 'delete'
  resource_type TEXT NOT NULL,        -- 'patient', 'appointment', etc.
  resource_id TEXT NOT NULL,

  -- Context
  phi_accessed BOOLEAN DEFAULT false,
  ip_address INET,
  user_agent TEXT
);
```

### Rationale

- **Why not full HIPAA:** Operational compliance requires BAAs with every vendor, formal policies, training, and audits. This is appropriate for production, not a demo.
- **Why implement technical hooks:** Demonstrates understanding of requirements. The architecture supports compliance—it's a configuration/process addition, not a rewrite.

### Interview Talking Points

> "For the demo, encryption at rest and in transit are automatic with Fly.io. The audit log schema exists to show we've thought about PHI tracking. In production, we'd execute BAAs with VAPI, Fly.io, and any LLM providers, implement log scrubbing, and integrate with a HIPAA-compliant SIEM for audit trails."

---

## 2. Patient Identification

### Context

Before scheduling an appointment, we must verify who the patient is. This is both a security requirement (HIPAA) and a practical necessity (can't book appointments for unknown patients).

### Decision: Multi-Factor Verification with Graceful Fallback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PATIENT IDENTIFICATION FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VOICE CALL                                                                 │
│  ──────────                                                                 │
│                                                                             │
│       Incoming Call                                                         │
│            │                                                                │
│            ▼                                                                │
│    ┌───────────────┐                                                        │
│    │ Caller ID     │                                                        │
│    │ Lookup        │                                                        │
│    └───────┬───────┘                                                        │
│            │                                                                │
│     ┌──────┴──────┐                                                         │
│     │             │                                                         │
│     ▼             ▼                                                         │
│  MATCH         NO MATCH                                                     │
│     │             │                                                         │
│     ▼             ▼                                                         │
│  "Hi, is       "Can I get your date of birth?"                              │
│   this              │                                                       │
│   [Name]?"          ▼                                                       │
│     │         ┌─────────────┐                                               │
│     │         │ DOB Lookup  │                                               │
│     │         └──────┬──────┘                                               │
│     │                │                                                      │
│     │         ┌──────┴──────┐                                               │
│     │         │             │                                               │
│     │         ▼             ▼                                               │
│     │      MATCH       MULTIPLE/NONE                                        │
│     │         │             │                                               │
│     ▼         ▼             ▼                                               │
│  ┌────────────────┐   "What's your address?" or                             │
│  │ VERIFY: "What's│   "Last 4 of SSN?"                                      │
│  │ your DOB?"     │         │                                               │
│  └────────┬───────┘         ▼                                               │
│           │           ┌─────────────┐                                       │
│           ▼           │ Still no    │                                       │
│     ┌─────────┐       │ match?      │                                       │
│     │VERIFIED │       └──────┬──────┘                                       │
│     └────┬────┘              │                                              │
│          │                   ▼                                              │
│          │         TRANSFER TO HUMAN (503-807-2108)                         │
│          │                                                                  │
│          ▼                                                                  │
│    PROCEED WITH SCHEDULING                                                  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CHAT                                                                       │
│  ────                                                                       │
│                                                                             │
│  Option A: Magic Link (Recommended)                                         │
│     1. User enters phone number                                             │
│     2. SMS with one-time link sent                                          │
│     3. Click verifies phone ownership                                       │
│     4. Phone lookup confirms identity                                       │
│                                                                             │
│  Option B: Inline Verification (Fallback)                                   │
│     1. Collect name + DOB + one more factor                                 │
│     2. Match against patient database                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Schema

```sql
-- Phone number index for caller ID lookup
CREATE TABLE patient_phones (
  patient_id UUID REFERENCES patients(id),
  phone TEXT NOT NULL,
  phone_type TEXT,              -- 'mobile', 'home', 'work'
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  PRIMARY KEY (patient_id, phone)
);

CREATE INDEX idx_patient_phones_lookup ON patient_phones(phone);

-- Track verification attempts (security audit)
CREATE TABLE verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  channel TEXT NOT NULL,        -- 'voice', 'chat'
  phone_presented TEXT,
  patient_matched UUID REFERENCES patients(id),
  verification_method TEXT,     -- 'caller_id', 'dob', 'ssn_last4', 'address'
  success BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Rationale

- **Caller ID first:** Fastest path for returning patients calling from known numbers
- **DOB as primary verifier:** Universally known by patients, not publicly available
- **Secondary factors for ambiguity:** Address or SSN last 4 when DOB matches multiple records
- **Human fallback:** If we can't identify them, don't guess—transfer to human

### Interview Talking Points

> "Patient identification balances security with UX. We start with caller ID lookup for zero-friction returning patients. If that fails, DOB is our primary verifier—it's something patients know but isn't publicly searchable like name. For edge cases like common DOBs or unregistered phones, we escalate to a human rather than risk booking for the wrong patient."

---

## 3. Concurrency & Double-Booking Prevention

### Context

Two patients viewing the same appointment slot simultaneously could both try to book it. Without protection, this results in double-booking.

### Decision: Two-Layer Protection (Soft Holds + Optimistic Locking)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOUBLE-BOOKING PREVENTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  THE PROBLEM                                                                │
│  ───────────                                                                │
│                                                                             │
│  Patient A: "Is 3pm available?"                                             │
│       │                                                                     │
│       ├────────▶ [Check: YES] ─────────────────────┐                        │
│       │                                            │                        │
│       │    Patient B: "Is 3pm available?"          │                        │
│       │         │                                  │                        │
│       │         ├────────▶ [Check: YES] ───────┐   │                        │
│       │         │                              │   │                        │
│       │         │         ┌────────────────────┼───┘                        │
│       │         │         ▼                    │                            │
│       │         │    A: "Book it!" ─────▶ ✅ BOOKED                         │
│       │         │                              │                            │
│       │         │         ┌────────────────────┘                            │
│       │         │         ▼                                                 │
│       │         │    B: "Book it!" ─────▶ ❌ CONFLICT!                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  SOLUTION: TWO LAYERS                                                       │
│  ────────────────────                                                       │
│                                                                             │
│  Layer 1: SOFT HOLDS (while browsing/deciding)                              │
│                                                                             │
│     Patient starts looking at slot                                          │
│            │                                                                │
│            ▼                                                                │
│     ┌─────────────────────┐                                                 │
│     │ Place 5-minute hold │──── Other patients see "slot may be busy"       │
│     └──────────┬──────────┘                                                 │
│                │                                                            │
│         ┌──────┴──────┐                                                     │
│         │             │                                                     │
│         ▼             ▼                                                     │
│      BOOKS         ABANDONS                                                 │
│         │             │                                                     │
│         ▼             ▼                                                     │
│    Hold converts   Hold expires                                             │
│    to booking      after 5 min                                              │
│                                                                             │
│  Layer 2: OPTIMISTIC LOCKING (at booking time)                              │
│                                                                             │
│     Even with holds, we use version numbers for safety:                     │
│                                                                             │
│     1. Read slot with version (e.g., version=3)                             │
│     2. Attempt booking: "UPDATE ... WHERE version=3"                        │
│     3. If version changed → slot was modified → reject                      │
│     4. If version matches → book and increment version                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Schema

```sql
-- Soft holds for browsing
CREATE TABLE slot_holds (
  slot_id UUID REFERENCES availability(id),
  session_id UUID NOT NULL,
  held_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes',
  PRIMARY KEY (slot_id)
);

-- Availability table with version for optimistic locking
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,           -- Optimistic lock version
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Booking Function (Postgres)

```sql
CREATE OR REPLACE FUNCTION book_appointment(
  p_slot_id UUID,
  p_patient_id UUID,
  p_expected_version INTEGER
) RETURNS TABLE(success BOOLEAN, message TEXT, appointment_id UUID) AS $$
DECLARE
  v_current_version INTEGER;
  v_is_available BOOLEAN;
  v_appointment_id UUID;
BEGIN
  -- Lock the row
  SELECT version, is_available INTO v_current_version, v_is_available
  FROM availability WHERE id = p_slot_id
  FOR UPDATE;

  -- Check version hasn't changed (optimistic lock)
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT false, 'Slot was modified, please refresh', NULL::UUID;
    RETURN;
  END IF;

  -- Check still available
  IF NOT v_is_available THEN
    RETURN QUERY SELECT false, 'Slot is no longer available', NULL::UUID;
    RETURN;
  END IF;

  -- Book it
  UPDATE availability
  SET is_available = false, version = version + 1, updated_at = NOW()
  WHERE id = p_slot_id;

  INSERT INTO appointments (patient_id, slot_id, status)
  VALUES (p_patient_id, p_slot_id, 'booked')
  RETURNING id INTO v_appointment_id;

  RETURN QUERY SELECT true, 'Appointment booked', v_appointment_id;
END;
$$ LANGUAGE plpgsql;
```

### Rationale

- **Soft holds reduce contention:** If Patient A is actively looking at 3pm, Patient B gets nudged toward other slots
- **Holds expire automatically:** No stale locks if patient abandons mid-conversation
- **Optimistic locking is the safety net:** Even if holds fail, the version check catches conflicts
- **Postgres-native:** No Redis or external locking service needed

### Interview Talking Points

> "Double-booking prevention uses two layers. Soft holds reduce contention during browsing—if you're looking at a slot, others see it might be busy. But holds can expire or race, so we also use optimistic locking at book time. The slot has a version number; if it changed since you last checked, your booking fails gracefully. Both mechanisms are Postgres-native—no Redis needed."

---

## 4. Failure Handling & Escalation

### Context

AI voice agents can fail: API timeouts, model errors, network issues, or conversations that get stuck. Patients shouldn't be left hanging.

### Decision: Automatic Transfer to Human on Failure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ESCALATION FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FAILURE TRIGGERS                                                           │
│  ────────────────                                                           │
│                                                                             │
│  • VAPI/Agent error (API timeout, model error)                              │
│  • Network issues (connection lost)                                         │
│  • Conversation stuck (>3 retries, confusion loop)                          │
│  • Patient requests human ("talk to a person")                              │
│  • Verification failed (can't identify patient)                             │
│  • Complex situation (complaints, medical urgency)                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│    ┌─────────────┐                                                          │
│    │  AI Agent   │                                                          │
│    │  Handling   │                                                          │
│    │    Call     │                                                          │
│    └──────┬──────┘                                                          │
│           │                                                                 │
│           ▼                                                                 │
│    ┌─────────────┐     YES    ┌─────────────────────────────────┐           │
│    │  Failure    │───────────▶│  LOG CONTEXT                    │           │
│    │  Detected?  │            │  • Conversation transcript      │           │
│    └──────┬──────┘            │  • Patient ID (if known)        │           │
│           │ NO                │  • Failure reason               │           │
│           ▼                   └──────────────┬──────────────────┘           │
│    [Continue]                                │                              │
│                                              ▼                              │
│                               ┌─────────────────────────────────┐           │
│                               │  "I'm going to connect you with │           │
│                               │   someone who can help."        │           │
│                               └──────────────┬──────────────────┘           │
│                                              │                              │
│                                              ▼                              │
│                               ┌─────────────────────────────────┐           │
│                               │  TRANSFER TO: 503-807-2108      │           │
│                               │  (Human fallback)               │           │
│                               └──────────────┬──────────────────┘           │
│                                              │                              │
│                               ┌──────────────┴──────────────┐               │
│                               │                             │               │
│                               ▼                             ▼               │
│                           ANSWERED                     NO ANSWER            │
│                               │                             │               │
│                               ▼                             ▼               │
│                    ┌──────────────────┐          ┌──────────────────┐       │
│                    │ Context passed:  │          │ "Our team is     │       │
│                    │ "Patient [X],    │          │  unavailable.    │       │
│                    │  calling about   │          │  Can I take your │       │
│                    │  [topic], issue: │          │  callback number?│       │
│                    │  [reason]"       │          └──────────────────┘       │
│                    └──────────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration

```typescript
const escalationConfig = {
  // Human fallback number
  fallbackNumber: '+15038072108',

  // Conditions that trigger transfer
  transferConditions: [
    { type: 'error' },
    { type: 'patient_request', phrases: ['speak to a person', 'human', 'representative'] },
    { type: 'loop_detected', maxRetries: 3 },
    { type: 'verification_failed' },
  ],

  // Message before transfer
  preTransferMessage: "I'm going to connect you with someone who can help. One moment please.",

  // Context template for human handoff
  contextTemplate: `
    Patient: {{patient_name || 'Unidentified'}}
    Phone: {{caller_phone}}
    Reason: {{transfer_reason}}
    Last topic: {{last_intent}}
    Summary: {{conversation_summary}}
  `
};
```

### Escalation Tracking Schema

```sql
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  patient_id UUID REFERENCES patients(id),

  reason TEXT NOT NULL,          -- 'error', 'patient_request', 'verification_failed'
  error_details JSONB,

  transferred_to TEXT NOT NULL,  -- Phone number
  transfer_status TEXT,          -- 'connected', 'voicemail', 'no_answer', 'failed'

  conversation_summary TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);
```

### Rationale

- **Fail gracefully:** A patient stuck on a broken AI call is worse than no AI at all
- **Context handoff:** Human gets summary so patient doesn't repeat themselves
- **Track escalations:** High escalation rate = AI needs improvement
- **Single fallback number for demo:** Production would route to on-call staff

### Interview Talking Points

> "Every AI system needs a human fallback. When the agent fails—API errors, confused patient, explicit request—we warm-transfer to a human with context. The receiving person sees who's calling, what they were trying to do, and why the AI escalated. We track escalation rates as a quality metric; if they spike, the AI needs tuning."

---

## 5. Multi-Tenancy

### Context

A production system would serve multiple healthcare practices, each with their own patients, providers, MRS system, and business rules.

### Decision: Database-Per-Tenant with Shared Control Plane

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANT ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TENANT = Healthcare Practice/Organization                                  │
│                                                                             │
│  Examples:                                                                  │
│  • "Riverside Family Medicine" (OpenMRS)                                    │
│  • "Downtown Urgent Care" (Epic)                                            │
│  • "Coastal Pediatrics" (athenahealth)                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      SHARED SERVICES                                │    │
│  │                                                                     │    │
│  │   ┌──────────┐   ┌──────────────┐   ┌──────────┐                   │    │
│  │   │   VAPI   │──▶│   Tenant     │──▶│  Agent   │                   │    │
│  │   │ Webhook  │   │   Resolver   │   │  Core    │                   │    │
│  │   └──────────┘   └──────────────┘   └────┬─────┘                   │    │
│  │                                          │                          │    │
│  │   ┌──────────────────────────────────────┴───────────────────────┐ │    │
│  │   │              CONTROL PLANE DATABASE                          │ │    │
│  │   │  • tenants           • phone_routing      • usage_tracking   │ │    │
│  │   │  • tenant_configs    • api_keys           (NO PHI)           │ │    │
│  │   └──────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                               │                                             │
│  ─────────────────────────────┼─────────────────────────────────────────    │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    TENANT-ISOLATED DATABASES                        │    │
│  │                                                                     │    │
│  │   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │    │
│  │   │  riverside  │     │  downtown   │     │  coastal    │          │    │
│  │   │  _db        │     │  _db        │     │  _db        │          │    │
│  │   │             │     │             │     │             │          │    │
│  │   │ • patients  │     │ • patients  │     │ • patients  │          │    │
│  │   │ • providers │     │ • providers │     │ • providers │          │    │
│  │   │ • appts     │     │ • appts     │     │ • appts     │          │    │
│  │   │ • waitlist  │     │ • waitlist  │     │ • waitlist  │          │    │
│  │   │             │     │             │     │             │          │    │
│  │   │ ALL PHI     │     │ ALL PHI     │     │ ALL PHI     │          │    │
│  │   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘          │    │
│  │          │                   │                   │                  │    │
│  │          ▼                   ▼                   ▼                  │    │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │   │   OpenMRS    │    │     Epic     │    │  athenahealth│         │    │
│  │   │   Adapter    │    │    Adapter   │    │    Adapter   │         │    │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tenant Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TENANT RESOLUTION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VOICE: Phone number → Tenant                                               │
│  ─────────────────────────────                                              │
│  Each tenant gets dedicated phone number(s).                                │
│  VAPI sends "to" number, we look up tenant.                                 │
│                                                                             │
│     phone_routing table:                                                    │
│     +1-555-0100  →  riverside                                               │
│     +1-555-0200  →  downtown                                                │
│                                                                             │
│  CHAT: Subdomain → Tenant                                                   │
│  ────────────────────────                                                   │
│     chat.riverside.example.com  →  riverside                                │
│     chat.downtown.example.com   →  downtown                                 │
│                                                                             │
│  API: API Key → Tenant                                                      │
│  ─────────────────────                                                      │
│     sk_riverside_xxxxx  →  riverside                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Per-Tenant Configuration

```typescript
interface TenantConfig {
  id: string;                           // 'riverside'
  name: string;                         // 'Riverside Family Medicine'

  // Database
  databaseUrl: string;                  // Tenant's isolated DB

  // MRS Integration
  mrs: {
    type: 'openmrs' | 'epic' | 'athena' | 'cerner';
    credentials: EncryptedCredentials;
    endpointUrl: string;
  };

  // Phone Numbers
  phones: {
    inbound: string[];                  // Numbers patients call
    escalation: string;                 // Human fallback
  };

  // Business Rules (each tenant can differ)
  scheduling: {
    advanceBookingDays: number;
    sameDayEnabled: boolean;
    appointmentTypes: AppointmentType[];
  };

  waitlist: {
    enabled: boolean;
    minNoticeHours: number;
  };
}
```

### Why Database-Per-Tenant?

| Approach | Isolation | Complexity | Healthcare Fit |
|----------|-----------|------------|----------------|
| Shared tables + tenant_id | Weak (one bug = leak) | Low | ❌ Not recommended |
| Schema per tenant | Medium | Medium | ⚠️ Acceptable |
| **Database per tenant** | **Strong** | **Higher** | **✅ Best for HIPAA** |

**We chose database-per-tenant because:**
- **Impossible to leak across tenants** — queries physically can't access other tenant's data
- **Easy per-tenant backup/restore** — compliance requirement for healthcare
- **Can be in different regions** — data residency requirements
- **Noisy neighbor isolation** — one tenant's load doesn't affect others

### Rationale

- **MRS adapter pattern:** Tenant config specifies which adapter (OpenMRS, Epic, etc.) and credentials. Factory instantiates the right one.
- **Control plane is shared:** Tenant configs, phone routing, billing—no PHI here
- **PHI is isolated:** Each tenant's patients, appointments, conversations in separate DB

### Interview Talking Points

> "Multi-tenancy uses database-per-tenant for strongest isolation—critical for healthcare. Each practice has their own database with their own PHI. The control plane is shared and contains no patient data—just tenant configs, phone routing, and billing. Tenant resolution is deterministic: phone number for voice, subdomain for chat. The MRS adapter pattern means we can support OpenMRS, Epic, athena, and others without changing core logic."

---

## 6. Technology Choices

### Postgres for Everything

Rather than introducing Redis for caching and Bull/SQS for job queues, we use PostgreSQL for all persistence needs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    "POSTGRES FOR EVERYTHING"                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Traditional Stack              Our Stack                                   │
│  ─────────────────              ─────────                                   │
│                                                                             │
│  ┌──────────────┐              ┌──────────────┐                             │
│  │  PostgreSQL  │              │  PostgreSQL  │                             │
│  │  (data)      │              │              │                             │
│  └──────────────┘              │  • Data      │                             │
│         +                      │  • Cache     │                             │
│  ┌──────────────┐              │  • Job Queue │                             │
│  │    Redis     │              │  • Locks     │                             │
│  │  (cache)     │              │              │                             │
│  └──────────────┘              └──────────────┘                             │
│         +                                                                   │
│  ┌──────────────┐                                                           │
│  │  Bull/SQS    │                                                           │
│  │  (jobs)      │                                                           │
│  └──────────────┘                                                           │
│                                                                             │
│  3 systems to manage           1 system to manage                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Job Queue Pattern:**

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                   -- 'send_reminder', 'sync_mrs', 'outbound_call'
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',        -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 0,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker claims jobs atomically
SELECT * FROM jobs
WHERE status = 'pending'
  AND run_at <= NOW()
ORDER BY priority DESC, run_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

### Rationale

| Benefit | Description |
|---------|-------------|
| **Simpler operations** | One database to backup, monitor, scale |
| **Transactional consistency** | Jobs and data in same transaction (no dual-write issues) |
| **Good enough performance** | For demo scale, Postgres handles everything |
| **Fewer failure modes** | No Redis connection issues, no SQS visibility timeouts |

### When We'd Reconsider

- **> 10,000 jobs/second:** Postgres job queue would struggle; move to dedicated queue
- **Sub-millisecond cache reads:** Redis would win; but we don't need that
- **Global distribution:** Might want regional read replicas + Redis for hot data

---

### Unified Agent Core

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED AGENT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│         Voice (VAPI)              Chat (Web)                                │
│              │                        │                                     │
│              ▼                        ▼                                     │
│        ┌──────────┐            ┌──────────┐                                 │
│        │  VAPI    │            │   Chat   │                                 │
│        │ Adapter  │            │ Adapter  │                                 │
│        └────┬─────┘            └────┬─────┘                                 │
│             │                       │                                       │
│             └───────────┬───────────┘                                       │
│                         │                                                   │
│                         ▼                                                   │
│              ┌─────────────────────┐                                        │
│              │     AGENT CORE      │                                        │
│              │                     │                                        │
│              │  • Conversation     │                                        │
│              │    management       │                                        │
│              │  • Tool definitions │                                        │
│              │  • State machine    │                                        │
│              │  • Business logic   │                                        │
│              └──────────┬──────────┘                                        │
│                         │                                                   │
│                         ▼                                                   │
│              ┌─────────────────────┐                                        │
│              │  SCHEDULING TOOLS   │                                        │
│              │                     │                                        │
│              │  • check_avail      │                                        │
│              │  • book_appt        │                                        │
│              │  • cancel_appt      │                                        │
│              │  • add_to_waitlist  │                                        │
│              └─────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why unified?**
- **Consistent behavior:** Patient gets same experience regardless of channel
- **Single source of truth:** Business logic lives in one place
- **Easier testing:** Test core once, adapters are thin wrappers
- **Simpler maintenance:** Fix a bug once, fixed everywhere

---

## 7. What We'd Do Differently in Production

| Area | Demo Approach | Production Approach |
|------|---------------|---------------------|
| **HIPAA** | Technical hooks only | Full compliance: BAAs, audit trails, log scrubbing |
| **MRS** | OpenMRS demo (data resets) | Customer's actual MRS with stable connection |
| **Escalation** | Single phone number | On-call rotation, business hours routing |
| **Monitoring** | Basic logging | Full observability: metrics, traces, alerts |
| **Job Queue** | Postgres | Evaluate dedicated queue at scale (>10k jobs/sec) |
| **Multi-region** | Single Fly.io region | Multi-region for latency + data residency |
| **Caching** | Postgres only | Evaluate Redis for hot data if needed |
| **Auth** | Minimal | SSO, MFA, proper session management |
| **Testing** | Manual | Automated E2E, load testing, chaos engineering |

### Scaling Considerations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCALING PATH                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  10 calls/hour          100 calls/hour         1000+ calls/hour             │
│  (Demo)                 (Small practice)       (Multi-tenant prod)          │
│  ─────────────          ────────────────       ─────────────────            │
│                                                                             │
│  Single Fly.io          Same, but:             Need:                        │
│  instance               • Connection pool      • Multiple app instances     │
│                         • Basic monitoring     • Read replicas              │
│  Postgres job           • Alerting             • Dedicated job queue?       │
│  queue fine                                    • Redis for hot cache?       │
│                                                • Multi-region               │
│  No caching             Basic query            • Full observability         │
│  needed                 optimization           • Auto-scaling               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

This system is designed to be **simple enough to build as a demo** but **architected to scale to production**. Key decisions:

1. **HIPAA:** Technical readiness without compliance overhead for demo
2. **Patient ID:** Multi-factor verification with human fallback
3. **Concurrency:** Soft holds + optimistic locking, Postgres-native
4. **Failures:** Automatic escalation to human (503-807-2108)
5. **Multi-tenancy:** Database-per-tenant for healthcare-grade isolation
6. **Tech stack:** Postgres for everything, unified agent core

The architecture supports production requirements—HIPAA compliance, multi-MRS support, geographic distribution—as configuration and operational additions, not rewrites.
