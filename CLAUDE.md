# Elise Clone - Project Context

AI-powered healthcare scheduling assistant. See `README.md` for full architecture.

## Current State

**Phase 1: Project Scaffolding** - Complete

The database schema, project structure, and local development environment are fully implemented. All models (Patient, Provider, Appointment, Availability, Waitlist, Job queue, etc.) are in place with PostgreSQL + Prisma.

**Phase 2: MRS Integration** - In Progress

Sync Service connecting to OpenMRS. Key considerations documented in `docs/PHASE2_SYNC_CONSIDERATIONS.md`.

**Phase 3: Agent Patient ID** - Complete

VAPI voice integration for patient identification:
- Express server with VAPI webhook endpoints (`/vapi/tools`)
- `identify_patient` tool - lookup by phone (caller ID) + DOB, fallback to name
- `save_new_patient` tool - register new patients
- `get_availability` tool - flexible availability search with business hours, lead time
- `book_appointment` tool - book appointments with conflict handling
- Seed data with 8 test patients

## VAPI Assistant Config Architecture

The assistant prompt system uses a **centralized template** approach:

```
config/assistants/
├── _base_assistant.json    # Centralized prompt with {{VARIABLE}} placeholders
├── evergreen.json          # Office config: template vars + overrides
└── maple-grove.json        # Office config: template vars + overrides
```

**How it works:**
- `_base_assistant.json` contains the full system prompt with `{{OFFICE_NAME}}`, `{{STYLE_TONE}}`, etc.
- Office configs (e.g., `evergreen.json`) provide variable values and VAPI setting overrides (voice, delays)
- `pnpm run vapi:setup` merges base + variables + overrides and deploys to VAPI

**To update the assistant prompt:** Edit `_base_assistant.json`, then run `pnpm run vapi:setup`.

**Office config structure:**
```json
{
  "profile": "emr",
  "template": {
    "ASSISTANT_NAME": "Elise - Evergreen Health",
    "OFFICE_NAME": "Evergreen Health",
    "STYLE_TONE": "Friendly and caring"
  },
  "overrides": {
    "voice": { "provider": "deepgram", "voiceId": "asteria" }
  }
}
```

## OpenSpec Workflow

This project uses OpenSpec for structured change management. Changes go through:

1. **Proposal** - Problem statement, goals, success criteria
2. **Design** - Technical approach, components, data flow
3. **Specs** - Detailed capability specifications
4. **Tasks** - Implementation checklist
5. **Archive** - Completed changes move to `openspec/changes/archive/`

### Commands

```
/opsx:new         - Start a new change
/opsx:continue    - Create next artifact
/opsx:ff          - Fast-forward through artifacts
/opsx:apply       - Implement tasks
/opsx:verify      - Verify implementation
/opsx:archive     - Archive completed change
/opsx:explore     - Think through problems before/during changes
```

### Current Main Specs

Located in `openspec/specs/`:

- `project-setup/` - TypeScript config, dependencies, folder structure
- `database-schema/` - Prisma models, indexes, stored procedures
- `local-development/` - Docker Compose, environment setup
- `project-documentation/` - README structure

### Archived Changes

- `2026-02-04-add-project-readme` - Initial README
- `2026-02-04-project-scaffolding` - Full project setup with database schema
- `2026-02-05-existing-appointments-tool-stale` - Superseded by v2 (used old config paths)

### Active Changes

- `existing-appointments-v2` - Add upcoming appointments to identify_patient response

## Key Documentation

| File | Purpose |
|------|---------|
| `README.md` | Architecture overview, system components, quick start |
| `docs/TECHNICAL_EXPLORATION.md` | Design decisions, trade-offs, research |
| `docs/DESIGN_DECISIONS.md` | Architectural choices and rationale |
| `docs/PHASE2_SYNC_CONSIDERATIONS.md` | Schema additions needed for MRS sync |
| `docs/VAPI_SETUP.md` | Step-by-step VAPI configuration guide |
| `docs/VOICE_IDEAS.md` | Voice provider options and recommendations |

## Tech Stack

- **Runtime:** TypeScript / Node.js
- **Package Manager:** pnpm (use `pnpm` not `npm`)
- **Database:** PostgreSQL + Prisma 7 (with driver adapters)
- **Voice:** VAPI
- **MRS:** OpenMRS (demo instance)
- **Deploy:** Fly.io

## Development

```bash
docker compose up -d      # Start PostgreSQL
pnpm run dev              # Start server with hot reload
pnpm run build            # Compile TypeScript
pnpm exec prisma studio   # Browse database
pnpm exec prisma migrate dev  # Run migrations
```

## VAPI Commands

```bash
pnpm run vapi:setup       # Deploy assistant configs to VAPI (all offices)
pnpm run vapi:setup evergreen  # Deploy specific office only
pnpm run vapi:logs        # List recent calls
pnpm run vapi:logs --last # Show transcript of last call
pnpm run vapi:list        # List assistants and phone numbers
```
