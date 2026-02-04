## Why

The Elise Clone project has comprehensive documentation (README, design decisions, technical exploration) but no implementation code. We need project scaffolding to establish the foundation: build tools, folder structure, database schema, and local development environment.

## What Changes

- Add Node.js/TypeScript project configuration (package.json, tsconfig.json)
- Add Docker Compose for local PostgreSQL development
- Create `src/` folder structure matching the documented architecture
- Implement initial database schema with migrations
- Add environment configuration (.env.example)
- Add basic npm scripts for development workflow

## Capabilities

### New Capabilities

- `project-setup`: TypeScript/Node.js project configuration, build tools, and development scripts
- `database-schema`: PostgreSQL schema implementation including all tables from technical exploration (patients, providers, appointments, waitlist, jobs, etc.)
- `local-development`: Docker Compose configuration and environment setup for local development

### Modified Capabilities

(none - this is greenfield scaffolding)

## Impact

- Creates foundational project structure that all future components will build upon
- Establishes database schema that Agent Core, Sync Service, and other components will depend on
- Sets up local development environment for contributors
