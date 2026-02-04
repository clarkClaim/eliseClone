# Elise Clone - Project Context

AI-powered healthcare scheduling assistant. See `README.md` for full architecture.

## Current State

**Phase 1: Project Scaffolding** - Complete

The database schema, project structure, and local development environment are fully implemented. All models (Patient, Provider, Appointment, Availability, Waitlist, Job queue, etc.) are in place with PostgreSQL + Prisma.

**Next: Phase 2 - MRS Integration**

Build the Sync Service that connects to OpenMRS. Key considerations documented in `docs/PHASE2_SYNC_CONSIDERATIONS.md`.

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

## Key Documentation

| File | Purpose |
|------|---------|
| `README.md` | Architecture overview, system components, quick start |
| `docs/TECHNICAL_EXPLORATION.md` | Design decisions, trade-offs, research |
| `docs/DESIGN_DECISIONS.md` | Architectural choices and rationale |
| `docs/PHASE2_SYNC_CONSIDERATIONS.md` | Schema additions needed for MRS sync |

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
