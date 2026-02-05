// OpenEMR Adapter Implementation
// Implements MRSAdapter interface for OpenEMR REST API

import type { MRSAdapter } from '../../adapter.js';
import type {
  MRSCapabilities,
  MRSSystemType,
  MRSPatient,
  MRSProvider,
  MRSLocation,
  MRSAppointmentType,
  MRSAppointment,
  MRSSlot,
  MRSScheduleConfig,
  PatientQuery,
  AppointmentFilter,
  DateRange,
  CreateAppointmentRequest,
  NewPatient,
  ConflictCheckRequest,
  ConflictCheckResult,
  SlotVerificationResult,
  HealthCheckResult,
} from '../../types.js';
import { NotFoundError, MRSValidationError } from '../../errors.js';
import { OpenEMRClient, type OpenEMRClientConfig } from './client.js';
import { OPENEMR_CAPABILITIES } from './capabilities.js';
import {
  mapOpenEMRPatient,
  mapOpenEMRPatientList,
  mapFhirPatient,
  mapFhirPatientBundle,
  mapNewPatientToOpenEMR,
  mapOpenEMRAppointment,
  mapOpenEMRAppointmentList,
  mapCreateAppointmentToOpenEMR,
  mapOpenEMRProviderBundle,
  mapOpenEMRProvider,
  mapOpenEMRLocationList,
  mapOpenEMRAppointmentTypeList,
  OPENEMR_REVERSE_STATUS_MAP,
  type OpenEMRPatientResponse,
  type OpenEMRPatientListResponse,
  type OpenEMRAppointmentResponse,
  type OpenEMRAppointmentListResponse,
  type OpenEMRFacilityListResponse,
  type OpenEMRAppointmentCategoryResponse,
  type FHIRPractitionerBundle,
} from './mappers.js';

export interface OpenEMRAdapterConfig {
  url: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  timeoutMs?: number;
}

export class OpenEMRAdapter implements MRSAdapter {
  readonly systemType: MRSSystemType = 'openemr';
  readonly capabilities: MRSCapabilities = OPENEMR_CAPABILITIES;

  private readonly client: OpenEMRClient;
  private connected = false;

  constructor(config: OpenEMRAdapterConfig) {
    this.client = new OpenEMRClient({
      baseUrl: config.url,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      username: config.username,
      password: config.password,
      timeoutMs: config.timeoutMs,
    });
  }

