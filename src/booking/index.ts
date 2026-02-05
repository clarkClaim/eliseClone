// Booking Flow Exports
// Re-exports from the datetime-based booking service

export {
  bookAppointmentByDatetime,
  cancelAppointment,
  checkLocalConflicts,
  type DatetimeBookingRequest,
  type BookingResult,
  type CancellationRequest,
  type CancellationResult,
  type ConflictInfo,
} from '../scheduling/booking-service.js';
