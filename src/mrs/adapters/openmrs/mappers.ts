// OpenMRS Data Mappers
// Transform OpenMRS API responses to canonical MRS types

import type {
  MRSPatient,
  MRSPhoneNumber,
  MRSProvider,
  MRSLocation,
  MRSAppointmentType,
  MRSAppointment,
  MRSAppointmentStatus,
  MRSSlot,
  MRSScheduleConfig,
  NewPatient,
} from '../../types.js';
import { STATUS_MAP, BAHMNI_STATUS_MAP } from './capabilities.js';

// ============================================
// OpenMRS API Response Types
// ============================================

interface OpenMRSPerson {
  uuid: string;
  display: string;
  preferredName?: {
    givenName?: string;
    familyName?: string;
  };
  gender?: string;
  birthdate?: string;
  attributes?: Array<{
    attributeType: { uuid: string; display: string };
    value: string;
  }>;
}

interface OpenMRSPatientResponse {
  uuid: string;
  display: string;
  person: OpenMRSPerson;
  identifiers?: Array<{
    identifier: string;
    identifierType: { display: string };
  }>;
}

interface OpenMRSProviderResponse {
  uuid: string;
  display: string;
  person?: OpenMRSPerson;
  attributes?: Array<{
    attributeType: { display: string };
    value: string;
  }>;
}

interface OpenMRSLocationResponse {
  uuid: string;
  display: string;
  name: string;
  address1?: string;
  address2?: string;
  cityVillage?: string;
  stateProvince?: string;
  postalCode?: string;
}

interface OpenMRSAppointmentTypeResponse {
  uuid: string;
  display: string;
  name: string;
  duration?: number;
  description?: string;
}

interface OpenMRSAppointmentResponse {
  uuid: string;
  patient: { uuid: string };
  provider?: { uuid: string };
  location?: { uuid: string };
  appointmentType?: { uuid: string };
  timeSlot?: {
    uuid: string;
    startDate: string;
    endDate: string;
  };
  startDateTime?: string;
  endDateTime?: string;
  status: string;
  reason?: string;
  cancelReason?: string;
}

interface OpenMRSSlotResponse {
  uuid: string;
  appointmentBlock?: {
    provider?: { uuid: string };
    location?: { uuid: string };
    types?: Array<{ uuid: string }>;
  };
  provider?: { uuid: string };
  location?: { uuid: string };
  appointmentType?: { uuid: string };
  startDate: string;
  endDate: string;
  status?: string;
  countOfAppointments?: number;
}

// ============================================
// Patient Mappers
// ============================================

export function mapPatient(response: OpenMRSPatientResponse): MRSPatient {
  const person = response.person;
  const phoneNumbers = extractPhoneNumbers(person);

  return {
    mrsId: response.uuid,
    name: response.display,
    givenName: person.preferredName?.givenName,
    familyName: person.preferredName?.familyName,
    dateOfBirth: person.birthdate ? new Date(person.birthdate) : undefined,
    gender: person.gender,
    phoneNumbers,
  };
}

function extractPhoneNumbers(person: OpenMRSPerson): MRSPhoneNumber[] {
  if (!person.attributes) {
    return [];
  }

  return person.attributes
    .filter(attr => attr.attributeType?.display?.toLowerCase().includes('phone'))
    .map((attr, index) => ({
      phone: attr.value,
      phoneType: attr.attributeType?.display?.toLowerCase().includes('mobile') ? 'mobile' : 'home',
      isPrimary: index === 0,
    }));
}

export function mapPatientList(response: { results: OpenMRSPatientResponse[] }): MRSPatient[] {
  return response.results.map(mapPatient);
}

// ============================================
// Patient Creation Mappers
// ============================================

/**
 * Luhn Mod-30 character set used by OpenMRS.
 * Excludes confusing characters (I, O, S, B, Q, Z, L).
 */
const LUHN_MOD30_CHARS = '0123456789ACDEFGHJKLMNPRTUVWXY';

/**
 * Calculate Luhn Mod-30 check digit.
 * Used by OpenMRS for identifier validation.
 */
