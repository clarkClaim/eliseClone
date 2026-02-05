# Sync Architecture

This document explains how Elise Clone synchronizes data with external Medical Record Systems (MRS).

## Overview

The sync system maintains bidirectional data consistency between the local database and the connected MRS. It handles:

- **Pull Sync**: Import data from MRS to local database
- **Push Sync**: Export locally-created appointments to MRS
- **Conflict Resolution**: Handle data divergence between systems

## Sync Lifecycle

### 1. Startup Sync

When the server starts, it performs a **blocking initial sync** to ensure essential data is available:

```
┌─────────────────────────────────────────────────────────────┐
│                     Server Startup                          │
├─────────────────────────────────────────────────────────────┤
│  1. Connect to MRS                                          │
│  2. Run initial sync (blocking):                            │
│     - Providers (required for scheduling)                   │
│     - Appointment Types / Services                          │
│     - Locations                                             │
│     - Patients (most recent)                                │
│     - Appointments (past 7 days + next 30 days)             │
│  3. Validate essential data exists                          │
│  4. If validation fails: exit with error                    │
│  5. If timeout exceeded: continue in degraded mode          │
│  6. Start HTTP server and background sync scheduler         │
└─────────────────────────────────────────────────────────────┘
```

The startup sync has a configurable timeout (default 5 minutes). If exceeded, the server enters **degraded mode** where it accepts requests but warns that data may be incomplete.

### 2. Background Sync

After startup, the `SyncScheduler` runs periodic syncs at configurable intervals:

| Entity Type      | Default Interval | Notes                              |
|------------------|------------------|------------------------------------|
| Appointments     | 5 minutes        | Most time-sensitive                |
| Patients         | 30 minutes       | Less frequent changes              |
| Providers        | 60 minutes       | Rarely changes                     |
| Appointment Types| 60 minutes       | Service configuration              |
| Locations        | 60 minutes       | Facility data                      |

### 3. Push Sync

Locally-created appointments are pushed to MRS via the job queue:

```
┌──────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Local Booking   │────▶│  Job Queue   │────▶│  MRS Push   │
│  (voice/chat)    │     │ (pending)    │     │  Service    │
└──────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                              ┌─────────────────────┴─────────┐
                              ▼                               ▼
                         ┌─────────┐                   ┌────────────┐
                         │ Success │                   │  Failure   │
                         │ Update  │                   │  Retry w/  │
                         │ mrsId   │                   │  backoff   │
                         └─────────┘                   └────────────┘
```

Push jobs include:
- **Idempotency keys**: Prevent duplicate appointments on retry
- **Exponential backoff**: 1min, 2min, 4min, 8min, 16min
- **Transaction safety**: Job completion + appointment update are atomic

## Entity Sync Details

### Providers

```typescript
// Sync direction: MRS → Local only
// Local providers without mrsId are local-only

await syncProviders(adapter);
```

Providers are synced from MRS. Local-only providers (without mrsId) are not pushed to MRS.

### Patients

```typescript
// Sync direction: Bidirectional
// New patients created via voice are pushed to MRS

await syncPatients(adapter);
```

Patients can be created locally (e.g., new patient registration during voice call) and then pushed to MRS.

### Appointments

```typescript
// Sync direction: Bidirectional
// Local bookings are pushed to MRS
// External MRS bookings are imported locally

await syncAppointments(adapter);
```

Appointment sync is the most complex:
1. Pull appointments from MRS for date range
2. Import new MRS appointments to local database
3. Update changed appointments (if no pending local changes)
4. Detect appointments deleted in MRS
5. Push locally-created appointments via job queue

## Conflict Resolution

When local and MRS data diverge, conflicts are resolved based on these rules:

| Conflict Type        | Resolution                                          |
|----------------------|-----------------------------------------------------|
| `local_only`         | Push to MRS (create job)                            |
| `mrs_only`           | Import to local                                     |
| `data_diverged`      | Last-write-wins (check mrsUpdatedAt vs updatedAt)   |
| `deleted_in_mrs`     | Log for review, don't auto-delete local             |
| `external_booking`   | MRS wins (slot was booked externally)               |

All conflicts are logged to `sync_conflicts` table for audit.

## ID Lifecycle

Understanding how IDs flow between systems:

```
┌─────────────────────────────────────────────────────────────┐
│                    ID Lifecycle                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LOCAL CREATION:                                            │
│  ┌──────────┐                      ┌──────────┐             │
│  │ Local ID │  ──── push sync ──▶  │  MRS ID  │             │
│  │ (UUID)   │                      │ (UUID)   │             │
│  └──────────┘                      └──────────┘             │
│     id = "abc-123"                    mrsId = "xyz-789"     │
│     mrsId = null (until pushed)                             │
│                                                             │
│  MRS CREATION:                                              │
│  ┌──────────┐                      ┌──────────┐             │
│  │  MRS ID  │  ──── pull sync ──▶  │ Local ID │             │
│  │ (UUID)   │                      │ (UUID)   │             │
│  └──────────┘                      └──────────┘             │
│     mrsId = "xyz-789"                 id = "abc-123"        │
│                                       mrsId = "xyz-789"     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Key fields:
- `id`: Local database UUID (always set)
- `mrsId`: MRS UUID (null until synced with MRS)
- `syncedToMrs`: Whether local changes have been pushed
- `mrsUpdatedAt`: When MRS last modified this record

## Health & Readiness

The `/health` endpoint exposes sync status:

```json
{
  "status": "healthy",
  "ready": true,
  "degraded": false,
  "sync": {
    "lastSyncAt": "2024-01-15T10:30:00Z",
    "entities": {
      "providers": { "count": 5, "lastSync": "..." },
      "patients": { "count": 100, "lastSync": "..." },
      "appointments": { "count": 50, "lastSync": "..." }
    }
  }
}
```

Use `GET /health?ready=true` for Kubernetes readiness probes - returns 503 until initial sync completes.

## Configuration

Environment variables:

| Variable                   | Default | Description                        |
|----------------------------|---------|------------------------------------|
| `SYNC_STARTUP_TIMEOUT_MS`  | 300000  | Initial sync timeout (5 min)       |
| `SYNC_INTERVAL_APPOINTMENTS_MS` | 300000 | Appointment sync interval      |
| `SYNC_INTERVAL_PATIENTS_MS`| 1800000 | Patient sync interval (30 min)     |
| `SYNC_INTERVAL_PROVIDERS_MS`| 3600000 | Provider sync interval (60 min)   |

## Error Handling

### Transient Failures

Network issues and temporary MRS unavailability are handled with retries:
- Background sync: Continues next interval
- Push jobs: Exponential backoff with max 5 attempts

### Permanent Failures

- Invalid credentials: Server exits on startup
- Missing essential data: Server exits on startup
- MRS unavailable during startup: Degraded mode

### Conflict Handling

All conflicts are:
1. Logged to database (`sync_conflicts` table)
2. Logged to console for monitoring
3. Resolved automatically where safe (MRS wins for external bookings)
4. Flagged for manual review otherwise
