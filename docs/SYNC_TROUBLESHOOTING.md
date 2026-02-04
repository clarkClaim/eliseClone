# Sync Service Troubleshooting Guide

This guide covers common issues with the MRS sync service and how to resolve them.

## Table of Contents

- [Checking Sync Status](#checking-sync-status)
- [Common Issues](#common-issues)
  - [Sync Not Running](#sync-not-running)
  - [Rate Limiting](#rate-limiting)
  - [Authentication Failures](#authentication-failures)
  - [High Conflict Rates](#high-conflict-rates)
  - [Stale Availability Data](#stale-availability-data)
  - [Push Queue Backlog](#push-queue-backlog)
  - [Demo Reset Detection](#demo-reset-detection)
- [Logs and Metrics](#logs-and-metrics)
- [Manual Interventions](#manual-interventions)

---

## Checking Sync Status

### Via Health Endpoint

```bash
curl http://localhost:3000/health/mrs

# Expected response:
{
  "healthy": true,
  "connected": true,
  "latencyMs": 145,
  "syncStatus": {
    "availability": { "lastSync": "2024-01-15T10:00:00Z", "status": "idle" },
    "appointments": { "lastSync": "2024-01-15T10:00:00Z", "status": "idle" },
    ...
  }
}
```

### Via Database

```sql
-- Check sync state for all entities
SELECT entity_type, sync_status, last_sync_at, consecutive_failures, last_error
FROM sync_state
ORDER BY entity_type;

-- Check pending push jobs
SELECT type, status, created_at, attempts
FROM jobs
WHERE type IN ('push_appointment_to_mrs', 'push_cancellation_to_mrs')
ORDER BY created_at DESC
LIMIT 10;
```

---

## Common Issues

### Sync Not Running

**Symptoms:**
- `lastSyncAt` timestamps are stale (hours old)
- `syncStatus` shows "failed" for all entities
- Health endpoint shows `connected: false`

**Causes & Solutions:**

1. **MRS is unreachable**
   ```bash
   # Test MRS connectivity
   curl -u $OPENMRS_USER:$OPENMRS_PASSWORD $OPENMRS_URL/ws/rest/v1/session
   ```
   - Check network connectivity
   - Verify MRS URL is correct
   - Check if MRS is undergoing maintenance

2. **Scheduler not started**
   - Ensure `SyncScheduler.start()` is called on application startup
   - Check application logs for "SyncScheduler Starting..." message

3. **All syncs in backoff**
   ```sql
   SELECT entity_type, backoff_until FROM sync_state WHERE backoff_until > NOW();
   ```
   - If all entities are in backoff, wait for backoff to expire
   - Or manually reset: `UPDATE sync_state SET backoff_until = NULL, consecutive_failures = 0;`

---

### Rate Limiting

**Symptoms:**
- Logs show "Rate limited, waiting Xms before sync"
- `rateLimitRemaining` approaching 0
- Sync intervals automatically increasing

**Causes & Solutions:**

1. **MRS rate limits being hit**
   ```sql
   SELECT entity_type, rate_limit_remaining, rate_limit_reset_at FROM sync_state;
   ```

   **Solutions:**
   - Increase sync intervals in configuration
   - Wait for rate limit reset
   - Contact MRS administrator about rate limit increases

2. **Too many entities syncing simultaneously**
   - Stagger sync times by adjusting intervals
   - Use priority settings to ensure critical syncs run first

3. **Adjust configuration:**
   ```typescript
   const config: SyncSchedulerConfig = {
     schedules: {
       availability: { intervalMs: 10 * 60 * 1000, priority: 'high' },  // Increase to 10 min
       appointments: { intervalMs: 10 * 60 * 1000, priority: 'high' },
       patients: { intervalMs: 60 * 60 * 1000, priority: 'medium' },    // Increase to 60 min
       providers: { intervalMs: 120 * 60 * 1000, priority: 'low' },     // Increase to 2 hours
       locations: { intervalMs: 120 * 60 * 1000, priority: 'low' },
     },
     maxConsecutiveFailures: 5,
   };
   ```

---

### Authentication Failures

**Symptoms:**
- Logs show "MRSAuthenticationError"
- Health check fails with 401/403 status
- All syncs failing with authentication errors

**Causes & Solutions:**

1. **Credentials expired or changed**
   - Verify credentials: `echo $OPENMRS_USER / $OPENMRS_PASSWORD`
   - Test manually:
     ```bash
     curl -u $OPENMRS_USER:$OPENMRS_PASSWORD $OPENMRS_URL/ws/rest/v1/session
     ```
   - Update credentials in environment and restart

2. **Session timeout**
   - The adapter should handle session refresh automatically
   - If persisting, check `disconnect()` and `connect()` calls in logs

3. **IP allowlist issues**
   - Verify server IP is allowed by MRS firewall
   - Check MRS admin console for blocked IPs

---

### High Conflict Rates

**Symptoms:**
- `conflicts` count in sync results is high (>5% of records)
- SyncConflict table has many unresolved entries
- Logs show frequent conflict resolution warnings

**Causes & Solutions:**

1. **External booking activity**
   ```sql
   SELECT * FROM sync_conflict
   WHERE conflict_type = 'external_booking'
   AND resolved = false
   ORDER BY created_at DESC;
   ```
   - This is expected if appointments are being made directly in MRS
   - Review conflicts and mark as resolved after handling

2. **Data divergence**
   ```sql
   SELECT * FROM sync_conflict
   WHERE conflict_type = 'data_diverged'
   ORDER BY created_at DESC;
   ```
   - Usually indicates data was modified both locally and in MRS
   - Review each case and decide which version to keep
   - MRS typically wins for patient demographics

3. **Stale local data**
   - Trigger a full sync: call `scheduler.triggerFullSync()`
   - Check if sync intervals are too long

---

### Stale Availability Data

**Symptoms:**
- Patients see available slots that are actually booked
- Booking attempts fail with "slot already booked"
- `lastSyncedAt` for availability is old

**Causes & Solutions:**

1. **Check availability sync status:**
   ```sql
   SELECT * FROM sync_state WHERE entity_type = 'availability';
   ```

2. **Force availability refresh:**
   ```typescript
   // In booking flow
   const slots = await checkAvailability(providerId, dateRange, { forceRefresh: true });
   ```

3. **Reduce availability sync interval:**
   ```env
   SYNC_AVAILABILITY_INTERVAL_MS=120000  # 2 minutes
   ```

4. **Enable MRS-first booking:**
   - Ensure booking flow uses `verifySlotAvailable()` before `createAppointment()`
   - This catches conflicts even with stale cache

---

### Push Queue Backlog

**Symptoms:**
- Many pending `push_appointment_to_mrs` jobs
- Appointments exist locally but not in MRS
- Jobs failing repeatedly with MRS errors

**Causes & Solutions:**

1. **Check queue status:**
   ```sql
   SELECT status, COUNT(*)
   FROM jobs
   WHERE type LIKE 'push_%'
   GROUP BY status;

   -- Check failed jobs
   SELECT * FROM jobs
   WHERE type LIKE 'push_%' AND status = 'failed'
   ORDER BY created_at DESC;
   ```

2. **MRS unavailable during booking:**
   - This is expected behavior (graceful degradation)
   - Jobs will retry automatically when MRS is available

3. **Persistent failures:**
   - Check job `lastError` for specific error messages
   - May indicate data validation issues in MRS
   - Manual review may be needed for specific appointments

4. **Clear stuck jobs (use with caution):**
   ```sql
   -- Reset failed jobs to pending for retry
   UPDATE jobs
   SET status = 'pending', attempts = 0
   WHERE type LIKE 'push_%' AND status = 'failed';
   ```

---

### Demo Reset Detection

**Symptoms:**
- Logs show "Demo reset detected"
- Record counts dropped significantly
- Full re-sync triggered automatically

**Background:**
The OpenMRS demo instance periodically resets all data. The sync service detects this when record counts drop by more than 50%.

**What happens:**
1. System detects the drop
2. Recent bookings (last 24h) are flagged for review
3. Full re-sync is triggered
4. Alert is logged

**Actions needed:**
1. Review flagged bookings:
   ```sql
   SELECT * FROM appointments
   WHERE needs_review = true
   AND created_at > NOW() - INTERVAL '24 hours';
   ```
2. Contact affected patients if their appointments were lost
3. No action needed if this was expected (e.g., scheduled demo reset)

---

## Logs and Metrics

### Key Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| `[SyncScheduler] Starting...` | Scheduler initializing | None (normal) |
| `[SyncScheduler] Rate limited, waiting Xms` | Hit rate limit | Wait or reduce frequency |
| `[SyncScheduler] ALERT: X sync has failed Y consecutive times` | Repeated failures | Investigate cause |
| `[Sync] Conflict detected: ...` | Data mismatch found | Review conflict |
| `[DemoReset] Detected! Records dropped from X to Y` | Demo reset occurred | Review flagged bookings |

### Metrics to Monitor

1. **Sync duration:** Should be <30 seconds per entity
2. **Records processed:** Baseline varies by data volume
3. **Conflict rate:** Should be <5% of records
4. **Consecutive failures:** Alert at 5+
5. **Push queue depth:** Should stay near 0

---

## Manual Interventions

### Trigger Full Sync

```typescript
// Via code
await syncScheduler.triggerFullSync();
```

```sql
-- Via database (creates jobs)
INSERT INTO jobs (type, payload, priority, status)
VALUES
  ('sync_providers', '{}', 1, 'pending'),
  ('sync_locations', '{}', 1, 'pending'),
  ('sync_patients', '{}', 5, 'pending'),
  ('sync_availability', '{}', 10, 'pending'),
  ('sync_appointments', '{}', 10, 'pending');
```

### Reset Sync State

```sql
-- Reset all sync state (will trigger fresh sync)
UPDATE sync_state
SET last_sync_at = NULL,
    consecutive_failures = 0,
    backoff_until = NULL,
    sync_status = 'idle';
```

### Resolve All Conflicts

```sql
-- Mark all conflicts as resolved (use with caution)
UPDATE sync_conflict
SET resolved = true,
    resolved_at = NOW(),
    resolution = 'manual_bulk_resolve'
WHERE resolved = false;
```

### Clear Stuck Jobs

```sql
-- Reset jobs stuck in 'processing' state
UPDATE jobs
SET status = 'pending',
    attempts = attempts + 1
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '10 minutes';
```

---

## Getting Help

If issues persist after following this guide:

1. Collect relevant logs from the sync service
2. Export sync_state and recent sync_conflict records
3. Note the MRS type and version
4. Check `docs/TECHNICAL_EXPLORATION.md` for architecture details
5. Open an issue with the collected information
