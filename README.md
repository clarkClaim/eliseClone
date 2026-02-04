# Elise Clone

AI-powered healthcare scheduling assistant with voice and chat interfaces.

A demo implementation inspired by [EliseAI Health](https://eliseai.com/health), focused on patient appointment scheduling through natural conversation.

## Overview

This system automates patient scheduling conversations over **voice** (via VAPI) and **chat**, integrating with medical record systems to manage appointments without overbooking.

**MVP Scope:** Appointment scheduling only (Book → Confirm → Remind flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PATIENT CHANNELS                      CORE SYSTEM                         │
│   ================                      ===========                         │
│                                                                             │
│   ┌─────────────┐                      ┌──────────────────────────────────┐ │
│   │   Phone     │──┐                   │  [1] Agent Core                  │ │
│   │   (VAPI)    │  │                   │      - Unified conversation      │ │
│   └─────────────┘  │                   │      - Tool orchestration        │ │
│                    │   ┌───────────┐   │      - Session management        │ │
│   ┌─────────────┐  ├──▶│  Channel  │──▶├──────────────────────────────────┤ │
│   │   Chat      │  │   │  Adapters │   │  [2] Scheduling Tools            │ │
│   │   (Web)     │──┘   └───────────┘   │      - Check availability        │ │
│   └─────────────┘                      │      - Book appointment          │ │
│                                        │      - Cancel/reschedule         │ │
│                                        │      - Manage waitlist           │ │
│   DATA LAYER                           ├──────────────────────────────────┤ │
│   ==========                           │  [3] Context Store (PostgreSQL)  │ │
│                                        │      - Patient profiles          │ │
│   ┌──────────────────────────────────┐ │      - Availability cache        │ │
│   │  [4] MRS Adapter Layer           │ │      - Appointment state         │ │
│   │      (Abstract interface)        │ │      - Waitlist entries          │ │
│   ├──────────────────────────────────┤ │      - Job queue                 │ │
│   │  [5] OpenMRS Integration         │ └──────────────────────────────────┘ │
│   │      (Concrete implementation)   │                                      │
│   └──────────────┬───────────────────┘                                      │
│                  │                                                          │
│                  ▼                                                          │
│   ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│   │  OpenMRS Demo Instance           │  │  [6] Sync Service              │  │
│   │  - Patient records               │◀─│      - Polls MRS every 5-10min │  │
│   │  - Provider calendars            │  │      - Updates context store   │  │
│   │  - Appointments                  │  │      - Handles conflicts       │  │
│   └──────────────────────────────────┘  └────────────────────────────────┘  │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  [7] Waitlist Scheduler                                              │  │
│   │      - Monitors for cancellations                                    │  │
│   │      - Triggers outbound calls to waitlisted patients                │  │
│   │      - Configurable rules (time buffer, priority, etc.)              │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  [BACKLOG] Admin UI                                                  │  │
│   │      - View agent conversations                                      │  │
│   │      - Manage appointments                                           │  │
│   │      - Monitor system health                                         │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## System Components

### [1] Agent Core

**Purpose:** Unified conversation engine powering both voice and chat interfaces.

**Responsibilities:**
- Manage conversation state and context
- Orchestrate tool calls (scheduling, lookups, etc.)
- Handle multi-turn dialogues naturally
- Maintain patient identification across sessions

**Dependencies:** Context Store, Scheduling Tools

**Key Design:** Single agent implementation with channel adapters (VAPI webhook adapter, chat HTTP adapter). This ensures consistent behavior regardless of how patients interact.

---

### [2] Scheduling Tools

**Purpose:** Tool definitions that the agent uses to perform scheduling actions.

**Responsibilities:**
- `check_availability` - Query open slots for a provider/date range
- `book_appointment` - Reserve a slot for a patient
- `cancel_appointment` - Cancel and optionally add to waitlist
- `reschedule_appointment` - Cancel + book in one operation
- `add_to_waitlist` - Queue patient for earlier openings
- `get_appointment_details` - Look up existing appointments

**Dependencies:** Context Store

**Key Design:** Tools operate on the Context Store, not directly on the MRS. This enables real-time responsiveness without hammering the MRS API.

---

### [3] Context Store

**Purpose:** PostgreSQL database serving as the real-time operational store.

**Responsibilities:**
- Cache patient profiles synced from MRS
- Store computed availability (provider × timeslot matrix)
- Track appointment lifecycle (booked → confirmed → completed/cancelled)
- Manage waitlist queue with priority rules
- Run job queue for async operations (reminders, outbound calls)

**Dependencies:** PostgreSQL

**Key Design:** "Postgres for everything" — context, cache, and job queue in one database. Uses `pg_notify` + polling for job processing, avoiding additional infrastructure.

**Tables (conceptual):**
```
patients          - Synced patient profiles
providers         - Synced provider info
availability      - Computed open slots
appointments      - Current appointment state
waitlist          - Patients waiting for earlier slots
jobs              - Async job queue (reminders, outbound)
sync_state        - Last sync timestamps per entity type
```

---

### [4] MRS Adapter Layer

**Purpose:** Abstract interface for medical record system integration with capability discovery.

**Responsibilities:**
- Define standard operations (fetch patients, fetch providers, fetch/create appointments)
- Handle authentication per MRS type
- Transform MRS-specific data into canonical format
- Manage rate limiting and error handling
- Report system capabilities for adaptive behavior

**Dependencies:** None (interface only)

**Key Design:** Designed for multi-tenant deployment where different customers use different MRS systems. The adapter interface remains stable while implementations vary. Each adapter reports its capabilities, allowing the system to adapt behavior based on what the MRS supports.

```typescript
interface MRSAdapter {
  readonly capabilities: MRSCapabilities;

  // Connection lifecycle
  connect(): Promise<void>
  disconnect(): Promise<void>
  healthCheck(): Promise<HealthCheckResult>

  // Patient operations
  getPatient(mrsId: string): Promise<MRSPatient | null>
  searchPatients(query: PatientSearchQuery): Promise<MRSPatient[]>

  // Provider & Location operations
  getProviders(): Promise<MRSProvider[]>
  getLocations(): Promise<MRSLocation[]>

  // Availability & Appointments
  getAvailability(dateRange: DateRange): Promise<MRSSlot[]>
  verifySlotAvailable(slotMrsId: string): Promise<SlotVerificationResult>
  getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]>
  createAppointment(request: CreateAppointmentRequest): Promise<MRSAppointment>
  cancelAppointment(mrsId: string, reason?: string): Promise<void>
}
```

**Supported MRS Systems:** OpenMRS (implemented), Epic, Cerner, athenahealth, OpenEMR (interface defined)

---

### [5] OpenMRS Integration

**Purpose:** Concrete MRS adapter implementation for OpenMRS.

**Responsibilities:**
- Implement MRSAdapter interface for OpenMRS REST API
- Handle OpenMRS authentication (basic auth or OAuth)
- Map OpenMRS data structures to canonical format
- Manage OpenMRS-specific quirks and limitations

**Dependencies:** MRS Adapter Layer, OpenMRS Demo instance

**Configuration:**
```
OPENMRS_URL=https://o3.openmrs.org/openmrs
OPENMRS_USER=admin
OPENMRS_PASSWORD=Admin123
```

**Note:** Using the public OpenMRS 3 demo instance at `o3.openmrs.org`. Data may reset periodically — this is acceptable for demo purposes.

---

### [6] Sync Service

**Purpose:** Keep Context Store synchronized with MRS data with intelligent rate limiting.

**Responsibilities:**
- Poll MRS for changes on configurable intervals per entity type
- Detect and sync new/updated patients, providers, appointments
- Recompute availability after appointment changes
- Handle sync conflicts with configurable resolution rules
- Track sync state with rate limit awareness
- Push local appointments to MRS with retry logic and exponential backoff
- Detect MRS demo resets and trigger full re-sync

**Dependencies:** MRS Adapter Layer, Context Store

**Key Design:** Polling-based with adaptive intervals. During live booking calls, the system uses MRS-first booking (verify slot → create in MRS → record locally). Background sync keeps data fresh and handles the push queue for appointments created during MRS outages.

**Sync Flow:**
```
1. Check rate limit state (back off if needed)
2. Fetch records from MRS
3. Detect changes via comparison (MRS may not support modified-since)
4. Apply conflict resolution rules
5. Upsert into Context Store
6. Process push queue (local → MRS)
7. Update sync state and schedule next run
```

**Default Sync Intervals:**
| Entity | Interval | Priority | Rationale |
|--------|----------|----------|-----------|
| Availability | 5 min | High | Freshness critical for booking |
| Appointments | 5 min | High | Detect external changes |
| Patients | 30 min | Medium | Less volatile data |
| Providers | 60 min | Low | Rarely changes |
| Locations | 60 min | Low | Rarely changes |

**Conflict Resolution:**
- Patient/Provider data: MRS wins (source of truth)
- Appointments in MRS but not local: Import
- Appointments local but not in MRS: Flag for review (SyncConflict table)
- External booking conflicts: Offer alternatives, flag for review
- Slots deleted in MRS: Mark `mrsExists=false`, prevent new bookings

**Rate Limiting:**
- Tracks `rateLimitRemaining` and `rateLimitResetAt` per sync state
- Exponential backoff on consecutive failures
- Adaptive interval adjustment when quota is low (<20%)

**Configuration:** See Environment Variables section below

**Implementation:** See `src/sync/` directory

---

### [7] Waitlist Scheduler

**Purpose:** Proactively fill cancelled appointments from waitlist.

**Responsibilities:**
- Monitor for appointment cancellations
- Match cancelled slots against waitlist entries
- Trigger outbound calls via VAPI to offer slots
- Handle acceptance/rejection/no-answer flows
- Respect configurable rules (minimum notice, priority order, max attempts)

**Dependencies:** Context Store, Agent Core (for outbound calls)

**Trigger Conditions:**
- Direct trigger when appointment cancelled (if within rules)
- Periodic scan for unfilled slots approaching deadline
- Manual trigger from admin (future)

**Rules Engine:**
```
- min_notice_hours: 24      # Don't offer slots less than 24h away
- max_attempts: 3           # Try up to 3 waitlist patients per slot
- priority_order: fifo      # First-in-first-out, or could be clinical priority
- call_timeout_minutes: 5   # Wait this long for patient to answer/decide
```

---

### [BACKLOG] Admin UI

**Purpose:** Internal dashboard for operations staff.

**Planned Features:**
- View real-time agent conversations
- Browse/search appointments
- Manage waitlist manually
- Monitor sync status and system health
- Override scheduling rules when needed

**Status:** Not in MVP scope. Will be built after core scheduling flow is stable.

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Language** | TypeScript/Node.js | Consistency across stack, VAPI SDK support |
| **Database** | PostgreSQL | One DB for everything: data, cache, job queue |
| **Job Queue** | PostgreSQL | `pg_notify` + polling table, no extra infra |
| **Voice AI** | VAPI | Purpose-built for voice agents, good docs |
| **MRS** | OpenMRS (demo) | Open source, REST API, public demo available |
| **Deployment** | Fly.io | Simple deploy, good free tier, scales well |
| **Container** | Docker | Local dev + deployment parity |

### "Postgres for Everything" Philosophy

Rather than introducing Redis for caching and Bull for job queues, we use PostgreSQL for all persistence needs:

1. **Simpler operations** — One database to backup, monitor, and maintain
2. **Transactional consistency** — Jobs and data in same transaction
3. **Good enough performance** — For demo scale, Postgres handles it all
4. **Fewer moving parts** — Reduces deployment complexity

The job queue uses a simple pattern:
```sql
-- Jobs table with status
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  run_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Workers poll for pending jobs
SELECT * FROM jobs
WHERE status = 'pending' AND run_at <= NOW()
ORDER BY run_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- VAPI account and API key
- (Optional) Fly.io CLI for deployment

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd elise-clone

# Copy environment template
cp .env.example .env

# Fill in your API keys
# - VAPI_API_KEY
# - VAPI_ASSISTANT_ID (created in VAPI dashboard)
# - OPENMRS credentials (demo defaults provided)

# Start PostgreSQL
docker compose up -d postgres

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start the development server
npm run dev
```

### Verify It's Working

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# { "status": "ok", "database": "connected", "lastSync": "..." }

# Test chat endpoint
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need to schedule an appointment"}'
```

For voice testing, configure your VAPI assistant's webhook URL to point to your server (use ngrok for local development).

---

## Deployment

### Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (first time)
fly launch

# Deploy (subsequent)
fly deploy

# Set secrets
fly secrets set VAPI_API_KEY=your-key-here
fly secrets set DATABASE_URL=your-postgres-url
```

Fly.io will provision a PostgreSQL database for you, or you can attach an external one.

### Docker Compose (Self-hosted)

```bash
# Production build
docker compose -f docker-compose.prod.yml up -d
```

---

## Environment Variables

### Core Settings

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `VAPI_API_KEY` | Yes | VAPI API key for voice |
| `VAPI_ASSISTANT_ID` | Yes | VAPI assistant ID (configure in dashboard) |
| `PORT` | No | Server port (default: 3000) |

### MRS Integration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENMRS_URL` | Yes | OpenMRS instance URL (e.g., `https://o3.openmrs.org/openmrs`) |
| `OPENMRS_USER` | Yes | OpenMRS username |
| `OPENMRS_PASSWORD` | Yes | OpenMRS password |
| `OPENMRS_TIMEOUT_MS` | No | Request timeout (default: 30000) |

### Sync Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SYNC_AVAILABILITY_INTERVAL_MS` | No | Availability sync interval (default: 300000 = 5 min) |
| `SYNC_APPOINTMENTS_INTERVAL_MS` | No | Appointments sync interval (default: 300000 = 5 min) |
| `SYNC_PATIENTS_INTERVAL_MS` | No | Patients sync interval (default: 1800000 = 30 min) |
| `SYNC_PROVIDERS_INTERVAL_MS` | No | Providers sync interval (default: 3600000 = 60 min) |
| `SYNC_LOCATIONS_INTERVAL_MS` | No | Locations sync interval (default: 3600000 = 60 min) |
| `SYNC_FULL_SYNC_TIME` | No | Daily full sync time in 24h format (default: `02:00`) |
| `SYNC_MAX_CONSECUTIVE_FAILURES` | No | Alert threshold for consecutive failures (default: 5) |

### Booking Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BOOKING_STALE_THRESHOLD_MS` | No | When to warn about stale availability (default: 600000 = 10 min) |
| `BOOKING_MAX_ALTERNATIVES` | No | Max alternative slots to suggest on conflict (default: 3) |

See `.env.example` for a complete template.

---

## Project Scope

### MVP (Current Focus)

- **Scheduling flow:** Book → Confirm → Remind
- **Channels:** Voice (VAPI) + Chat (web)
- **MRS Integration:** OpenMRS (demo instance)
- **Core features:**
  - Check availability by provider/date
  - Book new appointments
  - Cancel/reschedule existing appointments
  - Waitlist management with outbound calls

### Backlogged

- **Admin UI** — Internal dashboard for operations
- **Billing & Payments** — Charge alerts, payment reminders
- **Email/SMS Channels** — Currently voice + chat only
- **Multi-MRS Support** — Adapter interface ready, but only OpenMRS implemented
- **Advanced Waitlist Rules** — Clinical priority, complex matching

---

## Project Structure

```
elise-clone/
├── src/
│   ├── agent/           # [1] Agent Core
│   │   ├── core.ts      # Unified agent logic
│   │   ├── adapters/    # Channel adapters (vapi, chat)
│   │   └── tools/       # [2] Scheduling tools
│   ├── booking/         # MRS-first booking flow
│   │   └── mrs-booking.ts  # Availability check, book, cancel with MRS
│   ├── db/              # [3] Context Store
│   │   ├── schema.ts    # Database schema
│   │   ├── queries.ts   # Query functions
│   │   └── jobs.ts      # Job queue implementation
│   ├── mrs/             # [4] MRS Adapter Layer
│   │   ├── adapter.ts   # Abstract interface with capabilities
│   │   ├── types.ts     # MRS entity types and capabilities
│   │   ├── errors.ts    # Typed MRS errors
│   │   ├── adapters/    # Concrete implementations
│   │   │   ├── openmrs/ # [5] OpenMRS adapter
│   │   │   └── mock/    # Mock adapter for testing
│   │   └── systems/     # MRS system documentation
│   ├── sync/            # [6] Sync Service
│   │   ├── types.ts     # Sync types and config
│   │   ├── scheduler.ts # Interval-based scheduling
│   │   ├── change-detection.ts  # Compare MRS vs local
│   │   ├── conflict-resolution.ts  # Resolution rules
│   │   ├── rate-limiter.ts  # Rate limit tracking
│   │   ├── entities/    # Per-entity sync logic
│   │   ├── push/        # Push local → MRS
│   │   ├── jobs/        # Sync job handlers
│   │   ├── metrics.ts   # Observability
│   │   ├── health.ts    # Health checks
│   │   └── demo-reset.ts  # Demo reset detection
│   ├── waitlist/        # [7] Waitlist Scheduler
│   │   └── scheduler.ts # Outbound call logic
│   └── server.ts        # HTTP server (Express/Fastify)
├── test/                # Test files
│   ├── change-detection.test.ts
│   ├── conflict-resolution.test.ts
│   ├── mock-adapter.test.ts
│   ├── openmrs-integration.test.ts
│   └── booking-flow.test.ts
├── openspec/            # Specifications and changes
├── docker-compose.yml   # Local development
├── fly.toml             # Fly.io config
└── package.json
```

---

## License

MIT (or your preferred license)
