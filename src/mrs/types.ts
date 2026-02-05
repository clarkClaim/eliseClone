// Canonical types for MRS data
// These types are used across all MRS adapters to provide a consistent interface

// ============================================
// MRS CAPABILITIES
// ============================================

/**
 * Describes what operations an MRS adapter supports.
 *
 * Each MRS (Medical Record System) has different capabilities. Check these
 * before attempting operations to handle graceful fallbacks.
 *
 * @example
 * ```typescript
 * if (adapter.capabilities.appointments.canReschedule) {
 *   await adapter.rescheduleAppointment(apptId, newTime);
 * } else {
 *   await adapter.cancelAppointment(apptId);
 *   await adapter.createAppointment(newAppointment);
 * }
 * ```
 */
export interface MRSCapabilities {
  /**
   * Patient search capabilities.
   * Determines which search methods are available.
   */
  patientSearch: {
    /** Can search patients by phone number */
    byPhone: boolean;
    /** Can search patients by name */
    byName: boolean;
    /** Can search patients by date of birth */
    byDOB: boolean;
    /** Can search patients by MRN or other identifier */
    byIdentifier: boolean;
    /** Can search across all patients (not just recent) */
    globalSearch: boolean;
  };

  /**
   * Appointment operation capabilities.
   * Determines which CRUD operations are available.
   */
  appointments: {
    /** Can create new appointments via API */
    canCreate: boolean;
    /** Can cancel existing appointments via API */
    canCancel: boolean;
    /** Can reschedule (without cancel+create) */
    canReschedule: boolean;
    /** Can query appointments by date range */
    canQueryByDateRange: boolean;
    /** Can query appointments by patient ID */
    canQueryByPatient: boolean;
    /** List of status values supported by this MRS */
    supportsStatuses: string[];
  };

  /**
   * Scheduling model capabilities.
   * Describes how the MRS handles scheduling.
   */
  scheduling: {
    /**
     * The scheduling model used by this MRS:
     * - 'appointment_based': Direct datetime booking (e.g., Bahmni)
     * - 'slot_based': Pre-defined slots that get booked (legacy)
     */
    model: 'appointment_based' | 'slot_based';
    /** Whether MRS can provide service/schedule configuration */
    supportsScheduleConfig: boolean;
    /** Default appointment duration in minutes */
    defaultSlotDuration: number;
    /** Whether serviceId is required for booking */
    requiresServiceId: boolean;
  };

  /**
   * Sync capabilities.
   * Describes how data synchronization works.
   */
  sync: {
    /** Supports fetching only changed records since last sync */
    supportsIncrementalSync: boolean;
    /** Supports push notifications via webhooks */
    supportsWebhooks: boolean;
    /** Has modified-since query parameter */
    hasModifiedSinceQuery: boolean;
    /**
     * Whether MRS supports idempotency keys for duplicate detection.
     * If false, the adapter should implement duplicate detection locally
     * by checking for existing appointments before creating.
     */
    supportsIdempotencyKeys: boolean;
  };

  /**
   * Rate limiting configuration.
   * null values mean no known limit.
   */
  rateLimits: {
    /** Maximum requests per minute */
    requestsPerMinute: number | null;
    /** Maximum requests per hour */
    requestsPerHour: number | null;
    /** Maximum concurrent/burst requests */
    burstLimit: number | null;
    /** Per-endpoint rate limits (endpoint path -> requests/minute) */
    perEndpointLimits: Record<string, number>;
  };
}

export type MRSSystemType = 'openmrs' | 'epic' | 'cerner' | 'athena' | 'openemr';

// ============================================
// MRS ENTITY TYPES
// ============================================

export interface MRSPatient {
  mrsId: string;
  name: string;
  givenName?: string;
  familyName?: string;
  dateOfBirth?: Date;
  gender?: string;
  phoneNumbers: MRSPhoneNumber[];
}

export interface MRSPhoneNumber {
  phone: string;
  phoneType?: 'mobile' | 'home' | 'work' | string;
  isPrimary: boolean;
}

/**
 * Input type for creating a new patient in the MRS.
 * Used by adapter.createPatient().
 */
export interface NewPatient {
  givenName: string;
  familyName: string;
  dateOfBirth: Date;
  gender?: string;
  phone?: string;
  phoneType?: 'mobile' | 'home';
}

