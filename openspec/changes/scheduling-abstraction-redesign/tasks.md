## 1. Schema Changes

- [x] 1.1 Create `ScheduleSource` enum in Prisma schema
- [x] 1.2 Create `ScheduleTemplate` model with provider, day, times, duration
- [x] 1.3 Add unique constraint on (providerId, serviceId, dayOfWeek, effectiveFrom)
- [x] 1.4 Add `startTime` and `endTime` fields to Appointment model
- [x] 1.5 Add `providerId` and `serviceId` direct references to Appointment
- [x] 1.6 Make `slotId` optional (nullable) on Appointment
- [x] 1.7 Run migration: `pnpm exec prisma migrate dev --name scheduling-redesign`
- [x] 1.8 Verify migration applies cleanly

## 2. MRS Types Updates

- [x] 2.1 Add `scheduling` section to `MRSCapabilities` interface
- [x] 2.2 Define `MRSScheduleConfig` type for service hours
- [x] 2.3 Define `ConflictCheckRequest` and `ConflictCheckResult` types
- [x] 2.4 Update `CreateAppointmentRequest` to remove slot dependency
- [x] 2.5 Deprecate `MRSSlot` type (mark with JSDoc @deprecated)
- [x] 2.6 Deprecate `SlotVerificationResult` type

## 3. Abstract MRS Adapter Interface

- [x] 3.1 Add `checkConflicts()` method to `MRSAdapter` interface
- [x] 3.2 Add optional `getScheduleConfig()` method
- [x] 3.3 Mark `getAvailability()` as deprecated with migration note
- [x] 3.4 Mark `getProviderAvailability()` as deprecated
- [x] 3.5 Mark `verifySlotAvailable()` as deprecated
- [x] 3.6 Create `SlotBasedMRSAdapter` extended interface
- [x] 3.7 Create `isSlotBasedAdapter()` type guard function

## 4. OpenMRS Adapter Updates

- [x] 4.1 Update `capabilities.scheduling` to declare 'appointment_based' model
- [x] 4.2 Implement `checkConflicts()` via appointment search
- [x] 4.3 Implement `getScheduleConfig()` from Bahmni services
- [x] 4.4 Update `createAppointment()` to use datetime-based request
- [x] 4.5 Remove slot verification logic (returns always-true anyway)
- [x] 4.6 Add deprecation warnings to slot methods
- [ ] 4.7 Test adapter against O3 demo

## 5. AvailabilityService Implementation

- [x] 5.1 Create `src/scheduling/availability-service.ts`
- [x] 5.2 Implement `getScheduleTemplates(providerId, date)` query
- [x] 5.3 Implement `generateTimeWindows(template, date)` logic
- [x] 5.4 Implement `getAppointmentsForDate(date, providerId)` query
- [x] 5.5 Implement `computeAvailability(date, options)` combining above
- [x] 5.6 Implement `isTimeAvailable(start, end, providerId)` check
- [ ] 5.7 Add unit tests for availability computation

## 6. Booking Service Updates

- [x] 6.1 Create `src/scheduling/booking-service.ts` (or refactor mrs-booking.ts)
- [x] 6.2 Implement datetime-based booking flow
- [x] 6.3 Use `checkConflicts()` instead of `verifySlotAvailable()`
- [x] 6.4 Store appointment with direct time fields
- [x] 6.5 Handle MRS unavailable case (local booking + push queue)
- [x] 6.6 Remove slot ID dependency from booking flow
- [ ] 6.7 Add unit tests for booking service

## 7. Schedule Template Sync

- [x] 7.1 Create `src/sync/entities/schedule-templates.ts`
- [x] 7.2 Implement sync from MRS `getScheduleConfig()` to local templates
- [x] 7.3 Map Bahmni service weeklyAvailability to ScheduleTemplate records
- [x] 7.4 Handle services without weeklyAvailability (use defaults)
- [x] 7.5 Add to sync service startup

## 8. Seed Data Updates

- [x] 8.1 Add ScheduleTemplate seed data for test providers
- [x] 8.2 Seed Dr. Smith: M/W/F 9am-5pm
- [x] 8.3 Seed Dr. Jones: T/Th 8am-3pm
- [x] 8.4 Seed sample service configurations
- [x] 8.5 Update seed script to use upsert for templates
- [x] 8.6 Test seed with `pnpm exec prisma db seed`

## 9. Integration Testing

- [ ] 9.1 Test availability computation with schedule templates
- [ ] 9.2 Test booking flow against O3 demo
- [ ] 9.3 Test conflict detection
- [ ] 9.4 Test local fallback when MRS unavailable
- [ ] 9.5 Test schedule template sync from Bahmni services
- [ ] 9.6 Verify no regressions in existing functionality

## 10. Documentation & Cleanup

- [ ] 10.1 Update `docs/TECHNICAL_EXPLORATION.md` with new architecture
- [ ] 10.2 Document AvailabilityService usage
- [ ] 10.3 Document migration path for existing code
- [ ] 10.4 Remove or deprecate unused slot-related code
- [ ] 10.5 Update MRS adapter documentation
