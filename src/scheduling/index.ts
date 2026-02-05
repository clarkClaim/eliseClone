// Scheduling Module
// Datetime-based scheduling with computed availability

export {
  // Types
  type TimeWindow,
  type AvailabilityOptions,
  type ScheduleTemplateData,
  type TimeOfDay,
  type AvailabilitySearchCriteria,
  type AvailabilitySearchResult,
  // Template queries
  getScheduleTemplates,
  getScheduleTemplatesForDay,
  getScheduleTemplatesForRange,
  // Time window generation
  generateTimeWindows,
  // Appointment queries
  getAppointmentsForDate,
  getAppointmentsForRange,
  // Availability computation
  computeAvailability,
  isTimeAvailable,
  isWithinSchedule,
  // Availability search (multi-day)
  searchAvailability,
} from './availability-service.js';

export {
  // Types
  type DatetimeBookingRequest,
  type BookingResult,
  type ConflictInfo,
  type CancellationRequest,
  type CancellationResult,
  // Conflict detection
  checkLocalConflicts,
  // Booking
  bookAppointmentByDatetime,
  // Cancellation
  cancelAppointment,
} from './booking-service.js';
