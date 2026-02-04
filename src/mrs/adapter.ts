// MRS Adapter Interface
// Abstract interface that all MRS implementations must implement

import type {
  MRSPatient,
  MRSProvider,
  MRSAppointment,
  MRSSlot,
  PatientQuery,
  AppointmentFilter,
  DateRange,
  NewAppointment,
} from './types.js';

/**
 * Abstract interface for Medical Record System adapters.
 * Implementations should handle authentication, data transformation,
 * and MRS-specific error handling internally.
 */
export interface MRSAdapter {
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
   * Get all patients from the MRS.
   * @param limit - Maximum number of patients to return (default: 100)
   * @returns Array of patients
   */
  getPatients(limit?: number): Promise<MRSPatient[]>;

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
   */
  createAppointment(appointment: NewAppointment): Promise<MRSAppointment>;

  /**
   * Cancel an appointment in the MRS.
   * @param mrsId - The appointment's MRS ID
   * @param reason - The cancellation reason
   * @throws NotFoundError if appointment doesn't exist
   * @throws MRSError if appointment is already cancelled or cannot be cancelled
   */
  cancelAppointment(mrsId: string, reason: string): Promise<void>;

  // ============================================
  // Availability Operations
  // ============================================

  /**
   * Get available slots for a provider within a date range.
   * @param providerMrsId - The provider's MRS ID
   * @param dateRange - The date range to search
   * @returns Array of slots (both available and booked)
   */
  getAvailability(providerMrsId: string, dateRange: DateRange): Promise<MRSSlot[]>;
}
