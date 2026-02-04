// MRS Adapter Interface
// Abstract interface that all MRS implementations must implement

import type {
  MRSCapabilities,
  MRSSystemType,
  MRSPatient,
  MRSProvider,
  MRSLocation,
  MRSAppointmentType,
  MRSAppointment,
  MRSSlot,
  PatientQuery,
  AppointmentFilter,
  DateRange,
  NewAppointment,
  SlotVerificationResult,
  HealthCheckResult,
} from './types.js';

/**
 * Abstract interface for Medical Record System adapters.
 *
 * All MRS adapters must implement this interface to provide:
 * - Connection management (connect, disconnect, health check)
 * - Read operations for syncing (patients, providers, locations, availability, appointments)
 * - Write operations for booking (create/cancel appointments)
 * - Real-time validation (verify slot available before booking)
 *
 * Implementations should handle authentication, data transformation,
 * and MRS-specific error handling internally.
 */
export interface MRSAdapter {
  // ============================================
  // Identity & Capabilities
  // ============================================

  /**
   * The type of MRS system this adapter connects to.
   */
  readonly systemType: MRSSystemType;

  /**
   * The capabilities this MRS adapter supports.
   * Check these before attempting operations.
   */
  readonly capabilities: MRSCapabilities;

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Establish connection to the MRS.
   * Authenticates and validates credentials.
   * @throws MRSAuthenticationError if credentials are invalid
   * @throws MRSUnavailableError if MRS is unreachable
   */
  connect(): Promise<void>;

  /**
   * Close connection to the MRS.
   * Cleans up any open sessions or connections.
   */
  disconnect(): Promise<void>;

  /**
   * Check if the MRS is healthy and responding.
   * @returns Health status and latency
   */
  healthCheck(): Promise<HealthCheckResult>;

  // ============================================
  // Patient Operations
  // ============================================

  /**
   * Get a patient by their MRS ID.
   * @param mrsId - The patient's unique identifier in the MRS
   * @returns The patient or null if not found
   */
  getPatient(mrsId: string): Promise<MRSPatient | null>;

  /**
   * Search for patients by name or phone number.
   * @param query - Search criteria
   * @returns Array of matching patients (empty if none found)
   */
  searchPatients(query: PatientQuery): Promise<MRSPatient[]>;

  /**
   * Get patients from the MRS.
   * @param options - Optional since date for incremental sync, limit for pagination
   * @returns Array of patients
   */
  getPatients(options?: { since?: Date; limit?: number }): Promise<MRSPatient[]>;

  // ============================================
  // Provider Operations
  // ============================================

  /**
   * Get a provider by their MRS ID.
   * @param mrsId - The provider's unique identifier in the MRS
   * @returns The provider or null if not found
   */
  getProvider(mrsId: string): Promise<MRSProvider | null>;

  /**
   * Get all providers from the MRS.
   * @returns Array of all providers
   */
  getProviders(): Promise<MRSProvider[]>;

  // ============================================
  // Location Operations
  // ============================================

  /**
   * Get all locations from the MRS.
   * @returns Array of all locations
   */
  getLocations(): Promise<MRSLocation[]>;

  // ============================================
  // Appointment Type Operations
  // ============================================

  /**
   * Get all appointment types from the MRS.
   * @returns Array of all appointment types
   */
  getAppointmentTypes(): Promise<MRSAppointmentType[]>;

  // ============================================
  // Availability Operations
  // ============================================

  /**
   * Get available time slots within a date range.
   * @param range - The date range to search
   * @returns Array of time slots (both available and booked)
   */
  getAvailability(range: DateRange): Promise<MRSSlot[]>;

  /**
   * Get available slots for a specific provider within a date range.
   * @param providerMrsId - The provider's MRS ID
   * @param dateRange - The date range to search
   * @returns Array of slots (both available and booked)
   */
  getProviderAvailability(providerMrsId: string, dateRange: DateRange): Promise<MRSSlot[]>;

  // ============================================
  // Real-Time Slot Validation
  // ============================================

  /**
   * Verify a specific slot is still available in the MRS.
   * Call this immediately before booking to check for conflicts.
   * @param slotId - The MRS slot ID to verify
   * @returns Verification result with availability status
   * @throws SlotNotFoundError if slot doesn't exist
   */
  verifySlotAvailable(slotId: string): Promise<SlotVerificationResult>;

  // ============================================
  // Appointment Operations
  // ============================================

  /**
   * Get appointments matching the given filter.
   * @param filter - Filter criteria including date range and optional provider/patient
   * @returns Array of matching appointments
   */
  getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]>;

  /**
   * Create a new appointment in the MRS.
   * @param appointment - The appointment details
   * @returns The created appointment with MRS ID populated
   * @throws SlotConflictError if slot is no longer available
   * @throws MRSValidationError if data is invalid
   */
  createAppointment(appointment: NewAppointment): Promise<MRSAppointment>;

  /**
   * Cancel an appointment in the MRS.
   * @param mrsId - The appointment's MRS ID
   * @param reason - The cancellation reason
   * @throws NotFoundError if appointment doesn't exist
   * @throws MRSError if appointment is already cancelled or cannot be cancelled
   */
  cancelAppointment(mrsId: string, reason?: string): Promise<void>;

  /**
   * Update an appointment's status in the MRS.
   * @param mrsId - The appointment's MRS ID
   * @param status - The new status
   * @throws NotFoundError if appointment doesn't exist
   * @throws MRSValidationError if status transition is invalid
   */
  updateAppointmentStatus(mrsId: string, status: string): Promise<void>;
}
