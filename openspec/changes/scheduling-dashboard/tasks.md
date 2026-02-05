## 1. Project Setup

- [ ] 1.1 Create `web/` directory with Vite + React + TypeScript scaffold
- [ ] 1.2 Add Tailwind CSS configuration to `web/`
- [ ] 1.3 Configure Vite proxy to forward `/api/*` to Express backend (localhost:3000)
- [ ] 1.4 Add `pnpm run web:dev` script to package.json for frontend dev server
- [ ] 1.5 Add `pnpm run web:build` script to build frontend to `web/dist/`
- [ ] 1.6 Install react-router-dom for client-side routing
- [ ] 1.7 Install react-big-calendar and date-fns for calendar functionality

## 2. Backend API - Read Endpoints

- [ ] 2.1 Create `src/dashboard/` module directory structure
- [ ] 2.2 Implement GET `/api/dashboard/appointments` with date range filtering
- [ ] 2.3 Implement GET `/api/dashboard/patients` with search and pagination
- [ ] 2.4 Implement GET `/api/dashboard/patients/:id` with appointment history include
- [ ] 2.5 Implement GET `/api/dashboard/providers` endpoint
- [ ] 2.6 Implement GET `/api/dashboard/calls` with since filter and patient include
- [ ] 2.7 Add consistent error response format middleware

## 3. Backend API - Write Endpoints

- [ ] 3.1 Implement POST `/api/dashboard/appointments` with validation
- [ ] 3.2 Add conflict detection for overlapping appointments
- [ ] 3.3 Implement PATCH `/api/dashboard/appointments/:id` for reschedule/cancel
- [ ] 3.4 Wire up dashboard routes to Express server in `src/server.ts`

## 4. Frontend - Layout & Navigation

- [ ] 4.1 Create main App layout component with sidebar
- [ ] 4.2 Add navigation links for Calendar, Patients, Calls
- [ ] 4.3 Set up react-router with routes for each view
- [ ] 4.4 Implement active navigation state highlighting
- [ ] 4.5 Create collapsible calls panel component (right sidebar)

## 5. Frontend - Calendar View

- [ ] 5.1 Create CalendarView component with react-big-calendar
- [ ] 5.2 Implement day/week/month view toggle buttons
- [ ] 5.3 Add previous/next navigation and Today button
- [ ] 5.4 Fetch appointments from API based on visible date range
- [ ] 5.5 Display appointment blocks with patient name and status color coding
- [ ] 5.6 Implement loading skeleton while fetching appointments

## 6. Frontend - Appointment Interactions

- [ ] 6.1 Create AppointmentDetailModal component
- [ ] 6.2 Open modal on appointment block click with full details
- [ ] 6.3 Add patient link in modal that navigates to patient detail
- [ ] 6.4 Add Reschedule button with date/time picker
- [ ] 6.5 Add Cancel button with confirmation dialog
- [ ] 6.6 Create CreateAppointmentModal with patient search typeahead
- [ ] 6.7 Open create modal on empty slot click with pre-filled time
- [ ] 6.8 Refresh calendar after create/update/cancel operations

## 7. Frontend - Patient Views

- [ ] 7.1 Create PatientsListView component with paginated table
- [ ] 7.2 Add search input with 300ms debounce
- [ ] 7.3 Implement pagination controls (limit/offset)
- [ ] 7.4 Create PatientDetailView component
- [ ] 7.5 Display patient demographics (name, DOB, gender, phones)
- [ ] 7.6 Display appointment history list with clickable dates
- [ ] 7.7 Navigate to calendar focused on date when appointment clicked

## 8. Frontend - Live Calls Panel

- [ ] 8.1 Create CallsPanel component for right sidebar
- [ ] 8.2 Display recent calls with masked phone numbers and timestamps
- [ ] 8.3 Implement 3-second polling with useEffect/setInterval
- [ ] 8.4 Pause polling when panel is collapsed
- [ ] 8.5 Add highlight animation for newly arrived calls
- [ ] 8.6 Show pulsing "Live" indicator for in-progress calls
- [ ] 8.7 Display outcome badge with color coding (green/yellow/red)
- [ ] 8.8 Create CallDetailPanel for expanded call view
- [ ] 8.9 Add Today/outcome type filter controls
- [ ] 8.10 Show badge count for new calls when panel collapsed

## 9. Production Build

- [ ] 9.1 Configure Express to serve `web/dist/` static files in production
- [ ] 9.2 Add catch-all route for SPA client-side routing
- [ ] 9.3 Test production build with `pnpm run web:build && pnpm start`
- [ ] 9.4 Update README with dashboard access instructions
