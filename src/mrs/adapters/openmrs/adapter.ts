// OpenMRS Adapter Implementation
// Implements MRSAdapter interface for OpenMRS REST API with Bahmni appointments module

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
import { OpenMRSClient, type OpenMRSClientConfig } from './client.js';
import { OPENMRS_CAPABILITIES, OPENMRS_CAPABILITIES_NO_APPOINTMENTS, BAHMNI_REVERSE_STATUS_MAP } from './capabilities.js';
import {
  mapPatient,
  mapPatientList,
  mapFhirPatientBundle,
  mapProvider,
  mapProviderList,
  mapLocation,
  mapLocationList,
  mapBahmniAppointmentServiceList,
  mapBahmniAppointmentList,
  mapBahmniServicesToScheduleConfigs,
  mapNewPatientToOpenMRS,
  type BahmniAppointmentServiceResponse,
  type BahmniAppointmentResponse,
} from './mappers.js';

export interface OpenMRSAdapterConfig {
  url: string;
  username: string;
  password: string;
  timeoutMs?: number;
  maxResultsPerRequest?: number;
}

const DEFAULT_MAX_RESULTS = 100;

export class OpenMRSAdapter implements MRSAdapter {
  readonly systemType: MRSSystemType = 'openmrs';
  capabilities: MRSCapabilities = OPENMRS_CAPABILITIES;

  private readonly client: OpenMRSClient;
  private readonly maxResults: number;
  private connected = false;
  private appointmentModuleAvailable = true;

  constructor(config: OpenMRSAdapterConfig) {
    this.client = new OpenMRSClient({
      baseUrl: config.url,
      username: config.username,
      password: config.password,
      timeoutMs: config.timeoutMs,
    });
    this.maxResults = config.maxResultsPerRequest ?? DEFAULT_MAX_RESULTS;
  }