function calculateLuhnMod30CheckDigit(identifier: string): string {
  const chars = LUHN_MOD30_CHARS;
  let sum = 0;
  let isDouble = true; // Start with doubling (rightmost position before check digit)

  // Process from right to left
  for (let i = identifier.length - 1; i >= 0; i--) {
    const char = identifier[i].toUpperCase();
    let value = chars.indexOf(char);
    if (value === -1) continue; // Skip invalid characters

    if (isDouble) {
      value *= 2;
      if (value >= 30) {
        value = Math.floor(value / 30) + (value % 30);
      }
    }
    sum += value;
    isDouble = !isDouble;
  }

  const checkDigit = (30 - (sum % 30)) % 30;
  return chars[checkDigit];
}

/**
 * Generate a valid OpenMRS identifier with Luhn Mod-30 check digit.
 * Format: 6 random characters + 1 check digit (e.g., "M3G7K4Y")
 */
export function generateEliseIdentifier(): string {
  const chars = LUHN_MOD30_CHARS;
  let base = '';

  // Generate 6 random characters from the valid character set
  for (let i = 0; i < 6; i++) {
    base += chars[Math.floor(Math.random() * chars.length)];
  }

  // Add Luhn Mod-30 check digit
  const checkDigit = calculateLuhnMod30CheckDigit(base);
  return base + checkDigit;
}

/**
 * OpenMRS patient creation payload structure.
 */
export interface OpenMRSPatientPayload {
  person: {
    names: Array<{ givenName: string; familyName: string; preferred: boolean }>;
    gender?: string;
    birthdate: string;
    attributes?: Array<{ attributeType: string; value: string }>;
  };
  identifiers: Array<{
    identifier: string;
    identifierType: string;
    location: string;
  }>;
}

/**
 * Map NewPatient to OpenMRS patient creation payload.
 * @param patient - The canonical patient data
 * @param config - OpenMRS-specific UUIDs for phone attribute, identifier type, and location
 */
export function mapNewPatientToOpenMRS(
  patient: NewPatient,
  config: {
    phoneAttributeTypeUuid?: string;
    identifierTypeUuid: string;
    identifierLocationUuid: string;
  }
): OpenMRSPatientPayload {
  // Format birthdate as YYYY-MM-DD
  const birthdate = patient.dateOfBirth.toISOString().split('T')[0];

  // Build person attributes (phone number)
  const attributes: Array<{ attributeType: string; value: string }> = [];
  if (patient.phone && config.phoneAttributeTypeUuid) {
    attributes.push({
      attributeType: config.phoneAttributeTypeUuid,
      value: patient.phone,
    });
  }

  // Map gender to OpenMRS format (M, F, or O for other)
  let gender: string | undefined;
  if (patient.gender) {
    const g = patient.gender.toLowerCase();
    if (g === 'male' || g === 'm') gender = 'M';
    else if (g === 'female' || g === 'f') gender = 'F';
    else gender = 'O';
  }

  return {
    person: {
      names: [
        {
          givenName: patient.givenName,
          familyName: patient.familyName,
          preferred: true,
        },
      ],
      gender,
      birthdate,
      attributes: attributes.length > 0 ? attributes : undefined,
    },
    identifiers: [
      {
        identifier: generateEliseIdentifier(),
        identifierType: config.identifierTypeUuid,
        location: config.identifierLocationUuid,
      },
    ],
  };
}

// ============================================
// FHIR Patient Mappers (for bulk listing)
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
  link?: Array<{
    relation: string;
    url: string;
  }>;
  total?: number;
}

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

export function mapFhirPatientBundle(bundle: FHIRBundle): MRSPatient[] {
  if (!bundle.entry) {
    return [];
  }
  return bundle.entry.map(entry => mapFhirPatient(entry.resource));
}

export function getFhirNextPageUrl(bundle: FHIRBundle): string | null {
  const nextLink = bundle.link?.find(l => l.relation === 'next');
  return nextLink?.url ?? null;
}

// ============================================
// Provider Mappers
// ============================================

export function mapProvider(response: OpenMRSProviderResponse): MRSProvider {
  const specialtyAttr = response.attributes?.find(
    attr => attr.attributeType.display.toLowerCase().includes('specialty')
  );

  return {
    mrsId: response.uuid,
    name: response.display,
    specialty: specialtyAttr?.value,
  };
}