  static fromEnv(): OpenEMRAdapter {
    const url = process.env.OPENEMR_URL;
    const clientId = process.env.OPENEMR_CLIENT_ID;
    const clientSecret = process.env.OPENEMR_CLIENT_SECRET;
    const username = process.env.OPENEMR_USER; // Consistent with OPENMRS_USER
    const password = process.env.OPENEMR_PASSWORD;

    if (!url || !clientId || !clientSecret || !username || !password) {
      const missing = [];
      if (!url) missing.push('OPENEMR_URL');
      if (!clientId) missing.push('OPENEMR_CLIENT_ID');
      if (!clientSecret) missing.push('OPENEMR_CLIENT_SECRET');
      if (!username) missing.push('OPENEMR_USER');
      if (!password) missing.push('OPENEMR_PASSWORD');
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return new OpenEMRAdapter({
      url,
      clientId,
      clientSecret,
      username,
      password,
      timeoutMs: process.env.OPENEMR_TIMEOUT_MS
        ? parseInt(process.env.OPENEMR_TIMEOUT_MS, 10)
        : undefined,
    });
  }

  // ============================================
  // Connection Management
  // ============================================

  async connect(): Promise<void> {
    await this.client.authenticate();
    const valid = await this.client.validateConnection();
    if (!valid) {
      throw new Error('OpenEMR connection validation failed');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.client.clearAuth();
    this.connected = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const valid = await this.client.validateConnection();
      return {
        healthy: valid,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ============================================
  // Patient Operations
  // ============================================

  async getPatient(mrsId: string): Promise<MRSPatient | null> {
    const response = await this.client.get<OpenEMRPatientResponse>(`/patient/${mrsId}`);
    if (!response) {
      return null;
    }
    return mapOpenEMRPatient(response);
  }

  async searchPatients(query: PatientQuery): Promise<MRSPatient[]> {
    // Build query parameters
    const params = new URLSearchParams();

    if (query.name) {
      // OpenEMR FHIR supports name search
      params.set('name', query.name);
    }
    if (query.phone) {
      params.set('phone', query.phone);
    }
    if (query.limit) {
      params.set('_count', query.limit.toString());
    }

    const queryString = params.toString();
    const path = queryString ? `/Patient?${queryString}` : '/Patient';

    // Use FHIR for search as it has better support
    const response = await this.client.getFhir<{ entry?: Array<{ resource: { id: string; name?: Array<{ text?: string; family?: string; given?: string[] }>; gender?: string; birthDate?: string; telecom?: Array<{ system?: string; value?: string; use?: string }> } }> }>(path);

    if (!response?.entry) {
      return [];
    }

    return mapFhirPatientBundle(response as Parameters<typeof mapFhirPatientBundle>[0]);
  }

  async getPatients(options?: { since?: Date; limit?: number }): Promise<MRSPatient[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('_count', options.limit.toString());
    }

    const queryString = params.toString();
    const path = queryString ? `/Patient?${queryString}` : '/Patient';

    const response = await this.client.getFhir<{ entry?: Array<{ resource: { id: string; name?: Array<{ text?: string; family?: string; given?: string[] }>; gender?: string; birthDate?: string; telecom?: Array<{ system?: string; value?: string; use?: string }> } }> }>(path);

    if (!response?.entry) {
      return [];
    }

    return mapFhirPatientBundle(response as Parameters<typeof mapFhirPatientBundle>[0]);
  }

  async createPatient(patient: NewPatient): Promise<MRSPatient> {
    const payload = mapNewPatientToOpenEMR(patient);

    const response = await this.client.post<OpenEMRPatientResponse>('/patient', payload);

    if (!response?.uuid) {
      throw new MRSValidationError('Failed to create patient - no UUID in response');
    }

    return mapOpenEMRPatient(response);
  }

  // ============================================
  // Provider Operations
  // ============================================

  async getProvider(mrsId: string): Promise<MRSProvider | null> {
    const response = await this.client.getFhir<{ id?: string; uuid?: string; name?: Array<{ text?: string; family?: string; given?: string[] }> }>(`/Practitioner/${mrsId}`);
    if (!response) {
      return null;
    }
    return mapOpenEMRProvider(response);
  }

  async getProviders(): Promise<MRSProvider[]> {
    const response = await this.client.getFhir<FHIRPractitionerBundle>('/Practitioner');
    if (!response) {
      return [];
    }
    return mapOpenEMRProviderBundle(response);
  }

  // ============================================
  // Location Operations
  // ============================================

  async getLocations(): Promise<MRSLocation[]> {
    const response = await this.client.get<OpenEMRFacilityListResponse>('/facility');
    if (!response) {
      return [];
    }
    return mapOpenEMRLocationList(response);
  }

  // ============================================
  // Appointment Type Operations
  // ============================================

  async getAppointmentTypes(): Promise<MRSAppointmentType[]> {
    // OpenEMR stores appointment categories in the list system
    const response = await this.client.get<OpenEMRAppointmentCategoryResponse[]>('/list/apptstat');
    if (!response || !Array.isArray(response)) {
      return [];
    }
    return mapOpenEMRAppointmentTypeList(response);
  }

  // ============================================
  // Schedule Configuration (Not Supported)
  // ============================================

  async getScheduleConfig(): Promise<MRSScheduleConfig[]> {
    // OpenEMR doesn't have Bahmni-style service configurations
    return [];
  }

  // ============================================
  // Conflict Detection
  // ============================================

  async checkConflicts(request: ConflictCheckRequest): Promise<ConflictCheckResult> {
    // Query appointments in the requested time range
    const filter: AppointmentFilter = {
      startDate: request.startDateTime,
      endDate: request.endDateTime,
    };

    if (request.providerId) {
      filter.providerMrsId = request.providerId;
    }

    const appointments = await this.getAppointments(filter);

    // Filter to only active appointments that overlap
    const conflicting = appointments.filter(apt => {
      // Skip the appointment being rescheduled
      if (request.excludeAppointmentId && apt.mrsId === request.excludeAppointmentId) {
        return false;
      }

      // Skip cancelled/completed/no-show appointments
      if (apt.status === 'cancelled' || apt.status === 'completed' || apt.status === 'no_show') {
        return false;
      }

      // Check for time overlap
      const requestStart = request.startDateTime.getTime();
      const requestEnd = request.endDateTime.getTime();
      const aptStart = apt.startTime.getTime();
      const aptEnd = apt.endTime.getTime();

      // Overlap if: request starts before apt ends AND request ends after apt starts
      return requestStart < aptEnd && requestEnd > aptStart;
    });

    if (conflicting.length > 0) {
      return {
        hasConflict: true,
        conflictingAppointments: conflicting,
        reason: `Found ${conflicting.length} conflicting appointment(s)`,
      };
    }

    return { hasConflict: false };
  }

  // ============================================
  // Availability Operations (Deprecated)
  // ============================================

  async getAvailability(_range: DateRange): Promise<MRSSlot[]> {
    console.warn('[OpenEMRAdapter] getAvailability() is deprecated. OpenEMR uses appointment-based scheduling.');
    return [];
  }

  async getProviderAvailability(_providerMrsId: string, _dateRange: DateRange): Promise<MRSSlot[]> {
    console.warn('[OpenEMRAdapter] getProviderAvailability() is deprecated. OpenEMR uses appointment-based scheduling.');
    return [];
  }

  // ============================================
  // Real-Time Slot Validation (Deprecated)
  // ============================================

  async verifySlotAvailable(_slotId: string): Promise<SlotVerificationResult> {
    console.warn('[OpenEMRAdapter] verifySlotAvailable() is deprecated. Use checkConflicts() instead.');
    // OpenEMR doesn't have slots - always return available
    return { available: true };
  }

  // ============================================
  // Appointment Operations
  // ============================================

  async getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]> {
    // Build the endpoint path based on filter
    let path = '/appointment';
    const params = new URLSearchParams();

    // Note: OpenEMR API may have different query parameter names
    // Adjust based on actual API behavior
    if (filter.patientMrsId) {
      // When filtering by patient, use the patient-specific endpoint
      path = `/patient/${filter.patientMrsId}/appointment`;
    }

    const response = await this.client.get<OpenEMRAppointmentListResponse>(path);

    if (!response) {
      return [];
    }

    let appointments = mapOpenEMRAppointmentList(response);

    // Filter by date range client-side if needed
    appointments = appointments.filter(apt => {
      const aptDate = apt.startTime.getTime();
      const startTime = filter.startDate.getTime();
      const endTime = filter.endDate.getTime();
      return aptDate >= startTime && aptDate <= endTime;
    });

    // Filter by provider if specified and not already filtered
    if (filter.providerMrsId) {
      appointments = appointments.filter(apt => apt.providerMrsId === filter.providerMrsId);
    }

    // Filter by status if specified
    if (filter.status && filter.status.length > 0) {
      appointments = appointments.filter(apt => filter.status!.includes(apt.status));
    }

    return appointments;
  }

  async createAppointment(appointment: CreateAppointmentRequest): Promise<MRSAppointment> {
    // Validate required fields
    if (!appointment.startDateTime || !appointment.endDateTime) {
      throw new MRSValidationError('startDateTime and endDateTime are required for appointments');
    }
    if (!appointment.serviceId) {
      throw new MRSValidationError('serviceId (pc_catid) is required for OpenEMR appointments');
    }
    if (!appointment.patientMrsId) {
      throw new MRSValidationError('patientMrsId is required for appointments');
    }

    const payload = mapCreateAppointmentToOpenEMR(appointment);

    // OpenEMR creates appointments under the patient
    const response = await this.client.post<OpenEMRAppointmentResponse>(
      `/patient/${appointment.patientMrsId}/appointment`,
      payload
    );

    if (!response) {
      throw new MRSValidationError('Failed to create appointment - no response from OpenEMR');
    }

    return mapOpenEMRAppointment(response);
  }

  async cancelAppointment(mrsId: string, _reason?: string): Promise<void> {
    // OpenEMR uses DELETE for appointment cancellation
    // The appointment is associated with a patient, but we can delete by eid
    // First, we need to find the appointment to get the patient ID
    const appointments = await this.client.get<OpenEMRAppointmentListResponse>('/appointment');

    if (!appointments?.data) {
      throw new NotFoundError('Appointment', mrsId);
    }

    const appointment = appointments.data.find(
      apt => apt.pc_eid === mrsId || apt.uuid === mrsId || apt.id === mrsId
    );

    if (!appointment) {
      throw new NotFoundError('Appointment', mrsId);
    }

    const patientId = appointment.patient_uuid ?? appointment.pc_pid;
    if (!patientId) {
      throw new MRSValidationError('Cannot determine patient ID for appointment cancellation');
    }

    await this.client.delete(`/patient/${patientId}/appointment/${mrsId}`);
  }

  async updateAppointmentStatus(mrsId: string, status: string): Promise<void> {
    // OpenEMR doesn't have a direct status update endpoint
    // Status updates would need to go through a different mechanism
    // For now, throw not implemented
    const openemrStatus = OPENEMR_REVERSE_STATUS_MAP[status];
    if (!openemrStatus) {
      throw new MRSValidationError(`Unknown status: ${status}`);
    }

    // Note: This may need to be implemented differently based on OpenEMR API capabilities
    throw new MRSValidationError('Appointment status update not directly supported by OpenEMR API. Consider cancelling and recreating the appointment.');
  }
}
