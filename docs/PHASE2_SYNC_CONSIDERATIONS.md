# Phase 2: MRS Integration - Sync Considerations

Notes from project-scaffolding review. Address these when implementing the Sync Service.

---

## Critical: Schema Additions Needed

### 1. Track MRS timestamps separately from local timestamps

```prisma
model Appointment {
  mrsUpdatedAt    DateTime?  @map("mrs_updated_at")  // When MRS last modified this
}

model Availability {
  mrsUpdatedAt    DateTime?  @map("mrs_updated_at")
}
```

**Why:** Without this, we can't detect if MRS data is newer than local data. Risk of silent overwrites.

### 2. Track push-to-MRS status

```prisma
model Appointment {
  syncedToMrs       Boolean    @default(false) @map("synced_to_mrs")
  syncedToMrsAt     DateTime?  @map("synced_to_mrs_at")
  lastSyncError     String?    @map("last_sync_error")
  syncAttempts      Int        @default(0) @map("sync_attempts")
}
```

**Why:** Bookings can succeed locally but fail to push to MRS. Need retry mechanism and tracking.

---

## High Priority: Additional Schema

### 3. Handle "slot deleted from MRS" case

```prisma
model Availability {
  mrsExists         Boolean    @default(true) @map("mrs_exists")
}
```

**Why:** If MRS admin deletes a slot we have cached, agent could book a non-existent slot.

### 4. Conflict logging table

```prisma
model SyncConflict {
  id              String   @id @default(uuid())
  entityType      String   @map("entity_type")
  entityId        String   @map("entity_id")
  mrsId           String?  @map("mrs_id")
  conflictType    String   @map("conflict_type")  // 'local_only', 'mrs_only', 'data_diverged', 'deleted_in_mrs'
  localState      Json     @map("local_state")
  mrsState        Json?    @map("mrs_state")
  resolution      String   @map("resolution")
  detectedAt      DateTime @default(now()) @map("detected_at")
  resolvedAt      DateTime? @map("resolved_at")

  @@map("sync_conflicts")
}
```

**Why:** Conflicts happen silently with current schema. Need audit trail for healthcare compliance.

---

## Medium Priority: Enhancements

### 5. Enhance SyncState for observability

```prisma
model SyncState {
  // existing fields...
  nextSyncAt          DateTime? @map("next_sync_at")
  lastSyncDuration    Int?      @map("last_sync_duration")  // ms
  recordsProcessed    Int       @default(0) @map("records_processed")
  consecutiveFailures Int       @default(0) @map("consecutive_failures")
}
```

### 6. Add backoff fields to Job for sync retries

```prisma
model Job {
  // existing fields...
  backoffExponent  Int       @default(1) @map("backoff_exponent")
  nextRetryAt      DateTime? @map("next_retry_at")
}
```

---

## Sync Service Implementation Notes

### Booking Flow (with MRS validation)
1. Check availability locally (fast, optimistic lock)
2. **Verify with MRS** that slot still exists and is available
3. Book locally
4. Push to MRS
5. If push fails → mark `syncedToMrs=false`, queue retry job

### Conflict Resolution Rules (from TECHNICAL_EXPLORATION.md)
- Patient data differs → MRS wins (source of truth)
- Appointment in MRS but not local → Import
- Appointment local but not in MRS → Flag for review (use SyncConflict table)
- Slot booked in MRS but available locally → Mark booked, log as external booking

### Race Condition: Booking vs Sync
If patient books while sync is running:
- Both may try to update availability
- Use `version` field (already exists) for optimistic locking
- Consider adding version to Appointment, Patient models too

---

---

## Patient Push (Local → MRS)

Added in `patient-sync-to-mrs` change.

### Schema

```prisma
model Patient {
  syncedToMrs    Boolean   @default(false)
  syncedToMrsAt  DateTime?
  lastSyncError  String?
  syncAttempts   Int       @default(0)
}
```

### Flow

1. **Real-time push** (in `save-new-patient` tool):
   - Create patient locally with `local-{uuid}` mrsId
   - Immediately attempt to push to MRS
   - On success: update mrsId with MRS UUID, set `syncedToMrs=true`
   - On failure: set `lastSyncError`, leave for background sync

2. **Background push** (in sync service):
   - Query for patients where `syncedToMrs=false AND mrsId LIKE 'local-%'`
   - Skip patients missing required fields (givenName, familyName, dob)
   - Push each to MRS via `adapter.createPatient()`
   - Retry with exponential backoff on failure (max 5 attempts)

### OpenMRS Configuration

See `docs/OPENMRS_SETUP.md` for required environment variables.

---

## Reference

Full review details from project-scaffolding change review (2024-02-04).
