# Design: Project README

## Context

This is a greenfield project with OpenSpec tooling configured but no application code yet. The README serves as the foundational document that will guide all future development.

## Goals / Non-Goals

**Goals:**
- Establish clear mental model of the system architecture
- Document all technology decisions and rationale
- Provide actionable quick start for contributors
- Set clear scope boundaries (MVP vs backlog)

**Non-Goals:**
- Detailed API documentation (separate docs later)
- Tutorial-style walkthroughs (keep it reference-focused)
- Marketing language (this is a technical demo)

## Document Structure

```
README.md
├── Header (name, one-liner, badges)
├── Overview
│   ├── What is this?
│   └── Architecture diagram (ASCII)
├── System Components (7 components)
│   ├── 1. Voice/Chat Agent Core
│   ├── 2. Scheduling Tools/APIs
│   ├── 3. Context Store
│   ├── 4. MRS Adapter Layer
│   ├── 5. OpenMRS Integration
│   ├── 6. Sync Service
│   ├── 7. Waitlist Scheduler
│   └── [Backlogged] Admin UI
├── Technology Stack
│   └── Table with choices + rationale
├── Quick Start
│   ├── Prerequisites
│   ├── Setup steps
│   └── Verification
├── Deployment (Fly.io)
├── Environment Variables
├── Project Scope
│   ├── MVP scope
│   └── Backlogged features
└── License
```

## Decisions

### Decision 1: ASCII architecture diagram

Use ASCII art for the architecture diagram rather than an image. Rationale:
- Works in all contexts (terminal, GitHub, editors)
- Easy to update as architecture evolves
- No external image hosting needed

### Decision 2: Component numbering

Number the components 1-7 to establish shared vocabulary. When discussing "component 3" everyone knows we mean the Context Store.

### Decision 3: Separate MRS Adapter from OpenMRS Integration

Document the MRS Adapter Layer (abstract interface) separately from OpenMRS Integration (concrete implementation). This reinforces the multi-tenant design even though we only have one implementation.

### Decision 4: Environment variables section

List all required env vars with descriptions but NOT actual values. Reference `.env.example` for template.
