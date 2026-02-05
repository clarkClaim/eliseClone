## Context

Elise currently syncs patients one-way: MRS → local database. When new patients register via the voice assistant (`save_new_patient` tool), they're created locally with a `local-{uuid}` mrsId but never pushed to OpenMRS.

**Current state:**
- `MRSAdapter` interface has read-only patient methods: `getPatient()`, `searchPatients()`, `getPatients()`
- `save-new-patient` tool creates patients locally only
- Sync service pulls patients from MRS but never pushes
- Patient table has no sync tracking fields

**Constraints:**
- Must maintain abstraction: interface first, OpenMRS implementation second
- OpenMRS patient creation requires nested person/name/identifier structure
- Phone numbers are person attributes in OpenMRS, not direct patient fields
- Should support both real-time (tool) and background (sync) patient creation

## Goals / Non-Goals

**Goals:**
- Add `createPatient()` method to MRSAdapter interface
- Implement OpenMRS patient creation with proper data mapping
- Push patients to MRS in real-time from `save-new-patient` tool
- Add background sync for any patients that failed real-time push
- Track sync status on Patient records (like appointments do)

**Non-Goals:**
- Patient updates/edits (future scope - `updatePatient()` mentioned but not implemented)
- Patient merge/deduplication in MRS
- Syncing patient photos or documents
- Supporting non-OpenMRS systems (interface is abstract, but only OpenMRS implemented)

## Decisions

### 1. Interface Design: `createPatient(patient: NewPatient): Promise<MRSPatient>`

**Decision:** Add a single `createPatient()` method that takes a `NewPatient` type and returns the created `MRSPatient` with populated `mrsId`.

**Rationale:** Mirrors the existing `createAppointment()` pattern. The interface accepts canonical types and the adapter handles MRS-specific transformation.

**NewPatient type:**
```typescript
interface NewPatient {
  givenName: string;
  familyName: string;
  dateOfBirth: Date;
  gender?: string;
  phone?: string;
  phoneType?: 'mobile' | 'home';
}
```

**Alternatives considered:**
- Pass raw MRS-specific payload → Rejected: breaks abstraction
- Multiple methods (createPerson, linkIdentifier) → Rejected: too complex for callers

### 2. OpenMRS Patient Creation: Nested Person Structure

**Decision:** Create patient via `POST /patient` with nested person object, following OpenMRS's data model.

**OpenMRS payload structure:**
```json
{
  "person": {
    "names": [{ "givenName": "Jane", "familyName": "Doe", "preferred": true }],
    "gender": "F",
    "birthdate": "1990-01-15",
    "attributes": [
      { "attributeType": "<phone-attr-uuid>", "value": "+1234567890" }
    ]
  },
  "identifiers": [
    { "identifier": "<generated>", "identifierType": "<type-uuid>", "location": "<location-uuid>" }
  ]
}
```

**Rationale:** This is how OpenMRS expects patient data. The adapter abstracts this complexity from callers.

**Configuration needed:**
- Phone attribute type UUID (varies by installation)
- Default identifier type UUID
- Default location UUID for identifiers

### 3. Real-Time vs Background Sync

**Decision:** Real-time first, with background fallback.

**Flow:**
1. `save-new-patient` tool creates patient locally
2. Immediately attempts to push to MRS via `adapter.createPatient()`
3. If successful: update local record with `mrsId`, `syncedToMrs: true`
4. If failed: mark `lastSyncError`, let background sync retry

**Rationale:** Real-time gives immediate confirmation to callers. Background sync handles transient failures.

**Alternatives considered:**
- Background only → Rejected: delays MRS availability, callers can't get mrsId immediately
- Real-time only with no retry → Rejected: transient failures would leave patients orphaned

### 4. Identifier Generation

**Decision:** Generate identifiers locally using a configurable pattern.

**Options:**
- Use OpenMRS auto-generation → Requires identifier source configuration
- Generate locally with pattern → More predictable, works across installations

**Pattern:** `ELISE-{timestamp}-{random}` (e.g., `ELISE-20260204-A7B3`)

**Rationale:** Avoids dependency on OpenMRS identifier source configuration while ensuring uniqueness.

### 5. Sync Tracking Fields

**Decision:** Add same fields as Appointment model for consistency.

```prisma
model Patient {
  // ... existing fields
  syncedToMrs    Boolean   @default(false)
  syncedToMrsAt  DateTime?
  lastSyncError  String?
  syncAttempts   Int       @default(0)
}
```

**Rationale:** Mirrors appointment sync tracking. Enables same retry/backoff logic.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Phone attribute UUID varies by installation | Make configurable via env var `OPENMRS_PHONE_ATTR_UUID` |
| Identifier type/location UUID varies | Make configurable via env vars |
| Duplicate patient creation (race condition) | Check for existing patient by phone before creating |
| OpenMRS validation errors | Parse error response, surface meaningful message |
| Real-time push adds latency to tool response | Timeout after 5s, fall back to background sync |

## Migration Plan

1. Add sync tracking columns to Patient table (Prisma migration)
2. Backfill existing patients: set `syncedToMrs: true` for patients with non-local mrsId
3. Deploy code changes
4. Configure OpenMRS attribute/identifier UUIDs
5. Monitor sync errors via logs

**Rollback:** Remove env vars to disable MRS push; patients continue to work locally.

## Open Questions

- [ ] What identifier type should be used? (Need to check O3 demo configuration)
- [ ] Should we verify patient doesn't already exist in MRS before creating? (By phone? Name+DOB?)
- [ ] How to handle MRS-created patients that get re-registered via voice? (Merge? Reject?)
