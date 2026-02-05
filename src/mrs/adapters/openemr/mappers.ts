// OpenEMR Data Mappers
// Transform OpenEMR API responses to canonical MRS types

import type {
  MRSPatient,
  MRSPhoneNumber,
  MRSProvider,
  MRSLocation,
  MRSAppointmentType,
  MRSAppointment,
  MRSAppointmentStatus,
  NewPatient,
  CreateAppointmentRequest,
} from '../../types.js';

// ============================================
// OpenEMR API Response Types
// ============================================

export interface OpenEMRPatientResponse {
  uuid: string;
  pubpid?: string;
  fname?: string;
  mname?: string;
  lname?: string;
  DOB?: string;
  sex?: string;
  phone_cell?: string;
  phone_home?: string;
  phone_biz?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

export interface OpenEMRPatientListResponse {
  data?: OpenEMRPatientResponse[];
}

export interface OpenEMRAppointmentResponse {
  id?: string;
  uuid?: string;
  pc_eid?: string;
  pc_catid?: string;
  pc_catname?: string;
  pc_title?: string;
  pc_pid?: string;
  pc_aid?: string;
  pc_facility?: string;
  pc_eventDate?: string;
  pc_startTime?: string;
  pc_duration?: string | number;
  pc_apptstatus?: string;
  pc_hometext?: string;
  patient_uuid?: string;
  provider_uuid?: string;
}

export interface OpenEMRAppointmentListResponse {
  data?: OpenEMRAppointmentResponse[];
}

export interface OpenEMRFacilityResponse {
  id?: string;
  uuid?: string;
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
}

export interface OpenEMRFacilityListResponse {
  data?: OpenEMRFacilityResponse[];
}

export interface OpenEMRAppointmentCategoryResponse {
  option_id?: string;
  title?: string;
  pc_catid?: string;
  pc_catname?: string;
  pc_cattype?: string;
  pc_duration?: number;
  pc_catdesc?: string;
}

export interface OpenEMRPractitionerResponse {
  id?: string;
  uuid?: string;
  name?: Array<{
    text?: string;
    family?: string;
    given?: string[];
  }>;
  identifier?: Array<{
    value?: string;
  }>;
}

export interface FHIRPractitionerBundle {
  entry?: Array<{
    resource: OpenEMRPractitionerResponse;
  }>;
}

// ============================================
// Status Mapping
// ============================================

/**
 * OpenEMR appointment status codes to MRSAppointmentStatus.
 * OpenEMR uses single-character codes for appointment status.
 */
export const OPENEMR_STATUS_MAP: Record<string, MRSAppointmentStatus> = {
  '-': 'scheduled',      // Pending
  '@': 'arrived',        // Arrived
  '?': 'no_show',        // Did Not Show
  'x': 'cancelled',      // Cancelled
  '%': 'scheduled',      // Pending (another form)
  '<': 'completed',      // Checked Out
  '>': 'in_service',     // In Exam Room
  '#': 'scheduled',      // Ins/Auth Issues
  '$': 'confirmed',      // Paid
  '*': 'completed',      // Completed
  '^': 'scheduled',      // Pending w/Ins Issues
};

/**
 * Reverse mapping: MRSAppointmentStatus to OpenEMR codes.
 */
export const OPENEMR_REVERSE_STATUS_MAP: Record<string, string> = {
  'scheduled': '-',
  'confirmed': '$',
  'arrived': '@',
  'in_service': '>',
  'completed': '<',
  'cancelled': 'x',
  'no_show': '?',
};

// ============================================
// Patient Mappers
// ============================================

/**
 * Map OpenEMR patient response to MRSPatient.
 */
export function mapOpenEMRPatient(response: OpenEMRPatientResponse): MRSPatient {
  const phoneNumbers: MRSPhoneNumber[] = [];

  if (response.phone_cell) {
    phoneNumbers.push({
      phone: response.phone_cell,
      phoneType: 'mobile',
      isPrimary: true,
    });
  }
  if (response.phone_home) {
    phoneNumbers.push({
      phone: response.phone_home,
      phoneType: 'home',
      isPrimary: phoneNumbers.length === 0,
    });
  }
  if (response.phone_biz) {
    phoneNumbers.push({
      phone: response.phone_biz,
      phoneType: 'work',
      isPrimary: phoneNumbers.length === 0,
    });
  }

  const nameParts = [response.fname, response.mname, response.lname].filter(Boolean);

  return {
    mrsId: response.uuid,
    name: nameParts.join(' '),
    givenName: response.fname,
    familyName: response.lname,
    dateOfBirth: response.DOB ? new Date(response.DOB) : undefined,
    gender: response.sex,
    phoneNumbers,
  };
}

/**
 * Map OpenEMR patient list response to MRSPatient array.
 */
export function mapOpenEMRPatientList(response: OpenEMRPatientListResponse): MRSPatient[] {
  if (!response.data) return [];
  return response.data.map(mapOpenEMRPatient);
}

/**
 * Map NewPatient to OpenEMR patient creation payload.
 */
export function mapNewPatientToOpenEMR(patient: NewPatient): Record<string, unknown> {
  // Format birthdate as YYYY-MM-DD
  const dob = patient.dateOfBirth.toISOString().split('T')[0];

  // Map gender
  let sex: string | undefined;
  if (patient.gender) {
    const g = patient.gender.toLowerCase();
    if (g === 'male' || g === 'm') sex = 'Male';
    else if (g === 'female' || g === 'f') sex = 'Female';
    else sex = patient.gender;
  }

  const payload: Record<string, unknown> = {
    fname: patient.givenName,
    lname: patient.familyName,
    DOB: dob,
  };

  if (sex) {
    payload.sex = sex;
  }

  if (patient.phone) {
    if (patient.phoneType === 'home') {
      payload.phone_home = patient.phone;
    } else {
      payload.phone_cell = patient.phone;
    }
  }

  return payload;
}

// ============================================
// FHIR Patient Mappers
// ============================================

interface FHIRPatientResource {
  id: string;
  name?: Array<{
    text?: string;
    family?: string;
    given?: string[];
  }>;
  gender?: string;
  birthDate?: string;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
}

interface FHIRBundle {
  entry?: Array<{
    resource: FHIRPatientResource;
  }>;
}

/**
 * Map FHIR Patient resource to MRSPatient.
 */
export function mapFhirPatient(resource: FHIRPatientResource): MRSPatient {
  const name = resource.name?.[0];
  const phoneNumbers: MRSPhoneNumber[] = (resource.telecom ?? [])
    .filter(t => t.system === 'phone' && t.value)
    .map((t, index) => ({
      phone: t.value!,
      phoneType: t.use === 'mobile' ? 'mobile' : 'home',
      isPrimary: index === 0,
    }));

  return {
    mrsId: resource.id,
    name: name?.text ?? `${name?.given?.join(' ') ?? ''} ${name?.family ?? ''}`.trim(),
    givenName: name?.given?.[0],
    familyName: name?.family,
    dateOfBirth: resource.birthDate ? new Date(resource.birthDate) : undefined,
    gender: resource.gender,
    phoneNumbers,
  };
}

/**
 * Map FHIR Patient bundle to MRSPatient array.
 */
export function mapFhirPatientBundle(bundle: FHIRBundle): MRSPatient[] {
  if (!bundle.entry) return [];
  return bundle.entry.map(entry => mapFhirPatient(entry.resource));
}

// ============================================
// Appointment Mappers
// ============================================

/**
 * Map OpenEMR appointment status code to MRSAppointmentStatus.
 */
export function mapOpenEMRAppointmentStatus(statusCode: string): MRSAppointmentStatus {
  return OPENEMR_STATUS_MAP[statusCode] ?? 'scheduled';
}

/**
 * Map OpenEMR appointment response to MRSAppointment.
 */
export function mapOpenEMRAppointment(response: OpenEMRAppointmentResponse): MRSAppointment {
  // Parse date and time
  const eventDate = response.pc_eventDate ?? '';
  const startTime = response.pc_startTime ?? '00:00';
  const duration = typeof response.pc_duration === 'string'
    ? parseInt(response.pc_duration, 10)
    : (response.pc_duration ?? 900); // Default 15 minutes in seconds

  // Create start datetime
  const startDateTime = new Date(`${eventDate}T${startTime}`);

  // Calculate end datetime (duration is in seconds)
  const endDateTime = new Date(startDateTime.getTime() + duration * 1000);

  return {
    mrsId: response.pc_eid ?? response.uuid ?? response.id ?? '',
    patientMrsId: response.patient_uuid ?? response.pc_pid ?? '',
    providerMrsId: response.provider_uuid ?? response.pc_aid ?? '',
    locationMrsId: response.pc_facility,
    appointmentTypeMrsId: response.pc_catid,
    startTime: startDateTime,
    endTime: endDateTime,
    status: mapOpenEMRAppointmentStatus(response.pc_apptstatus ?? '-'),
    reason: response.pc_hometext,
  };
}

/**
 * Map OpenEMR appointment list response to MRSAppointment array.
 */
export function mapOpenEMRAppointmentList(response: OpenEMRAppointmentListResponse): MRSAppointment[] {
  if (!response.data) return [];
  return response.data.map(mapOpenEMRAppointment);
}

/**
 * Map CreateAppointmentRequest to OpenEMR appointment creation payload.
 */
export function mapCreateAppointmentToOpenEMR(request: CreateAppointmentRequest): Record<string, unknown> {
  // Format date as YYYY-MM-DD
  const eventDate = request.startDateTime.toISOString().split('T')[0];

  // Format time as HH:MM
  const hours = request.startDateTime.getHours().toString().padStart(2, '0');
  const minutes = request.startDateTime.getMinutes().toString().padStart(2, '0');
  const startTime = `${hours}:${minutes}`;

  // Calculate duration in seconds
  const durationMs = request.endDateTime.getTime() - request.startDateTime.getTime();
  const durationSeconds = Math.round(durationMs / 1000);

  const payload: Record<string, unknown> = {
    pc_catid: request.serviceId,
    pc_eventDate: eventDate,
    pc_startTime: startTime,
    pc_duration: durationSeconds.toString(),
    pc_apptstatus: '-', // Scheduled
    pc_title: 'Appointment',
    pc_hometext: request.reason ?? '',
  };

  if (request.providerId) {
    payload.pc_aid = request.providerId;
  }

  if (request.locationId) {
    payload.pc_facility = request.locationId;
  }

  return payload;
}

// ============================================
// Provider Mappers
// ============================================

/**
 * Map FHIR Practitioner resource to MRSProvider.
 */
export function mapOpenEMRProvider(resource: OpenEMRPractitionerResponse): MRSProvider {
  const name = resource.name?.[0];
  const displayName = name?.text ?? `${name?.given?.join(' ') ?? ''} ${name?.family ?? ''}`.trim();

  return {
    mrsId: resource.uuid ?? resource.id ?? '',
    name: displayName || 'Unknown Provider',
  };
}

/**
 * Map FHIR Practitioner bundle to MRSProvider array.
 */
export function mapOpenEMRProviderBundle(bundle: FHIRPractitionerBundle): MRSProvider[] {
  if (!bundle.entry) return [];
  return bundle.entry.map(entry => mapOpenEMRProvider(entry.resource));
}

// ============================================
// Location (Facility) Mappers
// ============================================

/**
 * Map OpenEMR facility response to MRSLocation.
 */
export function mapOpenEMRLocation(response: OpenEMRFacilityResponse): MRSLocation {
  const addressParts = [
    response.street,
    response.city,
    response.state,
    response.postal_code,
  ].filter(Boolean);

  return {
    mrsId: response.uuid ?? response.id ?? '',
    name: response.name ?? 'Unknown Location',
    address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
  };
}

/**
 * Map OpenEMR facility list response to MRSLocation array.
 */
export function mapOpenEMRLocationList(response: OpenEMRFacilityListResponse): MRSLocation[] {
  if (!response.data) return [];
  return response.data.map(mapOpenEMRLocation);
}

// ============================================
// Appointment Type (Category) Mappers
// ============================================

/**
 * Map OpenEMR appointment category to MRSAppointmentType.
 */
export function mapOpenEMRAppointmentType(response: OpenEMRAppointmentCategoryResponse): MRSAppointmentType {
  return {
    mrsId: response.option_id ?? response.pc_catid ?? '',
    name: response.title ?? response.pc_catname ?? 'Unknown',
    durationMinutes: response.pc_duration,
    description: response.pc_catdesc,
  };
}

/**
 * Map OpenEMR appointment category list to MRSAppointmentType array.
 */
export function mapOpenEMRAppointmentTypeList(response: OpenEMRAppointmentCategoryResponse[]): MRSAppointmentType[] {
  return response.map(mapOpenEMRAppointmentType);
}
