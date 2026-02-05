## Context

The Elise Clone system has a working backend with:
- Express server handling VAPI webhook tool calls
- Prisma ORM with PostgreSQL (patients, providers, appointments, conversations, etc.)
- Sync service connecting to OpenMRS
- Scheduling module with availability search

Currently, operators have no visibility into system state without direct database queries. We need a lightweight admin dashboard for monitoring and manual operations.

## Goals / Non-Goals

**Goals:**
- Provide visual calendar interface for appointments (day/week/month views)
- Enable patient lookup and profile viewing
- Show live VAPI call activity as it happens
- Allow manual appointment creation, rescheduling, and cancellation
- Keep the frontend simple and maintainable (no heavy framework overhead)

**Non-Goals:**
- Multi-tenant authentication (single-user admin dashboard for now)
- Mobile-first responsive design (desktop-focused admin tool)
- Real-time collaborative editing (single operator assumption)
- Custom theming or white-labeling
- Direct MRS management (we sit on top of our core, not the MRS)

## Decisions

### Decision 1: Monorepo with separate frontend folder

**Choice:** Add `web/` folder alongside `src/` in the same repo.

**Alternatives considered:**
- Separate repo: Adds deployment complexity, harder to keep types in sync
- Embedded in `src/`: Muddies backend code structure

**Rationale:** Single repo keeps shared types simple. Vite builds to `web/dist/` which Express can serve statically in production.

---

### Decision 2: Vite + React + Tailwind CSS

**Choice:** Vite for build tooling, React for UI, Tailwind for styling.

**Alternatives considered:**
- Next.js: Overkill for admin dashboard, adds SSR complexity we don't need
- Vue/Svelte: Team familiarity with React, existing patterns in VAPI scripts
- Plain HTML/CSS: Harder to maintain calendar interactions

**Rationale:** Vite is fast, React is familiar, Tailwind keeps styling co-located. All are lightweight and well-documented.

---

### Decision 3: REST API on existing Express server

**Choice:** Add `/api/dashboard/*` routes to the existing Express server.

**Alternatives considered:**
- Separate API server: More infra to manage
- GraphQL: Overkill for known data shapes
- tRPC: Nice but adds dependency; REST is simpler for this scope

**Rationale:** Reuse existing Express app, Prisma client, and middleware. Keeps deployment simple (one service).

---

### Decision 4: Polling for real-time updates (not WebSocket)

**Choice:** Frontend polls `/api/dashboard/calls` every 2-3 seconds for live call activity.

**Alternatives considered:**
- WebSocket: More complex server state management
- Server-Sent Events: Better fit but less browser tooling support

**Rationale:** Polling is simpler to implement and debug. For an admin dashboard with one user, 2-3 second latency is acceptable. Can upgrade to SSE later if needed.

---

### Decision 5: Development proxy setup

**Choice:** Vite dev server proxies `/api/*` to Express backend.

**Rationale:** Standard pattern. In production, Express serves the built static files directly from `web/dist/`.

---

### Decision 6: Calendar library selection

**Choice:** Use a lightweight calendar component (e.g., `react-big-calendar` or custom grid).

**Alternatives considered:**
- FullCalendar: Feature-rich but heavy, complex licensing
- Custom from scratch: Time-consuming
- `react-big-calendar`: Well-maintained, reasonable size, good week/month views

**Rationale:** `react-big-calendar` provides the core views we need with drag-drop support. Can swap later if needed.

## Risks / Trade-offs

**[Polling latency]** → Acceptable for admin use. Document upgrade path to SSE if real-time becomes critical.

**[No auth]** → Dashboard is internal-only. Add basic auth header check as first task if exposing publicly.

**[Bundle size]** → Calendar libs add weight. Tree-shake aggressively, lazy-load calendar views.

**[API surface area]** → New endpoints increase attack surface. Keep read-only where possible, validate all inputs.

## Open Questions

1. **Phone number display:** Show caller phone numbers in call logs? Privacy consideration.
2. **Appointment editing:** Allow inline editing or modal-based? (Suggest modal for clarity)
3. **Timezone handling:** Display in server timezone or browser-local? (Suggest server timezone with label)
