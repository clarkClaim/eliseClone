## ADDED Requirements

### Requirement: Design document exists at project root
The system SHALL have a `DESIGN.md` file in the project root directory containing the complete interview-ready design document.

#### Scenario: Document is accessible
- **WHEN** a reviewer navigates to the project root
- **THEN** they find a `DESIGN.md` file that renders properly in GitHub/VS Code

### Requirement: Document includes 5-minute overview section
The document SHALL begin with a brief overview section that covers the essential architecture in 5 minutes or less.

#### Scenario: Quick overview content
- **WHEN** a reader reads only the overview section
- **THEN** they understand: (1) what the system does, (2) the main components, (3) key design patterns, (4) how to try the demo

### Requirement: Document includes high-level architecture diagram
The document SHALL include an ASCII art diagram showing all major system components and their relationships.

#### Scenario: Diagram shows complete architecture
- **WHEN** viewing the architecture diagram
- **THEN** the following components are visible: Patient Channels (Voice/Chat), Agent Core, Scheduling Tools, Context Store, MRS Adapter Layer, Sync Service

#### Scenario: Diagram renders universally
- **WHEN** viewing the document in terminal, GitHub, or VS Code
- **THEN** the ASCII diagram renders correctly without external dependencies

### Requirement: Document explains MRS Adapter pattern
The document SHALL explain the abstract MRS adapter interface and why it exists.

#### Scenario: Adapter pattern explanation
- **WHEN** reading the MRS Adapter section
- **THEN** the reader understands: (1) the problem of multiple EMR systems, (2) the abstract interface approach, (3) concrete implementations (OpenMRS, OpenEMR), (4) capability discovery pattern

#### Scenario: Interface code example
- **WHEN** viewing the MRS Adapter section
- **THEN** a TypeScript interface snippet shows key methods (connect, getPatients, createAppointment, etc.)

### Requirement: Document explains local cache and sync strategy
The document SHALL explain why a local PostgreSQL cache is used instead of direct EMR queries.

#### Scenario: Sync strategy rationale
- **WHEN** reading the sync strategy section
- **THEN** the reader understands: (1) EMR rate limits, (2) real-time booking requirements, (3) conflict resolution approach, (4) sync intervals by entity type

#### Scenario: Sync flow diagram
- **WHEN** viewing the sync section
- **THEN** a diagram or description shows the MRS → Local → MRS data flow

### Requirement: Document explains VAPI voice integration
The document SHALL explain how voice AI is integrated using VAPI.

#### Scenario: Voice architecture explanation
- **WHEN** reading the voice integration section
- **THEN** the reader understands: (1) VAPI webhook model, (2) agent tools (identify_patient, book_appointment, etc.), (3) assistant prompt architecture, (4) multi-office configuration

#### Scenario: Tool list included
- **WHEN** viewing the voice section
- **THEN** all agent tools are listed with brief descriptions of their purpose

### Requirement: Document explains single-tenant deployment model
The document SHALL explain the single-tenant/single-location deployment approach and its rationale.

#### Scenario: Deployment model rationale
- **WHEN** reading the deployment section
- **THEN** the reader understands: (1) one deployment per medical office, (2) profile system for different MRS backends, (3) simplicity vs. multi-tenant trade-offs

### Requirement: Document describes Claude Code iteration workflow
The document SHALL explain how Claude Code is used for rapid voice UX iteration.

#### Scenario: Iteration workflow explanation
- **WHEN** reading the development workflow section
- **THEN** the reader understands: (1) reviewing VAPI call transcripts, (2) identifying voice UX issues, (3) updating assistant prompts, (4) rapid test cycles

#### Scenario: VAPI commands listed
- **WHEN** viewing the workflow section
- **THEN** key commands are shown (pnpm run vapi:logs, pnpm run vapi:setup, etc.)

### Requirement: Document includes live demo instructions
The document SHALL include clear instructions for calling and testing the live demo.

#### Scenario: Demo phone number prominently displayed
- **WHEN** reading the demo section
- **THEN** the phone number +1-667-677-9143 is clearly visible

#### Scenario: Demo script provided
- **WHEN** preparing to call the demo
- **THEN** the reader has suggested conversation flows to try (identify as patient, check availability, book appointment)

#### Scenario: Expected behavior documented
- **WHEN** the demo behaves unexpectedly or is down
- **THEN** the document describes expected behavior so reviewers know what should happen
