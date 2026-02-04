## Context

The Elise Clone project has detailed documentation covering architecture, design decisions, and technical exploration, but no implementation code exists. This design covers the foundational scaffolding needed before any feature work can begin.

Key constraints from existing docs:
- TypeScript/Node.js stack (per README)
- PostgreSQL for everything (data, cache, job queue)
- Docker for local development and deployment parity
- Fly.io as target deployment platform

## Goals / Non-Goals

**Goals:**
- Establish a working TypeScript/Node.js project with modern tooling
- Implement the database schema from TECHNICAL_EXPLORATION.md
- Enable local development with a single `docker compose up` + `npm run dev`
- Create folder structure that maps to documented architecture

**Non-Goals:**
- Implementing any business logic (Agent Core, MRS adapter, etc.)
- Setting up CI/CD pipelines
- Production deployment configuration
- Testing framework setup (beyond basic structure)

## Decisions

### 1. TypeScript Configuration

**Decision:** Use strict TypeScript with ES modules (ESM).

**Rationale:** ESM is the modern standard, and strict mode catches errors early. The project is greenfield so no CommonJS compatibility needed.

**Alternatives considered:**
- CommonJS: Would work but ESM is the future direction for Node.js

### 2. Database Migrations & ORM

**Decision:** Use Prisma as the ORM and migration tool.

**Rationale:** Prisma provides type-safe database access, automatic migration generation, and excellent TypeScript integration. The schema SDL is declarative and easy to evolve. Prisma Client gives us type-safe queries without writing raw SQL.

**Alternatives considered:**
- Raw SQL with node-pg-migrate: More control but loses type safety and requires more boilerplate
- Drizzle ORM: Good alternative but Prisma has better docs and larger ecosystem

### 3. Project Structure

**Decision:** Flat src/ structure matching README's architecture diagram:
```
src/
├── agent/           # [1] Agent Core (future)
│   ├── adapters/    # Channel adapters
│   └── tools/       # [2] Scheduling tools
├── db/              # [3] Context Store query helpers
│   └── client.ts    # Prisma client export
├── mrs/             # [4] MRS Adapter Layer
│   └── openmrs/     # [5] OpenMRS implementation
├── sync/            # [6] Sync Service
├── waitlist/        # [7] Waitlist Scheduler
└── server.ts        # HTTP server entry point
prisma/
└── schema.prisma    # [3] Context Store schema (no tenant_id for now)
```

**Rationale:** Matches documented architecture 1:1, making it easy to navigate.

### 4. Environment Configuration

**Decision:** Use dotenv with .env.example template.

**Rationale:** Simple, widely understood pattern. The existing README already references .env.example.

## Risks / Trade-offs

**Risk:** Schema may need iteration as implementation progresses.
→ **Mitigation:** Prisma migrations allow incremental changes. Schema is declarative and easy to evolve.

**Risk:** Prisma abstraction may not support all PostgreSQL features (e.g., FOR UPDATE SKIP LOCKED).
→ **Mitigation:** Can use Prisma's raw query API (`$queryRaw`) for advanced PostgreSQL features like the job claim function.

**Risk:** ESM compatibility issues with some npm packages.
→ **Mitigation:** Most modern packages support ESM. Can add shims if needed for specific packages.
