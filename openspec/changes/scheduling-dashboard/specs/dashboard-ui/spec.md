## ADDED Requirements

### Requirement: Dashboard layout with navigation

The UI SHALL provide a main layout with sidebar navigation between views.

#### Scenario: Navigation sidebar visible

- **WHEN** user opens the dashboard
- **THEN** a sidebar shows navigation links for Calendar, Patients, and Calls

#### Scenario: Navigate between views

- **WHEN** user clicks a navigation link
- **THEN** the main content area updates to show the selected view
- **AND** the URL updates to reflect the current view

#### Scenario: Active navigation state

- **WHEN** user is on a specific view
- **THEN** the corresponding navigation link is visually highlighted

---

### Requirement: Calendar view with day/week/month modes

The UI SHALL provide a calendar view that displays appointments in multiple time scales.

#### Scenario: Default to week view

- **WHEN** user navigates to the Calendar view
- **THEN** the current week is displayed with appointments shown as blocks

#### Scenario: Switch between view modes

- **WHEN** user clicks Day, Week, or Month toggle
- **THEN** calendar updates to show the selected time scale

#### Scenario: Navigate to previous/next period

- **WHEN** user clicks previous or next arrow
- **THEN** calendar shifts by one day/week/month based on current mode

#### Scenario: Today button returns to current date

- **WHEN** user clicks "Today" button
- **THEN** calendar navigates to include the current date

---

### Requirement: Appointment blocks display key info

The UI SHALL display appointments as visual blocks with patient and time information.

#### Scenario: Appointment block shows patient name

- **WHEN** viewing the calendar
- **THEN** each appointment block displays the patient's name

#### Scenario: Appointment block shows time

- **WHEN** viewing day or week view
- **THEN** appointment blocks are positioned according to their start/end times

#### Scenario: Color coding by status

- **WHEN** appointments have different statuses
- **THEN** blocks are color-coded (scheduled=blue, completed=green, cancelled=gray)

---

### Requirement: Click appointment to view details

The UI SHALL display appointment details in a modal when clicked.

#### Scenario: Open appointment detail modal

- **WHEN** user clicks an appointment block
- **THEN** a modal opens showing full appointment details

#### Scenario: Modal shows patient link

- **WHEN** appointment detail modal is open
- **THEN** patient name is a clickable link to patient detail view

#### Scenario: Modal shows appointment actions

- **WHEN** appointment detail modal is open
- **THEN** buttons for Reschedule and Cancel are visible

---

### Requirement: Create appointment from calendar

The UI SHALL allow creating new appointments by clicking empty time slots.

#### Scenario: Click empty slot opens create form

- **WHEN** user clicks an empty time slot in day/week view
- **THEN** a modal opens with appointment creation form
- **AND** date and time are pre-filled based on clicked slot

#### Scenario: Create form requires patient selection

- **WHEN** user fills out create appointment form
- **THEN** patient field is required with typeahead search

#### Scenario: Submit creates appointment

- **WHEN** user submits valid appointment form
- **THEN** appointment is created via API
- **AND** calendar refreshes to show new appointment

---

### Requirement: Patient list view with search

The UI SHALL provide a searchable list of all patients.

#### Scenario: Patient list displays on load

- **WHEN** user navigates to Patients view
- **THEN** a paginated list of patients is displayed

#### Scenario: Search filters patient list

- **WHEN** user types in the search box
- **THEN** patient list filters to show matching names or phone numbers
- **AND** search is debounced (300ms delay)

#### Scenario: Click patient opens detail view

- **WHEN** user clicks a patient row
- **THEN** patient detail view opens

---

### Requirement: Patient detail view

The UI SHALL display full patient information and appointment history.

#### Scenario: Patient detail shows demographics

- **WHEN** viewing patient detail
- **THEN** name, date of birth, gender, and phone numbers are displayed

#### Scenario: Patient detail shows appointment history

- **WHEN** viewing patient detail
- **THEN** list of past and upcoming appointments is displayed

#### Scenario: Click appointment navigates to calendar

- **WHEN** user clicks an appointment in patient history
- **THEN** calendar view opens focused on that appointment's date

---

### Requirement: Responsive loading states

The UI SHALL show loading indicators during data fetching.

#### Scenario: Calendar shows loading skeleton

- **WHEN** appointments are being fetched
- **THEN** a loading skeleton or spinner is displayed

#### Scenario: Patient list shows loading state

- **WHEN** patients are being fetched
- **THEN** a loading indicator is displayed

#### Scenario: Error state shows retry option

- **WHEN** data fetch fails
- **THEN** an error message is displayed with a retry button