export interface MRSProvider {
  mrsId: string;
  name: string;
  specialty?: string;
}

export interface MRSLocation {
  mrsId: string;
  name: string;
  address?: string;
}

export interface MRSAppointmentType {
  mrsId: string;
  name: string;
  durationMinutes?: number;
  description?: string;
}

export type MRSAppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface MRSAppointment {
  mrsId: string;
  patientMrsId: string;
  providerMrsId: string;
  locationMrsId?: string;
  appointmentTypeMrsId?: string;
  /** Service/appointment type name for fallback matching when mrsId not found */
  serviceName?: string;
  startTime: Date;
  endTime: Date;
  status: MRSAppointmentStatus;
  reason?: string;
  cancelReason?: string;
}

/**
 * @deprecated Slot-based availability is being replaced by datetime-based scheduling.
 * Use ScheduleTemplate + computed availability instead.
 * This type is retained for slot-based MRS adapters only.
 */
export interface MRSSlot {
  mrsId: string;
  providerMrsId: string;
  locationMrsId?: string;
  appointmentTypeMrsId?: string;
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
}

// ============================================
// SCHEDULE CONFIGURATION
// ============================================

/** Service/schedule configuration from MRS */
export interface MRSScheduleConfig {
  serviceId: string;
  serviceName: string;
  durationMins: number;
  /** Weekly availability by day of week (0=Sunday through 6=Saturday) */
  weeklyAvailability: Array<{
    dayOfWeek: number;
    startTime: string; // HH:MM format
    endTime: string;   // HH:MM format
  }>;
  locationId?: string;
  maxAppointmentsPerSlot?: number;
}

// ============================================
// CONFLICT DETECTION
// ============================================

/** Request to check for scheduling conflicts */
export interface ConflictCheckRequest {
  startDateTime: Date;
  endDateTime: Date;
  providerId?: string;
  serviceId?: string;
  /** Exclude this appointment from conflict check (for reschedule) */
  excludeAppointmentId?: string;
}

/** Result of conflict check */
export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingAppointments?: MRSAppointment[];
  reason?: string;
}

// Query types for adapter methods

export interface PatientQuery {
  name?: string;
  phone?: string;
  limit?: number;
}

export interface AppointmentFilter {
  providerMrsId?: string;
  patientMrsId?: string;
  startDate: Date;
  endDate: Date;
  status?: MRSAppointmentStatus[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Request to create an appointment using datetime-based booking.
 * This is the primary interface for creating appointments across all MRS types.
 */
export interface CreateAppointmentRequest {
  patientMrsId: string;
  /** Appointment start time */
  startDateTime: Date;
  /** Appointment end time */
  endDateTime: Date;
  /** Service/appointment type ID (required for Bahmni) */
  serviceId?: string;
  /** Provider ID */
  providerId?: string;
  /** Location ID */
  locationId?: string;
  /** Reason/comments for the appointment */
  reason?: string;
  /**
   * Idempotency key for duplicate detection on retries.
   * If the MRS supports idempotency keys, it will reject duplicate requests
   * with the same key. If not supported, the adapter should implement
   * duplicate detection by checking for existing appointments.
   */
  idempotencyKey?: string;
}

/**
 * @deprecated Use CreateAppointmentRequest instead.
 * This type is retained for backwards compatibility.
 */
export interface NewAppointment {
  patientMrsId: string;
  providerMrsId?: string;
  /** Bahmni: service UUID (appointment type) */
  serviceUuid: string;
  /** Bahmni: appointment start time */
  startDateTime: Date;
  /** Bahmni: appointment end time */
  endDateTime: Date;
  /** Optional location UUID */
  locationMrsId?: string;
  /** Optional reason/comments for the appointment */
  reason?: string;
  /** @deprecated Use serviceUuid instead */
  appointmentTypeMrsId?: string;
  /** @deprecated Bahmni doesn't use slots - use startDateTime/endDateTime */
  slotMrsId?: string;
}

// ============================================
// NOTE: SlotVerificationResult has been removed.
// Use ConflictCheckResult with checkConflicts() instead for datetime-based conflict detection.

// ============================================
// HEALTH CHECK
// ============================================

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
}
