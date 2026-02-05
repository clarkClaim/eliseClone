## 1. Document Setup

- [ ] 1.1 Create DESIGN.md file in project root
- [ ] 1.2 Add 5-minute overview section at the top with system summary

## 2. Architecture Diagram

- [ ] 2.1 Create ASCII art architecture diagram showing all major components
- [ ] 2.2 Include: Patient Channels, Agent Core, Scheduling Tools, Context Store, MRS Adapter Layer, Sync Service
- [ ] 2.3 Verify diagram renders correctly in terminal and GitHub preview

## 3. MRS Adapter Pattern Section

- [ ] 3.1 Write explanation of the multiple-EMR problem and why abstraction is needed
- [ ] 3.2 Include TypeScript interface snippet showing key MRSAdapter methods
- [ ] 3.3 Document concrete implementations (OpenMRS, OpenEMR) and capability discovery

## 4. Local Cache and Sync Strategy Section

- [ ] 4.1 Explain why local PostgreSQL cache instead of direct EMR queries (rate limits, real-time needs)
- [ ] 4.2 Document conflict resolution approach (MRS wins for master data)
- [ ] 4.3 Include sync intervals table by entity type (availability: 5min, patients: 30min, etc.)
- [ ] 4.4 Add sync flow description or diagram (MRS → Local → MRS)

## 5. VAPI Voice Integration Section

- [ ] 5.1 Explain VAPI webhook model and how voice calls are handled
- [ ] 5.2 List all agent tools with brief descriptions (identify_patient, book_appointment, etc.)
- [ ] 5.3 Document assistant prompt architecture (base template + office variables)
- [ ] 5.4 Explain multi-office configuration via profiles

## 6. Deployment Model Section

- [ ] 6.1 Explain single-tenant/single-location deployment model
- [ ] 6.2 Document profile system (mrs, emr) for different MRS backends
- [ ] 6.3 Discuss trade-offs vs. multi-tenant architecture

## 7. Development Workflow Section

- [ ] 7.1 Describe Claude Code iteration workflow for voice UX improvement
- [ ] 7.2 Document transcript review process (pnpm run vapi:logs --last)
- [ ] 7.3 Show prompt update workflow (edit _base_assistant.json, run vapi:setup)
- [ ] 7.4 Include key VAPI commands (vapi:logs, vapi:setup, vapi:list)

## 8. Live Demo Section

- [ ] 8.1 Display demo phone number prominently: +1-667-677-9143
- [ ] 8.2 Provide suggested conversation scripts to try (identify, check availability, book)
- [ ] 8.3 Document expected behavior for each scenario
- [ ] 8.4 Include fallback notes if demo is temporarily unavailable

## 9. Final Review

- [ ] 9.1 Verify all sections are complete and flow logically
- [ ] 9.2 Check that document can be read in 5-10 minutes for overview, with deeper sections available
- [ ] 9.3 Test all code snippets for accuracy
- [ ] 9.4 Verify phone number is correct and demo is working
