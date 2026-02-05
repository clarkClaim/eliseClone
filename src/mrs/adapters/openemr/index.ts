// OpenEMR Adapter Module
// Public exports for OpenEMR integration

export { OpenEMRAdapter, type OpenEMRAdapterConfig } from './adapter.js';
export { OpenEMRClient, type OpenEMRClientConfig, type TokenState } from './client.js';
export { OPENEMR_CAPABILITIES } from './capabilities.js';
export {
  // Patient mappers
  mapOpenEMRPatient,
  mapOpenEMRPatientList,
  mapNewPatientToOpenEMR,
  mapFhirPatient,
  mapFhirPatientBundle,
  // Appointment mappers
  mapOpenEMRAppointment,
  mapOpenEMRAppointmentList,
  mapCreateAppointmentToOpenEMR,
  mapOpenEMRAppointmentStatus,
  // Provider/Location mappers
  mapOpenEMRProvider,
  mapOpenEMRProviderBundle,
  mapOpenEMRLocation,
  mapOpenEMRLocationList,
  // Appointment type mappers
  mapOpenEMRAppointmentType,
  mapOpenEMRAppointmentTypeList,
  // Status mappings
  OPENEMR_STATUS_MAP,
  OPENEMR_REVERSE_STATUS_MAP,
  // Types
  type OpenEMRPatientResponse,
  type OpenEMRPatientListResponse,
  type OpenEMRAppointmentResponse,
  type OpenEMRAppointmentListResponse,
  type OpenEMRFacilityResponse,
  type OpenEMRFacilityListResponse,
  type OpenEMRAppointmentCategoryResponse,
  type OpenEMRPractitionerResponse,
  type FHIRPractitionerBundle,
} from './mappers.js';
