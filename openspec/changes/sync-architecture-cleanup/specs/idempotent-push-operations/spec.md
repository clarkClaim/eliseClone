## ADDED Requirements

### Requirement: Idempotency Keys for Push Jobs

Push jobs SHALL include idempotency keys to prevent duplicate operations on retry.

#### Scenario: Idempotency key generated on job creation
- **WHEN** a push job is created (appointment or cancellation)
- **THEN** the job SHALL be assigned a unique `idempotencyKey` (UUID)
- **AND** the key SHALL be stored in the Job record

#### Scenario: Idempotency key included in MRS request
- **WHEN** a push job executes
- **THEN** the adapter call SHALL include the `idempotencyKey`
- **AND** MRS systems that support idempotency SHALL use it to deduplicate

#### Scenario: Idempotency key preserved on retry
- **WHEN** a push job fails and retries
- **THEN** the same `idempotencyKey` SHALL be used
- **AND** the MRS SHALL recognize it as a retry, not a new request

---

### Requirement: Duplicate Detection Fallback

For MRS systems that don't support idempotency keys, the adapter SHALL detect potential duplicates before creating.

#### Scenario: Check for existing appointment before create
- **WHEN** `adapter.createAppointment()` is called
- **AND** the MRS does not support idempotency keys
- **THEN** the adapter SHALL first check for existing appointment with:
  - Same patient
  - Same service
  - Same start time (within 1 minute tolerance)
- **AND** return the existing appointment if found instead of creating duplicate

#### Scenario: Log potential duplicate detection
- **WHEN** a potential duplicate is detected
- **THEN** the adapter SHALL log an info message with:
  - Original appointment ID
  - Push job ID
  - Detection reason
- **AND** the push job SHALL be marked as successful

---

### Requirement: Idempotency Key Database Schema

The Job table SHALL support storing idempotency keys.

#### Scenario: Job table has idempotency key column
- **WHEN** the database schema is applied
- **THEN** the Job table SHALL have an `idempotencyKey` column (String, nullable)
- **AND** the column SHALL have a unique index

#### Scenario: Existing jobs have null idempotency key
- **WHEN** migration runs on existing database
- **THEN** existing jobs SHALL have `idempotencyKey = null`
- **AND** new jobs SHALL always have an idempotency key

---

### Requirement: Adapter Capability for Idempotency

The adapter capabilities SHALL indicate whether the MRS supports idempotency keys.

#### Scenario: Capability declaration
- **WHEN** an adapter defines its capabilities
- **THEN** it SHALL include `sync.supportsIdempotencyKeys: boolean`
- **AND** this SHALL indicate whether the MRS can handle idempotency keys

#### Scenario: Push logic checks capability
- **WHEN** a push job executes
- **AND** `adapter.capabilities.sync.supportsIdempotencyKeys` is false
- **THEN** the duplicate detection fallback SHALL be used
