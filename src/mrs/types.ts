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

export interface MRSSlot {
  mrsId: string;
  providerMrsId: string;
  locationMrsId?: string;
  appointmentTypeMrsId?: string;
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
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

export interface NewAppointment {
  patientMrsId: string;
  providerMrsId: string;
  slotMrsId: string;
  appointmentTypeMrsId?: string;
  reason?: string;
}

// Alias for design compatibility
export type CreateAppointmentRequest = NewAppointment;

// ============================================
// SLOT VERIFICATION
// ============================================

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