export function mapProviderList(response: { results: OpenMRSProviderResponse[] }): MRSProvider[] {
  return response.results.map(mapProvider);
}

// ============================================
// Location Mappers
// ============================================

export function mapLocation(response: OpenMRSLocationResponse): MRSLocation {
  const addressParts = [
    response.address1,
    response.address2,
    response.cityVillage,
    response.stateProvince,
    response.postalCode,
  ].filter(Boolean);

  return {
    mrsId: response.uuid,
    name: response.name || response.display,
    address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
  };
}

export function mapLocationList(response: { results: OpenMRSLocationResponse[] }): MRSLocation[] {
  return response.results.map(mapLocation);
}

// ============================================
// Appointment Type Mappers (Legacy)
// ============================================

export function mapAppointmentType(response: OpenMRSAppointmentTypeResponse): MRSAppointmentType {
  return {
    mrsId: response.uuid,
    name: response.name || response.display,
    durationMinutes: response.duration,
    description: response.description,
  };
}

export function mapAppointmentTypeList(response: { results: OpenMRSAppointmentTypeResponse[] }): MRSAppointmentType[] {
  return response.results.map(mapAppointmentType);
}

// ============================================
// Bahmni API Response Types
// ============================================

export interface BahmniServiceType {
  uuid: string;
  name: string;
  duration?: number;
}

export interface BahmniWeeklyAvailability {
  dayOfWeek: string; // e.g., "MONDAY", "TUESDAY"
  startTime: string; // e.g., "09:00:00"
  endTime: string;   // e.g., "17:00:00"
  maxAppointmentsLimit?: number;
}

export interface BahmniAppointmentServiceResponse {
  uuid: string;
  name: string;
  description?: string | null;
  durationMins?: number | null;
  serviceTypes?: BahmniServiceType[];
  speciality?: { name: string; uuid: string } | null;
  location?: { uuid: string; name: string } | null;
  weeklyAvailability?: BahmniWeeklyAvailability[];
  maxAppointmentsLimit?: number;
}

export interface BahmniAppointmentResponse {
  uuid: string;
  patient: {
    uuid: string;
    identifier?: string;
    name?: string;
  };
  service: {
    uuid: string;
    name: string;
  };
  serviceType?: {
    uuid: string;
    name: string;
  } | null;
  location?: {
    uuid: string;
    name: string;
  } | null;
  providers?: Array<{
    uuid: string;
    name?: string;
    response?: string;
  }>;
  startDateTime: number; // Unix timestamp in milliseconds
  endDateTime: number;
  status: string;
  appointmentKind?: string;
  comments?: string;
  recurring?: boolean;
  voided?: boolean;
}

// ============================================
// Bahmni Appointment Service Mappers
// ============================================

export function mapBahmniAppointmentService(response: BahmniAppointmentServiceResponse): MRSAppointmentType {
  // Use service duration, or first service type duration if available
  const duration = response.durationMins ?? response.serviceTypes?.[0]?.duration;

  return {
    mrsId: response.uuid,
    name: response.name,
    durationMinutes: duration ?? undefined,
    description: response.description ?? undefined,
  };
}

export function mapBahmniAppointmentServiceList(response: BahmniAppointmentServiceResponse[]): MRSAppointmentType[] {
  return response.map(mapBahmniAppointmentService);
}

// ============================================
// Schedule Config Mappers
// ============================================

const DAY_OF_WEEK_MAP: Record<string, number> = {
  'SUNDAY': 0,
  'MONDAY': 1,
  'TUESDAY': 2,
  'WEDNESDAY': 3,
  'THURSDAY': 4,
  'FRIDAY': 5,
  'SATURDAY': 6,
};

/**
 * Map a Bahmni appointment service to MRSScheduleConfig.
 */
