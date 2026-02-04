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
} from '../../types.js';
import { STATUS_MAP } from './capabilities.js';

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
    .filter(attr => attr.attributeType.display.toLowerCase().includes('phone'))
    .map((attr, index) => ({
      phone: attr.value,
      phoneType: attr.attributeType.display.toLowerCase().includes('mobile') ? 'mobile' : 'home',
      isPrimary: index === 0,
    }));
}

export function mapPatientList(response: { results: OpenMRSPatientResponse[] }): MRSPatient[] {
  return response.results.map(mapPatient);
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
// Appointment Type Mappers
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
// Appointment Mappers
// ============================================

export function mapAppointmentStatus(openMrsStatus: string): MRSAppointmentStatus {
  return (STATUS_MAP[openMrsStatus.toUpperCase()] ?? 'scheduled') as MRSAppointmentStatus;
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