  static fromEnv(): OpenMRSAdapter {
    const url = process.env.OPENMRS_URL;
    const username = process.env.OPENMRS_USER;
    const password = process.env.OPENMRS_PASSWORD;

    if (!url || !username || !password) {
      const missing = [];
      if (!url) missing.push('OPENMRS_URL');
      if (!username) missing.push('OPENMRS_USER');
      if (!password) missing.push('OPENMRS_PASSWORD');
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return new OpenMRSAdapter({
      url,
      username,
      password,
      timeoutMs: process.env.OPENMRS_TIMEOUT_MS
        ? parseInt(process.env.OPENMRS_TIMEOUT_MS, 10)
        : undefined,
      maxResultsPerRequest: process.env.OPENMRS_MAX_RESULTS
        ? parseInt(process.env.OPENMRS_MAX_RESULTS, 10)
        : undefined,
    });
  }

  // ============================================
  // Connection Management
  // ============================================

  async connect(): Promise<void> {
    const authenticated = await this.client.validateConnection();
    if (!authenticated) {
      throw new Error('OpenMRS authentication failed');
    }

    // Probe for appointment scheduling module availability
    await this.detectAppointmentModule();

    this.connected = true;
  }

  /**
   * Detect if the Bahmni appointments module is installed.
   * If not, adjust capabilities accordingly.
   */
  private async detectAppointmentModule(): Promise<void> {
    try {
      // Probe for Bahmni appointments module by checking services endpoint
      const response = await this.client.getAppointmentServices<unknown[]>();
      // If we get here without error and got a response, module is available
      this.appointmentModuleAvailable = response !== null;
      if (this.appointmentModuleAvailable) {
        console.log('[OpenMRSAdapter] Bahmni appointments module detected');
      }
    } catch {
      // Module not available - use limited capabilities
      console.log('[OpenMRSAdapter] Bahmni appointments module not available - running in limited mode');
      this.appointmentModuleAvailable = false;
      this.capabilities = OPENMRS_CAPABILITIES_NO_APPOINTMENTS;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.client.validateConnection();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          appointmentModuleAvailable: this.appointmentModuleAvailable,
        },
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Check if appointment scheduling module is available.
   * If not, appointments and availability sync will be skipped.
   */
  hasAppointmentSupport(): boolean {
    return this.appointmentModuleAvailable;
  }

  // ============================================
  // Patient Operations
  // ============================================

  async getPatient(mrsId: string): Promise<MRSPatient | null> {
    const response = await this.client.get<unknown>(`/patient/${mrsId}?v=full`);
    if (!response) {
      return null;
    }
    return mapPatient(response as Parameters<typeof mapPatient>[0]);
  }

  async searchPatients(query: PatientQuery): Promise<MRSPatient[]> {
    const searchTerm = query.name ?? query.phone ?? '';
    if (!searchTerm) {
      return [];
    }

    const limit = query.limit ?? this.maxResults;
    const response = await this.client.get<unknown>(
      `/patient?q=${encodeURIComponent(searchTerm)}&v=default&limit=${limit}`
    );

    if (!response) {
      return [];
    }

    return mapPatientList(response as Parameters<typeof mapPatientList>[0]);
  }

  async getPatients(options?: { since?: Date; limit?: number }): Promise<MRSPatient[]> {
    // OpenMRS REST API doesn't support listing all patients without a search query.
    // Use FHIR API instead which supports bulk listing.
    const limit = options?.limit ?? this.maxResults;
    const response = await this.client.getFhir<unknown>(
      `/Patient?_count=${limit}`
    );

    if (!response) {
      return [];
    }

    return mapFhirPatientBundle(response as Parameters<typeof mapFhirPatientBundle>[0]);
  }

  async createPatient(patient: NewPatient): Promise<MRSPatient> {
    // Get UUIDs from environment, with O3 demo defaults
    // See config/openmrs-o3-demo.json for reference
    const identifierTypeUuid = process.env.OPENMRS_IDENTIFIER_TYPE_UUID
      ?? '05a29f94-c0ed-11e2-94be-8c13b969e334'; // OpenMRS ID
    const identifierLocationUuid = process.env.OPENMRS_IDENTIFIER_LOCATION_UUID
      ?? '44c3efb0-2583-4c80-a79e-1f756a03c0a1'; // Outpatient Clinic
    const phoneAttributeTypeUuid = process.env.OPENMRS_PHONE_ATTR_UUID
      ?? '14d4f066-15f5-102d-96e4-000c29c2a5d7'; // Telephone Number

    // Build OpenMRS patient payload
    const payload = mapNewPatientToOpenMRS(patient, {
      phoneAttributeTypeUuid,
      identifierTypeUuid,
      identifierLocationUuid,
    });

    // Create patient in OpenMRS
    const response = await this.client.createPatient<{
      uuid: string;
      display: string;
      person: {
        uuid: string;
        preferredName?: { givenName?: string; familyName?: string };
        birthdate?: string;
        gender?: string;
        attributes?: Array<{
          attributeType: { uuid: string; display: string };
          value: string;
        }>;
      };
    }>(payload);

    if (!response?.uuid) {
      throw new MRSValidationError('Failed to create patient - no UUID in response');
    }

    // Map response to MRSPatient
    return {
      mrsId: response.uuid,
      name: response.display || `${patient.givenName} ${patient.familyName}`,
      givenName: response.person?.preferredName?.givenName ?? patient.givenName,
      familyName: response.person?.preferredName?.familyName ?? patient.familyName,
      dateOfBirth: response.person?.birthdate
        ? new Date(response.person.birthdate)
        : patient.dateOfBirth,
      gender: response.person?.gender,
      phoneNumbers: patient.phone
        ? [{ phone: patient.phone, phoneType: patient.phoneType ?? 'mobile', isPrimary: true }]
        : [],
    };
  }

  // ============================================
  // Provider Operations
  // ============================================

  async getProvider(mrsId: string): Promise<MRSProvider | null> {
    const response = await this.client.get<unknown>(`/provider/${mrsId}?v=full`);
    if (!response) {
      return null;
    }
    return mapProvider(response as Parameters<typeof mapProvider>[0]);
  }

  async getProviders(): Promise<MRSProvider[]> {
    const response = await this.client.get<unknown>(`/provider?v=default&limit=${this.maxResults}`);
    if (!response) {
      return [];
    }
    return mapProviderList(response as Parameters<typeof mapProviderList>[0]);
  }

  // ============================================
  // Location Operations
  // ============================================

  async getLocations(): Promise<MRSLocation[]> {
    const response = await this.client.get<unknown>(`/location?v=default&limit=${this.maxResults}`);
    if (!response) {
      return [];
    }
    return mapLocationList(response as Parameters<typeof mapLocationList>[0]);
  }

  // ============================================
  // Appointment Type Operations (Bahmni Services)
  // ============================================

  async getAppointmentTypes(): Promise<MRSAppointmentType[]> {
    if (!this.appointmentModuleAvailable) {
      return [];
    }

    const response = await this.client.getAppointmentServices<BahmniAppointmentServiceResponse[]>();
    if (!response) {
      return [];
    }
    return mapBahmniAppointmentServiceList(response);
  }

  // ============================================
  // Schedule Configuration
  // ============================================

  /**
   * Get schedule/service configuration from Bahmni.
   * Returns service hours and weekly availability patterns.
   */
  async getScheduleConfig(): Promise<MRSScheduleConfig[]> {
    if (!this.appointmentModuleAvailable) {
      return [];
    }

    const response = await this.client.getAppointmentServices<BahmniAppointmentServiceResponse[]>();
    if (!response) {
      return [];
    }
    return mapBahmniServicesToScheduleConfigs(response);
  }

  // ============================================
  // Conflict Detection
  // ============================================

  /**
   * Check for scheduling conflicts at a given time.
   * Queries existing appointments to detect overlaps.
   */
  async checkConflicts(request: ConflictCheckRequest): Promise<ConflictCheckResult> {
    if (!this.appointmentModuleAvailable) {
      // No appointment module - can't check conflicts in MRS
      return { hasConflict: false };
    }

    // Search for appointments in the requested time range
    const searchFilter: {
      startDate: string;
      endDate: string;
      providerUuid?: string;
    } = {
      startDate: this.formatDate(request.startDateTime),
      endDate: this.formatDate(request.endDateTime),
    };

    if (request.providerId) {
      searchFilter.providerUuid = request.providerId;
    }

    const appointments = await this.client.searchAppointments<BahmniAppointmentResponse[]>(searchFilter);

    if (!appointments || appointments.length === 0) {
      return { hasConflict: false };
    }

    // Filter to only active appointments that overlap with requested time
    const conflicting = mapBahmniAppointmentList(appointments).filter(apt => {
      // Skip the appointment being rescheduled
      if (request.excludeAppointmentId && apt.mrsId === request.excludeAppointmentId) {
        return false;
      }

      // Skip cancelled/completed appointments
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

  /**
   * Get availability for a date range.
   *
   * @deprecated Bahmni doesn't use slots. Use getScheduleConfig() + local AvailabilityService instead.
   * This method returns empty array for Bahmni adapters.
   */
  async getAvailability(_range: DateRange): Promise<MRSSlot[]> {
    console.warn('[OpenMRSAdapter] getAvailability() is deprecated. Use getScheduleConfig() + local AvailabilityService.');
    // Bahmni doesn't have discrete timeslots - services define availability windows
    return [];
  }

  /**
   * Get availability for a specific provider.
   *
   * @deprecated Bahmni doesn't use provider-based slots. Use getScheduleConfig() + local AvailabilityService.
   */
  async getProviderAvailability(_providerMrsId: string, _dateRange: DateRange): Promise<MRSSlot[]> {
    console.warn('[OpenMRSAdapter] getProviderAvailability() is deprecated. Use getScheduleConfig() + local AvailabilityService.');
    // Bahmni doesn't have provider-specific slots
    return [];
  }

  // ============================================
  // Real-Time Slot Validation (Deprecated)
  // ============================================

  /**
   * Verify slot availability.
   *
   * @deprecated Use checkConflicts() instead for datetime-based conflict detection.
   * Bahmni doesn't use slots - this always returns available.
   */
  async verifySlotAvailable(_slotId: string): Promise<SlotVerificationResult> {
    console.warn('[OpenMRSAdapter] verifySlotAvailable() is deprecated. Use checkConflicts() instead.');
    // Bahmni doesn't have slots - always return available
    return { available: true };
  }

  // ============================================
  // Appointment Operations
  // ============================================

  async getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]> {
    if (!this.appointmentModuleAvailable) {
      // Appointment scheduling module not available
      // Appointments are managed locally only
      return [];
    }

    // Build Bahmni search filter
    const searchFilter: {
      patientUuid?: string;
      providerUuid?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    } = {
      startDate: this.formatDate(filter.startDate),
      endDate: this.formatDate(filter.endDate),
    };

    if (filter.providerMrsId) {
      searchFilter.providerUuid = filter.providerMrsId;
    }
    if (filter.patientMrsId) {
      searchFilter.patientUuid = filter.patientMrsId;
    }
    // Note: Bahmni only supports single status filter, take first if multiple
    if (filter.status && filter.status.length > 0) {
      searchFilter.status = BAHMNI_REVERSE_STATUS_MAP[filter.status[0]] ?? filter.status[0];
    }

    const response = await this.client.searchAppointments<BahmniAppointmentResponse[]>(searchFilter);

    if (!response) {
      return [];
    }

    return mapBahmniAppointmentList(response);
  }

  async createAppointment(appointment: CreateAppointmentRequest): Promise<MRSAppointment> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    // Validate required fields for datetime-based booking
    if (!appointment.startDateTime || !appointment.endDateTime) {
      throw new MRSValidationError('startDateTime and endDateTime are required for appointments');
    }
    if (!appointment.serviceId) {
      throw new MRSValidationError('serviceId is required for Bahmni appointments');
    }

    const payload: {
      patientUuid: string;
      serviceUuid: string;
      startDateTime: string;
      endDateTime: string;
      appointmentKind: string;
      locationUuid?: string;
      providers?: Array<{ uuid: string }>;
      comments?: string;
    } = {
      patientUuid: appointment.patientMrsId,
      serviceUuid: appointment.serviceId,
      startDateTime: appointment.startDateTime.toISOString(),
      endDateTime: appointment.endDateTime.toISOString(),
      appointmentKind: 'Scheduled',
    };

    if (appointment.locationId) {
      payload.locationUuid = appointment.locationId;
    }
    if (appointment.providerId) {
      payload.providers = [{ uuid: appointment.providerId }];
    }
    if (appointment.reason) {
      payload.comments = appointment.reason;
    }

    const response = await this.client.createBahmniAppointment<BahmniAppointmentResponse>(payload);

    if (!response) {
      throw new MRSValidationError('Failed to create appointment - no response from MRS');
    }

    return {
      mrsId: response.uuid,
      patientMrsId: response.patient.uuid,
      providerMrsId: response.providers?.[0]?.uuid ?? '',
      locationMrsId: response.location?.uuid,
      appointmentTypeMrsId: response.service.uuid,
      startTime: new Date(response.startDateTime),
      endTime: new Date(response.endDateTime),
      status: 'scheduled',
      reason: response.comments,
    };
  }

  async cancelAppointment(mrsId: string, reason?: string): Promise<void> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    // Verify appointment exists
    const existing = await this.client.getAppointmentByUuid<BahmniAppointmentResponse>(mrsId);

    if (!existing) {
      throw new NotFoundError('Appointment', mrsId);
    }

    // Update status to Cancelled (Bahmni uses PascalCase)
    await this.client.updateBahmniAppointment(mrsId, {
      status: 'Cancelled',
      comments: reason,
    });
  }

  async updateAppointmentStatus(mrsId: string, status: string): Promise<void> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    // Verify appointment exists
    const existing = await this.client.getAppointmentByUuid<BahmniAppointmentResponse>(mrsId);

    if (!existing) {
      throw new NotFoundError('Appointment', mrsId);
    }

    // Map to Bahmni status (PascalCase)
    const bahmniStatus = BAHMNI_REVERSE_STATUS_MAP[status] ?? status;

    await this.client.updateBahmniAppointment(mrsId, {
      status: bahmniStatus,
    });
  }

  // ============================================
  // Helper Methods
  // ============================================

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