export function mapBahmniServiceToScheduleConfig(response: BahmniAppointmentServiceResponse): MRSScheduleConfig {
  const weeklyAvailability = (response.weeklyAvailability ?? []).map(wa => ({
    dayOfWeek: DAY_OF_WEEK_MAP[wa.dayOfWeek.toUpperCase()] ?? 0,
    startTime: wa.startTime.substring(0, 5), // Convert "09:00:00" to "09:00"
    endTime: wa.endTime.substring(0, 5),
  }));

  return {
    serviceId: response.uuid,
    serviceName: response.name,
    durationMins: response.durationMins ?? 30,
    weeklyAvailability,
    locationId: response.location?.uuid,
    maxAppointmentsPerSlot: response.maxAppointmentsLimit,
  };
}

/**
 * Map multiple Bahmni services to MRSScheduleConfig array.
 */
export function mapBahmniServicesToScheduleConfigs(response: BahmniAppointmentServiceResponse[]): MRSScheduleConfig[] {
  return response.map(mapBahmniServiceToScheduleConfig);
}

// ============================================
// Appointment Mappers
// ============================================

export function mapAppointmentStatus(openMrsStatus: string): MRSAppointmentStatus {
  return (STATUS_MAP[openMrsStatus.toUpperCase()] ?? 'scheduled') as MRSAppointmentStatus;
}

export function mapBahmniStatus(bahmniStatus: string): MRSAppointmentStatus {
  return (BAHMNI_STATUS_MAP[bahmniStatus] ?? 'scheduled') as MRSAppointmentStatus;
}

// ============================================
// Bahmni Appointment Mappers
// ============================================

export function mapBahmniAppointment(response: BahmniAppointmentResponse): MRSAppointment {
  // Get first provider if available
  const providerUuid = response.providers?.[0]?.uuid ?? '';

  return {
    mrsId: response.uuid,
    patientMrsId: response.patient.uuid,
    providerMrsId: providerUuid,
    locationMrsId: response.location?.uuid,
    appointmentTypeMrsId: response.service.uuid,
    startTime: new Date(response.startDateTime),
    endTime: new Date(response.endDateTime),
    status: mapBahmniStatus(response.status),
    reason: response.comments,
  };
}

export function mapBahmniAppointmentList(response: BahmniAppointmentResponse[]): MRSAppointment[] {
  return response.filter(apt => !apt.voided).map(mapBahmniAppointment);
}

export function mapAppointment(response: OpenMRSAppointmentResponse): MRSAppointment {
  const startTime = response.timeSlot?.startDate ?? response.startDateTime;
  const endTime = response.timeSlot?.endDate ?? response.endDateTime;

  if (!startTime || !endTime) {
    throw new Error(`Appointment ${response.uuid} missing start/end time`);
  }

  return {
    mrsId: response.uuid,
    patientMrsId: response.patient.uuid,
    providerMrsId: response.provider?.uuid ?? '',
    locationMrsId: response.location?.uuid,
    appointmentTypeMrsId: response.appointmentType?.uuid,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    status: mapAppointmentStatus(response.status),
    reason: response.reason,
    cancelReason: response.cancelReason,
  };
}

export function mapAppointmentList(response: { results?: OpenMRSAppointmentResponse[]; data?: OpenMRSAppointmentResponse[] }): MRSAppointment[] {
  const appointments = response.results ?? response.data ?? [];
  return appointments.map(mapAppointment);
}

// ============================================
// Slot Mappers
// ============================================

export function mapSlot(response: OpenMRSSlotResponse): MRSSlot {
  const isBooked = response.status?.toUpperCase() === 'FULL' ||
                   response.status?.toUpperCase() === 'BOOKED' ||
                   (response.countOfAppointments !== undefined && response.countOfAppointments > 0);

  const providerMrsId = response.provider?.uuid ?? response.appointmentBlock?.provider?.uuid ?? '';
  const locationMrsId = response.location?.uuid ?? response.appointmentBlock?.location?.uuid;
  const appointmentTypeMrsId = response.appointmentType?.uuid ?? response.appointmentBlock?.types?.[0]?.uuid;

  return {
    mrsId: response.uuid,
    providerMrsId,
    locationMrsId,
    appointmentTypeMrsId,
    startTime: new Date(response.startDate),
    endTime: new Date(response.endDate),
    isBooked,
  };
}

export function mapSlotList(response: { results: OpenMRSSlotResponse[] }): MRSSlot[] {
  return response.results.map(mapSlot);
}
