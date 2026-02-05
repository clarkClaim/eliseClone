## Why

Currently, there's no way to visualize appointments, patient data, or live call activity without querying the database directly or checking the MRS. A lightweight dashboard built on top of our scheduling core would provide immediate visibility into system state, enable manual appointment management, and show real-time VAPI call activity as changes happen.

## What Changes

- Add a web-based dashboard frontend (React + Tailwind)
- Create REST API endpoints for dashboard data access
- Implement calendar views (day/week/month) for appointment visualization
- Add patient directory with search and detail views
- Integrate live VAPI call log streaming (polling or WebSocket)
- Enable manual appointment CRUD operations through the UI

## Capabilities

### New Capabilities

- `dashboard-api`: REST endpoints for fetching appointments, patients, providers, and call logs. Supports filtering, pagination, and real-time updates.
- `dashboard-ui`: React frontend with calendar views, patient directory, and live call activity panel. Responsive design inspired by EliseAI CRM.
- `call-log-streaming`: Real-time visibility into VAPI calls as they happen, showing patient identification, booking actions, and outcomes.

### Modified Capabilities

_(No existing spec requirements are changing - we're adding new read/query paths alongside existing functionality)_

## Impact

**New code:**
- `src/dashboard/` - API routes for dashboard
- `web/` or `frontend/` - React application

**Dependencies:**
- React + Tailwind CSS (or similar)
- Build tooling (Vite recommended)
- Optional: WebSocket for real-time updates

**Existing systems:**
- Uses existing Prisma models (read-only queries)
- Integrates with Conversation table for call logs
- No changes to VAPI webhook handlers or booking logic
