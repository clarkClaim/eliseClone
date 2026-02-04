# seed-data Specification

## Purpose

Database seed script for populating test patients with phone numbers and dates of birth for development and demo scenarios.

## ADDED Requirements

### Requirement: Seed script exists at standard Prisma location

The project SHALL have a seed script at `prisma/seed.ts` that can be run via `pnpm exec prisma db seed`.

#### Scenario: Developer runs seed command

- **WHEN** developer runs `pnpm exec prisma db seed`
- **THEN** the seed script executes successfully
- **AND** test patient data is inserted into the database

#### Scenario: Seed script is idempotent

- **WHEN** developer runs `pnpm exec prisma db seed` multiple times
- **THEN** the script does not create duplicate records
- **AND** existing seed data is preserved or upserted

---

### Requirement: Seed data includes test patients with phone numbers

The seed script SHALL create 5-10 test patients with associated phone numbers for testing patient identification.

#### Scenario: Patients have required fields

- **WHEN** the seed script runs
- **THEN** each seeded patient has a unique `mrsId`, `name`, and `dob`
- **AND** each patient has at least one phone number in the `patient_phones` table

#### Scenario: At least one patient has multiple phone numbers

- **WHEN** the seed script runs
- **THEN** at least one patient has two or more phone numbers associated
- **AND** one phone number is marked as `isPrimary: true`

#### Scenario: Phone numbers use test prefixes

- **WHEN** the seed script runs
- **THEN** all seeded phone numbers use the 555 test prefix (e.g., +1555...)
- **AND** phone numbers are stored in E.164 format

---

### Requirement: Seed data is realistic but obviously fake

The seed script SHALL use realistic-looking but clearly fake data to prevent confusion with real patients.

#### Scenario: Names are realistic

- **WHEN** viewing seeded patient names
- **THEN** names follow realistic patterns (first name, last name)
- **AND** names are not obviously generated (no "Test User 1")

#### Scenario: DOBs span a reasonable range

- **WHEN** the seed script runs
- **THEN** seeded DOBs span at least 30 years of birth dates
- **AND** no DOBs are in the future

---

### Requirement: package.json configures Prisma seed

The `package.json` SHALL include Prisma seed configuration.

#### Scenario: Prisma knows where to find seed script

- **WHEN** `pnpm exec prisma db seed` is run
- **THEN** Prisma locates and executes `prisma/seed.ts`
- **AND** the script runs with tsx or ts-node
