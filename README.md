# Elise Clone

> **Call 667-677-9143 to make an appointment!**

AI-powered healthcare scheduling assistant via voice (VAPI) and chat.

A demo implementation inspired by [EliseAI Health](https://eliseai.com/health), focused on patient appointment scheduling through natural conversation.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- pnpm (`npm install -g pnpm`)
- VAPI account with API key
- ngrok account (free tier works)

### 1. Initial Setup

```bash
# Clone and install
git clone <repo-url>
cd elise-clone
pnpm install

# Copy environment template
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# .env
PROFILE=mrs                                    # Use 'mrs' for OpenMRS
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/elise_mrs
VAPI_API_KEY=your-vapi-api-key-here            # From VAPI dashboard
NGROK_DOMAIN=your-domain.ngrok-free.app        # Your ngrok domain (see step 5)
```

The profile config (`config/profiles/mrs.env`) has OpenMRS demo credentials pre-configured:

```bash
# config/profiles/mrs.env (no changes needed)
PORT=3000
OPENMRS_URL=https://o3.openmrs.org/openmrs
OPENMRS_USER=admin
OPENMRS_PASSWORD=Admin123
```

### 2. Start the Database

```bash
docker compose up -d
```

### 3. Initialize Database & Sync from OpenMRS

```bash
# Reset database and run migrations
pnpm exec prisma migrate reset --force

# Seed test patients (for voice testing)
pnpm run seed

# Start the server (performs initial sync from OpenMRS)
pnpm run dev
```

Wait for the server to show `Status: READY`. This syncs providers, locations, services, and appointments from OpenMRS.

### 4. Set Up Provider Schedules

After the server starts, create schedule templates so providers have availability:

```bash
# In a new terminal
pnpm run setup:availability --create
```

This creates Mon-Fri 9am-5pm schedules for synced providers.

### 5. Expose Local Server via ngrok

VAPI needs to reach your local server. Start ngrok in a new terminal:

```bash
# If you have a reserved domain (set NGROK_DOMAIN in .env)
ngrok http 3000 --domain=your-domain.ngrok-free.app

# Or use free random URL
ngrok http 3000
```

If using a random URL, update `NGROK_DOMAIN` in `.env` with the generated domain.

### 6. Configure VAPI

```bash
# Deploy assistant config to VAPI (uses NGROK_DOMAIN from .env)
pnpm run vapi:setup
```

This sets the webhook URL to `https://{NGROK_DOMAIN}/vapi/tools`.

### 7. Test It

Call your VAPI phone number and try:
- "I'd like to schedule an appointment"
- Give your DOB (use a seeded patient: November 9, 1997)
- Ask for availability and book a time

---

## Full Reset (Start Fresh)

If you need to completely reset and start over:

```bash
# Stop the server (Ctrl+C)

# Reset database
pnpm exec prisma migrate reset --force

# Re-seed test patients
pnpm run seed

# Start server (syncs from OpenMRS)
pnpm run dev

# After server is READY, create schedules
pnpm run setup:availability --create
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server with hot reload |
| `pnpm run build` | Compile TypeScript |
| `pnpm exec prisma studio` | Browse database in browser |
| `pnpm exec prisma migrate reset --force` | Reset database |
| `pnpm run seed` | Seed test patients |
| `pnpm run setup:availability` | List providers and their schedules |
| `pnpm run setup:availability --create` | Create default schedules |
| `pnpm run vapi:setup` | Deploy assistant config to VAPI |
| `pnpm run vapi:logs` | List recent VAPI calls |
| `pnpm run vapi:logs --last` | Show transcript of last call |

---

## Test Patients

After running `pnpm run seed`, these patients are available for testing:

| Name | DOB | Phone |
|------|-----|-------|
| Joshua Clark | Nov 9, 1997 | +1234567890 |
| Sarah Johnson | Mar 15, 1985 | +1234567891 |
| Michael Chen | Jul 22, 1990 | +1234567892 |

Use their DOB to identify when calling.

---

## Health Checks

```bash
# Basic health
curl http://localhost:3000/health

# Readiness (returns 503 if initial sync not complete)
curl http://localhost:3000/health?ready=true
```

---

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
│   │ Chat (todo) │  │   │  Adapters │   │  [2] Scheduling Tools            │ │
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
│   │  - Patient records               │◀─│      - Initial sync on startup │  │
│   │  - Provider calendars            │  │      - Background sync every   │  │
│   │  - Appointments                  │  │        5-60 min by entity      │  │
│   └──────────────────────────────────┘  └────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### [1] Agent Core

**Purpose:** Unified conversation engine powering both voice and chat interfaces.

**Responsibilities:**
- Manage conversation state and context
- Orchestrate tool calls (scheduling, lookups, etc.)
- Handle multi-turn dialogues naturally
- Maintain patient identification across sessions

**Key Design:** Single agent implementation with channel adapters (VAPI webhook adapter, chat HTTP adapter). This ensures consistent behavior regardless of how patients interact.

---

### [2] Scheduling Tools

**Purpose:** Tool definitions that the agent uses to perform scheduling actions.

**Tools:**
- `identify_patient` - Lookup patient by phone + DOB, returns upcoming appointments
- `get_availability` - Query open times for a provider/date range
- `book_appointment` - Reserve a time for a patient
- `cancel_appointment` - Cancel with optional rebooking suggestions

**Key Design:** Tools operate on the Context Store, not directly on the MRS. This enables real-time responsiveness without hammering the MRS API.

---

### [3] Context Store (PostgreSQL)

**Purpose:** PostgreSQL database serving as the real-time operational store.

**Responsibilities:**
- Cache patient profiles synced from MRS
- Store provider schedule templates (define availability)
- Track appointment lifecycle (booked → confirmed → completed/cancelled)
- Manage waitlist queue with priority rules
- Run job queue for async operations (push sync, reminders)

**Key Design:** "Postgres for everything" — context, cache, and job queue in one database. Uses polling for job processing, avoiding additional infrastructure.

---

### [4] MRS Adapter Layer

**Purpose:** Abstract interface for medical record system integration with capability discovery.

**Responsibilities:**
- Define standard operations (fetch patients, providers, appointments)
- Handle authentication per MRS type
- Transform MRS-specific data into canonical format
- Report system capabilities for adaptive behavior

**Key Design:** Designed for multi-tenant deployment where different customers use different MRS systems. Each adapter reports its capabilities, allowing the system to adapt.

```typescript
interface MRSAdapter {
  readonly capabilities: MRSCapabilities;
  healthCheck(): Promise<HealthCheckResult>
  getPatient(mrsId: string): Promise<MRSPatient | null>
  searchPatients(query: PatientSearchQuery): Promise<MRSPatient[]>
  getProviders(): Promise<MRSProvider[]>
  getLocations(): Promise<MRSLocation[]>
  checkConflicts(request: ConflictCheckRequest): Promise<ConflictCheckResult>
  getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]>
  createAppointment(request: CreateAppointmentRequest): Promise<MRSAppointment>
  cancelAppointment(mrsId: string, reason?: string): Promise<void>
}
```

---

### [5] OpenMRS Integration

**Purpose:** Concrete MRS adapter implementation for OpenMRS/Bahmni.

Uses the public OpenMRS 3 demo instance at `o3.openmrs.org`. Data may reset periodically — acceptable for demo purposes.

**Configuration:**
```
OPENMRS_URL=https://o3.openmrs.org/openmrs
OPENMRS_USER=admin
OPENMRS_PASSWORD=Admin123
```

---

### [6] Sync Service

**Purpose:** Keep Context Store synchronized with MRS data.

**Sync Modes:**
- **Startup sync**: Blocking sync of all entities before accepting requests
- **Background sync**: Periodic updates (5-60 min intervals by entity type)
- **Push sync**: Local changes pushed to MRS with retry and exponential backoff

**Sync Flow:**
```
1. Fetch records from MRS
2. Detect changes via comparison
3. Apply conflict resolution rules (MRS usually wins)
4. Upsert into Context Store
5. Process push queue (local → MRS)
6. Update sync state
```

**Default Sync Intervals:**

| Entity | Interval | Rationale |
|--------|----------|-----------|
| Appointments | 5 min | Detect external changes quickly |
| Patients | 30 min | Less volatile data |
| Providers | 60 min | Rarely changes |
| Locations | 60 min | Rarely changes |
| Appointment Types | 60 min | Rarely changes |

---

### [7] Waitlist Scheduler (TODO)

**Purpose:** Proactively fill cancelled appointments from waitlist.

**Responsibilities:**
- Monitor for appointment cancellations
- Match cancelled slots against waitlist entries
- Trigger outbound calls via VAPI to offer slots
- Handle acceptance/rejection/no-answer flows

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | TypeScript/Node.js | VAPI SDK support, type safety |
| Database | PostgreSQL | Data, cache, and job queue in one |
| Voice AI | VAPI | Purpose-built for voice agents |
| MRS | OpenMRS | Open source, REST API, public demo |
| Deployment | Fly.io | Simple deploy, good free tier |

### "Postgres for Everything" Philosophy

Inspired by [Postgres for Everything](https://www.amazingcto.com/postgres-for-everything/) — rather than introducing Redis for caching and Bull for job queues, we use PostgreSQL for all persistence needs:

1. **Simpler operations** — One database to backup, monitor, and maintain
2. **Transactional consistency** — Jobs and data in same transaction
3. **Good enough performance** — For demo scale, Postgres handles it all

The job queue uses a simple pattern:
```sql
SELECT * FROM jobs
WHERE status = 'pending' AND run_at <= NOW()
ORDER BY run_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

