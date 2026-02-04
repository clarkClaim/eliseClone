// OpenMRS Capability Configuration
// Defines what operations the OpenMRS adapter supports

import type { MRSCapabilities } from '../../types.js';

/**
 * Default capabilities for OpenMRS with the appointment scheduling module.
 *
 * Note: These are conservative defaults. Actual capabilities may vary based on:
 * - OpenMRS version
 * - Installed modules (appointment scheduling module is OPTIONAL)
 * - Server configuration
 *
 * IMPORTANT: The o3.openmrs.org demo instance does NOT have the appointment
 * scheduling module installed. Use OPENMRS_CAPABILITIES_NO_APPOINTMENTS for
 * instances without the module.
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
    canCreate: true,      // POST /appointmentscheduling/appointment
    canCancel: true,      // Set status to CANCELLED
    canReschedule: false, // Must cancel + create new
    canQueryByDateRange: true,
    canQueryByPatient: true,
    supportsStatuses: [
      'SCHEDULED',
      'RESCHEDULED',
      'WALKIN',
      'WAITING',
      'INCONSULTATION',
      'COMPLETED',
      'CANCELLED',
      'MISSED',
    ],
  },

  sync: {
    supportsIncrementalSync: false,  // No modified-since parameter
    supportsWebhooks: false,          // No webhook support
    hasModifiedSinceQuery: false,     // Must fetch all and compare
  },

  rateLimits: {
    requestsPerMinute: 60,   // Conservative estimate (not documented)
    requestsPerHour: 1000,   // Conservative estimate
    burstLimit: 10,          // Max concurrent requests
    perEndpointLimits: {},   // No per-endpoint limits known
  },
};

/**
 * OpenMRS status values mapped to internal status values.
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
 * Internal status values mapped to OpenMRS status values.
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
 * Capabilities for OpenMRS instances WITHOUT the appointment scheduling module.
 * This includes the o3.openmrs.org demo instance.
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

  sync: {
    supportsIncrementalSync: false,
    supportsWebhooks: false,
    hasModifiedSinceQuery: false,
  },

  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstLimit: 10,
    perEndpointLimits: {},
  },
};
