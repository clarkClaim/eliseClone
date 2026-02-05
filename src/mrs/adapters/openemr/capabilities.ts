// OpenEMR Capabilities Configuration

import type { MRSCapabilities } from '../../types.js';

/**
 * OpenEMR capabilities reflecting the API's actual support.
 */
export const OPENEMR_CAPABILITIES: MRSCapabilities = {
  patientSearch: {
    byPhone: true,
    byName: true,
    byDOB: true,
    byIdentifier: true,
    globalSearch: true,
  },

  appointments: {
    canCreate: true,
    canCancel: true,
    canReschedule: false, // Must delete and recreate
    canQueryByDateRange: true,
    canQueryByPatient: true,
    supportsStatuses: ['-', '@', '?', 'x', '%', '<', '>', '#', '$', '*', '^'],
  },

  scheduling: {
    model: 'appointment_based',
    supportsScheduleConfig: false, // OpenEMR doesn't have Bahmni-style service configs
    defaultSlotDuration: 15,
    requiresServiceId: true, // pc_catid is required
  },

  sync: {
    supportsIncrementalSync: false,
    supportsWebhooks: false,
    hasModifiedSinceQuery: false,
  },

  rateLimits: {
    requestsPerMinute: null,
    requestsPerHour: null,
    burstLimit: null,
    perEndpointLimits: {},
  },
};
