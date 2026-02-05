## MODIFIED Requirements

### Requirement: MRS adapter interface defines availability operations

The adapter SHALL compute availability via conflict checking, not slot queries.

#### Scenario: Check conflicts replaces slot verification
- **WHEN** booking flow needs to verify time is available
- **THEN** it calls `checkConflicts()` with datetime range
- **AND** does NOT call `verifySlotAvailable()` (deprecated)

#### Scenario: Availability comes from Core, not MRS
- **WHEN** user asks for available times
- **THEN** Core computes availability from ScheduleTemplate and Appointments
- **AND** does NOT call adapter's `getAvailability()` method

## REMOVED Requirements

### Requirement: MRS adapter interface defines availability operations
**Reason**: Slot-based availability methods don't apply to all MRS systems. Replaced with datetime-based conflict checking.
**Migration**: Use `checkConflicts()` for validation. Use Core's AvailabilityService for computing available times.

The following methods are removed from abstract MRSAdapter:
- `getAvailability(range: DateRange): Promise<MRSSlot[]>` - Bahmni doesn't have slots
- `getProviderAvailability(providerMrsId, dateRange): Promise<MRSSlot[]>` - Bahmni doesn't have slots
- `verifySlotAvailable(slotId: string): Promise<SlotVerificationResult>` - Replaced by `checkConflicts()`

Slot-based MRS systems should implement `SlotBasedMRSAdapter` extension instead.
