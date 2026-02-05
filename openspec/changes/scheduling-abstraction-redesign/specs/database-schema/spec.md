## ADDED Requirements

### Requirement: ScheduleTemplate model for availability patterns
The database SHALL include a ScheduleTemplate model for storing provider availability patterns.

```prisma
model ScheduleTemplate {
  id                String    @id @default(uuid())
  providerId        String    @map("provider_id")
  serviceId         String?   @map("service_id")
  dayOfWeek         Int       @map("day_of_week")
  startTime         String    @map("start_time")
  endTime           String    @map("end_time")
  slotDurationMins  Int       @default(30) @map("slot_duration_mins")
  effectiveFrom     DateTime  @default(now()) @map("effective_from")
  effectiveTo       DateTime? @map("effective_to")
  source            ScheduleSource @default(local)
  mrsServiceId      String?   @map("mrs_service_id")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  provider          Provider         @relation(fields: [providerId], references: [id])
  service           AppointmentType? @relation(fields: [serviceId], references: [id])

  @@unique([providerId, serviceId, dayOfWeek, effectiveFrom])
  @@index([providerId, dayOfWeek])
  @@map("schedule_templates")
}

enum ScheduleSource {
  local
  mrs_synced
  @@map("schedule_source")
}
```

#### Scenario: Schedule template unique constraint
- **WHEN** creating schedule template for provider + day + effective date
- **THEN** constraint prevents duplicate templates for same provider/day/date

#### Scenario: Schedule template provider relation
- **WHEN** schedule template references providerId
- **THEN** foreign key enforces provider exists

## MODIFIED Requirements

### Requirement: Appointment model supports datetime-based booking
The Appointment model SHALL support direct datetime fields without requiring slotId.

Changes:
- `slotId` becomes optional (nullable)
- Add `startTime` field (required)
- Add `endTime` field (required)
- Add `providerId` field (optional, direct reference)
- Add `serviceId` field (optional, direct reference)

#### Scenario: Create appointment without slot
- **WHEN** appointment is created with startTime and endTime
- **THEN** appointment is valid even without slotId
- **AND** times are stored directly on appointment

#### Scenario: Appointment with slot reference (legacy)
- **WHEN** appointment has slotId populated
- **THEN** slot relation still works
- **AND** appointment times may be derived from slot or stored directly

### Requirement: Availability model becomes optional
The Availability model MAY be deprecated for appointment-based MRS systems.

For Bahmni integration:
- Availability table is not required
- Availability is computed from ScheduleTemplate and Appointments
- Existing data can remain for reference or migration

#### Scenario: Booking without Availability table
- **WHEN** booking appointment with Bahmni
- **THEN** no Availability record is created or modified
- **AND** booking uses direct datetime on Appointment