---

## Environment Variables

### Core Settings

| Variable | Required | Description |
|----------|----------|-------------|
| `PROFILE` | Yes | MRS profile: `mrs` (OpenMRS) or `emr` (OpenEMR) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `VAPI_API_KEY` | Yes | VAPI API key for voice |
| `NGROK_DOMAIN` | No | Your ngrok domain for VAPI webhooks |

### MRS Integration (in `config/profiles/mrs.env`)

| Variable | Description |
|----------|-------------|
| `OPENMRS_URL` | OpenMRS instance URL |
| `OPENMRS_USER` | OpenMRS username |
| `OPENMRS_PASSWORD` | OpenMRS password |
| `OPENMRS_TIMEOUT_MS` | Request timeout (default: 30000) |

### Sync Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_APPOINTMENTS_INTERVAL_MS` | 300000 (5 min) | Appointments sync interval |
| `SYNC_PATIENTS_INTERVAL_MS` | 1800000 (30 min) | Patients sync interval |
| `SYNC_PROVIDERS_INTERVAL_MS` | 3600000 (60 min) | Providers sync interval |
| `SYNC_FULL_SYNC_TIME` | `02:00` | Daily full sync time (24h format) |

See `.env.example` for complete template.

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
  - Waitlist management (planned)

### Backlogged

