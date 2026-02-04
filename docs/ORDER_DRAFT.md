Phase 1: Foundation           [First]
  ├── Project scaffold (TypeScript, Docker, etc.)
  ├── Database schema + migrations
  └── Basic Express server

  Phase 2: MRS Integration
  ├── MRS Adapter interface
  ├── OpenMRS implementation
  └── Sync service

  Phase 3: Scheduling Core
  ├── Scheduling tools (check, book, cancel)
  └── Optimistic locking

  Phase 4: Agent
  ├── Tool webhook endpoint
  ├── Patient identification
  ├── Session management
  └── VAPI assistant configuration

  Phase 5: Waitlist
  ├── Waitlist entries + matching
  └── Outbound call triggers

  Phase 6: Deploy
  ├── Fly.io configuration
  └── End-to-end testing

  Ready to start implementing? You can:
  - /opsx:ff phase-1-foundation — Fast-forward through artifacts for Phase 1
  - /opsx:new phase-1-foundation — Step through artifacts one by one

  Or continue exploring if there's anything else to clarify first.
