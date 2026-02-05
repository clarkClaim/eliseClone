// Canonical types for MRS data
// These types are used across all MRS adapters to provide a consistent interface

// ============================================
// MRS CAPABILITIES
// ============================================

export interface MRSCapabilities {
  patientSearch: {
    byPhone: boolean;
    byName: boolean;
    byDOB: boolean;
    byIdentifier: boolean;
    globalSearch: boolean;
  };

  appointments: {
    canCreate: boolean;
    canCancel: boolean;
    canReschedule: boolean;
    canQueryByDateRange: boolean;
    canQueryByPatient: boolean;
    supportsStatuses: string[];
  };

  /** Scheduling model capabilities */
  scheduling: {
    /** Whether this MRS uses slots or direct datetime booking */
    model: 'appointment_based' | 'slot_based';
    /** Whether MRS can provide service/schedule configuration */
    supportsScheduleConfig: boolean;
    /** Default appointment duration in minutes */
    defaultSlotDuration: number;
    /** Whether serviceId is required for booking */
    requiresServiceId: boolean;
  };

  sync: {
    supportsIncrementalSync: boolean;
    supportsWebhooks: boolean;
    hasModifiedSinceQuery: boolean;
  };

  rateLimits: {
    requestsPerMinute: number | null;
    requestsPerHour: number | null;
    burstLimit: number | null;
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
// SLOT VERIFICATION
// ============================================

/**
 * @deprecated Use ConflictCheckResult instead.
 * Slot verification is being replaced by datetime-based conflict checking.
 */
export interface SlotVerificationResult {
  available: boolean;
  slot?: MRSSlot;
}

// ============================================
// HEALTH CHECK
// ============================================

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
}