- **Admin UI** — Internal dashboard for operations
- **Multi-MRS Support** — Adapter interface ready, only OpenMRS implemented
- **Email/SMS Channels** — Currently voice + chat only

---

## Profile System

Elise uses profiles to support multiple MRS backends:

| Profile | MRS | Server Port | DB Port |
|---------|-----|-------------|---------|
| `mrs` | OpenMRS | 3000 | 5432 |
| `emr` | OpenEMR | 3001 | 5433 |

Set `PROFILE` in `.env`. Profile configs are in `config/profiles/`.

---

## Deployment (Fly.io)

```bash
fly launch
fly secrets set VAPI_API_KEY=your-key
fly secrets set DATABASE_URL=your-postgres-url
fly deploy
```

---

## Project Structure

```
elise-clone/
├── src/
│   ├── agent/              # [1] Agent Core
│   │   ├── adapters/       # Channel adapters (vapi, chat)
│   │   └── tools/          # [2] Scheduling tools
│   │       ├── identify-patient.ts
│   │       ├── get-availability.ts
│   │       ├── book-appointment.ts
│   │       └── cancel-appointment.ts
│   ├── scheduling/         # Availability computation, booking service
│   │   ├── availability-service.ts   # Schedule template → time windows
│   │   └── booking-service.ts        # Datetime-based booking
│   ├── db/                 # [3] Context Store
│   │   └── client.ts       # Prisma client
│   ├── mrs/                # [4] MRS Adapter Layer
│   │   ├── adapter.ts      # Abstract interface
│   │   ├── types.ts        # MRS entity types
│   │   ├── errors.ts       # Typed MRS errors
│   │   └── adapters/
│   │       ├── openmrs/    # [5] OpenMRS adapter
│   │       └── mock/       # Mock adapter for testing
│   ├── sync/               # [6] Sync Service
│   │   ├── startup.ts      # Blocking initial sync
│   │   ├── scheduler.ts    # Background sync scheduling
│   │   ├── entities/       # Per-entity sync (patients, providers, etc.)
│   │   ├── push/           # Push local changes to MRS
│   │   └── conflict-resolution.ts
│   └── server.ts           # Express HTTP server
├── config/
│   ├── profiles/           # Profile-specific env (mrs.env, emr.env)
│   └── assistants/         # VAPI assistant configs
├── scripts/                # Setup and utility scripts
├── prisma/                 # Database schema and migrations
├── test/                   # Test files
└── docs/                   # Documentation
```

---

## License

MIT
