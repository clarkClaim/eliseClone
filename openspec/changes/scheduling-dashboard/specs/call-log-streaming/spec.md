## ADDED Requirements

### Requirement: Live calls panel shows recent activity

The UI SHALL display a panel showing recent and in-progress voice calls.

#### Scenario: Calls panel visible in dashboard

- **WHEN** user is on any dashboard view
- **THEN** a collapsible calls panel is visible (sidebar or bottom panel)

#### Scenario: Recent calls listed in reverse chronological order

- **WHEN** calls panel is expanded
- **THEN** up to 20 most recent calls are displayed newest-first

#### Scenario: Call entry shows caller info

- **WHEN** a call is displayed
- **THEN** entry shows caller phone number (masked: ***-***-1234) and timestamp

---

### Requirement: Calls auto-refresh via polling

The UI SHALL poll for new calls at regular intervals.

#### Scenario: Poll every 3 seconds

- **WHEN** calls panel is visible
- **THEN** API is polled every 3 seconds for new calls

#### Scenario: New calls appear at top

- **WHEN** a new call is detected in poll response
- **THEN** it appears at the top of the list with highlight animation

#### Scenario: Polling pauses when panel collapsed

- **WHEN** user collapses the calls panel
- **THEN** polling stops to reduce server load

---

### Requirement: Call status indicated visually

The UI SHALL show call status with visual indicators.

#### Scenario: In-progress call shows live indicator

- **WHEN** a call has no outcome set (still in progress)
- **THEN** a pulsing dot or "Live" badge is displayed

#### Scenario: Completed call shows outcome

- **WHEN** a call has outcome set
- **THEN** outcome is displayed (e.g., "Booked", "Identified", "Escalated")

#### Scenario: Color coding by outcome

- **WHEN** calls have different outcomes
- **THEN** success outcomes are green, escalations are yellow, failures are red

---

### Requirement: Click call shows transcript/details

The UI SHALL display call details when clicked.

#### Scenario: Click call opens detail panel

- **WHEN** user clicks a call entry
- **THEN** expanded detail view shows call information

#### Scenario: Detail shows patient if identified

- **WHEN** call has associated patientId
- **THEN** patient name is displayed with link to patient detail

#### Scenario: Detail shows actions taken

- **WHEN** call resulted in booking or other action
- **THEN** action summary is displayed (e.g., "Booked appointment for Feb 5 at 2pm")

---

### Requirement: Filter calls by status or date

The UI SHALL allow filtering the calls list.

#### Scenario: Filter by today only

- **WHEN** user selects "Today" filter
- **THEN** only calls from today are displayed

#### Scenario: Filter by outcome type

- **WHEN** user selects an outcome filter (e.g., "Booked")
- **THEN** only calls with that outcome are displayed

#### Scenario: Clear filters

- **WHEN** user clicks clear filters
- **THEN** all recent calls are displayed again

---

### Requirement: Call notification for new activity

The UI SHALL notify when new calls arrive while panel is collapsed.

#### Scenario: Badge shows new call count

- **WHEN** calls panel is collapsed and new calls arrive
- **THEN** a badge shows count of new calls since last viewed

#### Scenario: Badge clears on panel open

- **WHEN** user expands the calls panel
- **THEN** the new calls badge is cleared

#### Scenario: Optional audio notification

- **WHEN** user has enabled audio notifications in settings
- **THEN** a subtle chime plays when new call arrives
