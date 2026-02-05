// OpenMRS Adapter
// Exports the main adapter class and related utilities

export { OpenMRSAdapter, type OpenMRSAdapterConfig } from './adapter.js';
export { OpenMRSClient, type OpenMRSClientConfig, type RateLimitState } from './client.js';
export {
  OPENMRS_CAPABILITIES,
  STATUS_MAP,
  REVERSE_STATUS_MAP,
  BAHMNI_STATUS_MAP,
  BAHMNI_REVERSE_STATUS_MAP,
} from './capabilities.js';
export * from './mappers.js';
