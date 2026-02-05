// OpenMRS Capability Configuration
// Defines what operations the OpenMRS adapter supports

import type { MRSCapabilities } from '../../types.js';

/**
 * Default capabilities for OpenMRS with the Bahmni appointments module.
 *
 * Note: These are conservative defaults. Actual capabilities may vary based on:
 * - OpenMRS version
 * - Installed modules (Bahmni appointments module is OPTIONAL)
 * - Server configuration
 *
 * O3 (o3.openmrs.org) uses Bahmni appointments module, not the legacy
 * appointmentscheduling module.
 */
export const OPENMRS_CAPABILITIES: MRSCapabilities = {
  patientSearch: {
    byPhone: false,       // OpenMRS doesn't support phone search natively
    byName: true,         // GET /patient?q=name
    byDOB: false,         // No direct DOB search
    byIdentifier: true,   // GET /patient?identifier=...
    globalSearch: true,   // Can search all patients
  },

  appointments: {
    canCreate: true,      // POST /appointment (Bahmni)
    canCancel: true,      // Update status to Cancelled
    canReschedule: true,  // POST /appointment/{uuid}/reschedule
    canQueryByDateRange: true,
    canQueryByPatient: true,
    supportsStatuses: [
      'Scheduled',
      'CheckedIn',
      'Completed',
      'Cancelled',
      'Missed',
    ],
  },

  scheduling: {
    model: 'appointment_based',  // Bahmni uses direct datetime booking, not slots
    supportsScheduleConfig: true, // Can fetch service configuration
    defaultSlotDuration: 30,      // Default 30-minute appointments
    requiresServiceId: true,      // Bahmni requires serviceUuid
  },

  sync: {
    supportsIncrementalSync: false,  // No modified-since parameter
    supportsWebhooks: false,          // No webhook support
    hasModifiedSinceQuery: false,     // Must fetch all and compare
    supportsIdempotencyKeys: false,   // OpenMRS doesn't support idempotency keys
  },

  rateLimits: {
    requestsPerMinute: 60,   // Conservative estimate (not documented)
    requestsPerHour: 1000,   // Conservative estimate
    burstLimit: 10,          // Max concurrent requests
    perEndpointLimits: {},   // No per-endpoint limits known
  },
};

/**
 * Legacy OpenMRS status values mapped to internal status values.
 */
export const STATUS_MAP: Record<string, string> = {
  'SCHEDULED': 'scheduled',
  'RESCHEDULED': 'scheduled',
  'WALKIN': 'scheduled',
  'WAITING': 'arrived',
  'INCONSULTATION': 'in_service',
  'COMPLETED': 'completed',
  'CANCELLED': 'cancelled',
  'MISSED': 'no_show',
};

/**
 * Internal status values mapped to legacy OpenMRS status values.
 */
export const REVERSE_STATUS_MAP: Record<string, string> = {
  'scheduled': 'SCHEDULED',
  'confirmed': 'SCHEDULED',
  'arrived': 'WAITING',
  'in_service': 'INCONSULTATION',
  'completed': 'COMPLETED',
  'cancelled': 'CANCELLED',
  'no_show': 'MISSED',
};

/**
 * Bahmni appointment status values mapped to internal status values.
 * Bahmni uses PascalCase for status values.
 */
export const BAHMNI_STATUS_MAP: Record<string, string> = {
  'Scheduled': 'scheduled',
  'CheckedIn': 'arrived',
  'Completed': 'completed',
  'Cancelled': 'cancelled',
  'Missed': 'no_show',
};

/**
 * Internal status values mapped to Bahmni status values.
 */
export const BAHMNI_REVERSE_STATUS_MAP: Record<string, string> = {
  'scheduled': 'Scheduled',
  'confirmed': 'Scheduled',
  'arrived': 'CheckedIn',
  'in_service': 'CheckedIn',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
  'no_show': 'Missed',
};

/**
 * Capabilities for OpenMRS instances WITHOUT the Bahmni appointments module.
 *
 * These instances can only sync patients, providers, and locations.
 * Appointments and availability must be managed locally.
 */
export const OPENMRS_CAPABILITIES_NO_APPOINTMENTS: MRSCapabilities = {
  patientSearch: {
    byPhone: false,
    byName: true,
    byDOB: false,
    byIdentifier: true,
    globalSearch: true,
  },

  appointments: {
    canCreate: false,      // No appointment module
    canCancel: false,
    canReschedule: false,
    canQueryByDateRange: false,
    canQueryByPatient: false,
    supportsStatuses: [],
  },

  scheduling: {
    model: 'appointment_based',  // Would be appointment-based if module was available
    supportsScheduleConfig: false, // No schedule config without module
    defaultSlotDuration: 30,
    requiresServiceId: false,      // N/A without appointment module
  },

  sync: {
    supportsIncrementalSync: false,
    supportsWebhooks: false,
    hasModifiedSinceQuery: false,
    supportsIdempotencyKeys: false,
  },

  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstLimit: 10,
    perEndpointLimits: {},
  },
};
