# Proposal: Add Project README

## Why

This project needs foundational documentation that establishes the vision, architecture, and component breakdown for the Elise Clone demo—an AI-powered healthcare communication system. Without this README, contributors (including AI assistants) won't have the context needed to work effectively on the codebase.

## What Changes

- Add comprehensive README.md at project root
- Document the 7 major system components and their relationships
- Establish technology choices and rationale
- Define scope (scheduling-focused MVP, chat + voice modes)
- Note backlogged items (internal UI)

## Key Decisions Captured

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment | Fly.io | Simple, one-command deploy, good free tier |
| MRS System | OpenMRS Demo (hosted) | Faster to start, acceptable data resets for demo |
| MRS Abstraction | Required | Multi-tenant by design, swap MRS backends per customer |
| Context Store | PostgreSQL | One database for everything, simplicity |
| Job Queue | PostgreSQL | pg_notify + polling table, no extra infrastructure |
| Agent Core | Unified | Shared logic for voice (VAPI) and chat, adapters per channel |
| Language | TypeScript/Node | Everywhere, consistency across stack |
| Appointment Flow | Book → Confirm → Remind | Standard healthcare scheduling pattern |

## Capabilities

### New Capabilities

- `project-documentation`: Central reference document explaining system architecture, components, and development approach

## Impact

- `README.md`: New file at project root (~200-300 lines)

## Out of Scope (Backlogged)

- Internal admin UI (component #6)
- Multi-MRS implementation (abstraction designed, but only OpenMRS implemented)
- Billing & payment features
- Email/SMS channels (voice + chat only for MVP)
