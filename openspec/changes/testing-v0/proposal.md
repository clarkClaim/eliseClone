# Testing Infrastructure v0

## Problem Statement

The Elise Clone system has grown to include multiple interconnected components:
- VAPI voice tools (identify_patient, save_new_patient, get_availability, book_appointment)
- Scheduling services (availability computation, conflict detection, booking)
- MRS integration (OpenMRS/Bahmni adapter, sync service)
- Database operations (Prisma models, queries)

Currently, validation is done via ad-hoc test scripts. We need a proper test suite that:
1. Catches regressions automatically
2. Documents expected behavior
3. Runs quickly in CI
4. Supports testing against real O3 when needed

## Goals

1. **Fast feedback loop** - Tests should run in seconds, not minutes
2. **Confidence in changes** - Core flows covered by tests
3. **Clear test boundaries** - Unit vs integration vs E2E clearly separated
4. **O3 testing opt-in** - Live MRS tests runnable on demand, not blocking CI

## Proposed Solution

### Test Framework: Vitest

Vitest is chosen for:
- Native ESM support (matches our codebase)
- Fast execution with smart caching
- TypeScript support out of the box
- Compatible with Jest API (familiar patterns)
- Built-in coverage reporting

### Test Categories

#### 1. Unit Tests (`src/**/*.test.ts`)

Fast, isolated tests with no external dependencies.

**Scope:**
- `src/utils/date.ts` - Date parsing, formatting, relative dates
- `src/utils/phone.ts` - Phone normalization
- `src/scheduling/availability-service.ts` - Time window generation, overlap detection
- `src/scheduling/booking-service.ts` - Conflict checking logic
- `src/mrs/adapters/openmrs/mappers.ts` - Data transformation

**Mocking:**
- Prisma client mocked
- No network calls
- No database

#### 2. Integration Tests (`tests/integration/*.test.ts`)

Test component interactions with real database, no external services.

**Scope:**
- VAPI tools end-to-end (identify_patient → book_appointment flow)
- Booking with conflict detection
- Availability computation from templates
- Patient identification flows (phone, name+DOB, new patient)

**Setup:**
- Fresh database per test suite (or transaction rollback)
- Seed data utilities
- No MRS connection (local-only mode)

**Key test scenarios:**
- Patient identification by phone + DOB
- Patient identification by name + DOB (fallback)
- New patient registration
- Get availability for various dates
- Book appointment successfully
- Book appointment with conflict (should fail)
- Book outside provider hours (should fail)
- Cancel appointment

#### 3. O3 Live Tests (`tests/o3/*.test.ts`)

Integration tests against real OpenMRS O3 demo instance.

**Scope:**
- MRS adapter connection and health check
- Patient search and sync
- Conflict detection against real appointments
- Appointment creation in O3
- Schedule config fetching

**Execution:**
- NOT run in CI by default
- Manual trigger: `pnpm test:o3`
- Requires O3 credentials in environment
- May be flaky (depends on demo instance availability)

### Test Infrastructure

#### Database Reset Utility

```typescript
// tests/utils/db.ts
export async function resetDatabase(): Promise<void>;
export async function seedTestData(): Promise<TestData>;
export interface TestData {
  patients: Patient[];
  providers: Provider[];
  services: AppointmentType[];
}
```

#### Test Fixtures

```typescript
// tests/fixtures/index.ts
export const testPatient = { ... };
export const testProvider = { ... };
export function createPatient(overrides?: Partial<Patient>): Patient;
export function createAppointment(overrides?: Partial<Appointment>): Appointment;
```

#### Mock Factories

```typescript
// tests/mocks/prisma.ts
export function mockPrismaClient(): MockPrismaClient;

// tests/mocks/mrs-adapter.ts
export function mockMRSAdapter(): MockMRSAdapter;
```

### NPM Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run src/",
    "test:integration": "vitest run tests/integration/",
    "test:o3": "vitest run tests/o3/"
  }
}
```

### CI Configuration

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: pnpm test:unit && pnpm test:integration
  # Note: test:o3 intentionally excluded
```

## Success Criteria

- [ ] `pnpm test` runs all unit + integration tests in < 30 seconds
- [ ] Core VAPI tool flows have integration test coverage
- [ ] Scheduling service has unit test coverage for edge cases
- [ ] O3 tests can be run manually and pass against demo instance
- [ ] CI pipeline runs tests on every PR

## Out of Scope

- E2E tests with actual VAPI calls (would require VAPI test mode)
- Load/performance testing
- Visual regression testing
- Mobile app testing

## Open Questions

1. Should we use a test database or SQLite for faster integration tests?
2. Do we need snapshot testing for API responses?
3. Should O3 tests create and clean up their own test data, or use existing demo data?

## Dependencies

- vitest
- @vitest/coverage-v8 (optional, for coverage)
- Potentially: testcontainers (for isolated Postgres in CI)
