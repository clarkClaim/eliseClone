## 1. Project Configuration

- [x] 1.1 Create package.json with name, version, type "module", and initial scripts
- [x] 1.2 Create tsconfig.json with strict mode and ES module settings
- [x] 1.3 Install dependencies: typescript, tsx, dotenv, @types/node
- [x] 1.4 Install Prisma: prisma (dev), @prisma/client

## 2. Source Structure

- [x] 2.1 Create src/ folder structure: agent/, db/, mrs/, sync/, waitlist/
- [x] 2.2 Add placeholder index.ts files in each folder
- [x] 2.3 Create src/server.ts as main entry point
- [x] 2.4 Initialize Prisma with `npx prisma init`
- [x] 2.5 Create src/db/client.ts to export Prisma client instance

## 3. Environment Setup

- [x] 3.1 Create .env.example with all documented variables
- [x] 3.2 Update .gitignore to exclude node_modules, dist, .env
- [x] 3.3 Create docker-compose.yml with PostgreSQL service

## 4. Prisma Schema

- [x] 4.1 Define Patient and PatientPhone models
- [x] 4.2 Define Provider, Location, and AppointmentType models
- [x] 4.3 Define Availability model with version field for optimistic locking
- [x] 4.4 Define Appointment model with status enum
- [x] 4.5 Define WaitlistEntry model with preferences and priority
- [x] 4.6 Define Job model with status enum and scheduling fields
- [x] 4.7 Define Conversation and Escalation models
- [x] 4.8 Define SyncState model
- [x] 4.9 Add indexes for performance (phone lookup, availability search, pending jobs)
- [x] 4.10 Run initial migration with `npx prisma migrate dev`
- [x] 4.11 Add raw SQL migration for book_appointment function (optimistic locking)
- [x] 4.12 Add raw SQL migration for claim_job function (FOR UPDATE SKIP LOCKED)

## 5. Verification

- [x] 5.1 Verify docker compose up starts PostgreSQL successfully
- [x] 5.2 Verify npx prisma migrate dev creates all tables
- [x] 5.3 Verify npm run dev starts the server
- [x] 5.4 Verify npm run build compiles TypeScript to dist/
- [x] 5.5 Verify Prisma Client types are generated and importable
