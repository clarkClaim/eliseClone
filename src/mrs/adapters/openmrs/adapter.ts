// OpenMRS Adapter Implementation
// Implements MRSAdapter interface for OpenMRS REST API with appointment scheduling module

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
  PatientQuery,
  AppointmentFilter,
  DateRange,
  NewAppointment,
  SlotVerificationResult,
  HealthCheckResult,
} from '../../types.js';
import { NotFoundError, MRSValidationError, SlotConflictError, SlotNotFoundError } from '../../errors.js';
import { OpenMRSClient, type OpenMRSClientConfig } from './client.js';
import { OPENMRS_CAPABILITIES, OPENMRS_CAPABILITIES_NO_APPOINTMENTS, REVERSE_STATUS_MAP } from './capabilities.js';
import {
  mapPatient,
  mapPatientList,
  mapFhirPatientBundle,
  mapProvider,
  mapProviderList,
  mapLocation,
  mapLocationList,
  mapAppointmentType,
  mapAppointmentTypeList,
  mapAppointment,
  mapAppointmentList,
  mapSlot,
  mapSlotList,
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
   * Detect if the appointment scheduling module is installed.
   * If not, adjust capabilities accordingly.
   */
  private async detectAppointmentModule(): Promise<void> {
    try {
      // Try to access the appointment types endpoint as a probe
      const response = await this.client.get<unknown>(
        '/appointmentscheduling/appointmenttype?limit=1'
      );
      // If we get here without error, module is available
      this.appointmentModuleAvailable = response !== null;
    } catch {
      // Module not available - use limited capabilities
      console.log('[OpenMRSAdapter] Appointment scheduling module not available - running in limited mode');
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
  // Appointment Type Operations
  // ============================================

  async getAppointmentTypes(): Promise<MRSAppointmentType[]> {
    if (!this.appointmentModuleAvailable) {
      return [];
    }

    const response = await this.client.get<unknown>(
      `/appointmentscheduling/appointmenttype?v=default&limit=${this.maxResults}`
    );
    if (!response) {
      return [];
    }
    return mapAppointmentTypeList(response as Parameters<typeof mapAppointmentTypeList>[0]);
  }

  // ============================================
  // Availability Operations
  // ============================================

  async getAvailability(range: DateRange): Promise<MRSSlot[]> {
    if (!this.appointmentModuleAvailable) {
      // Appointment scheduling module not available - return empty
      // Availability must be managed locally
      return [];
    }

    const params = new URLSearchParams();
    params.set('fromDate', this.formatDate(range.start));
    params.set('toDate', this.formatDate(range.end));

    const response = await this.client.get<unknown>(
      `/appointmentscheduling/timeslot?${params.toString()}`
    );

    if (!response) {
      return [];
    }

    return mapSlotList(response as Parameters<typeof mapSlotList>[0]);
  }

  async getProviderAvailability(providerMrsId: string, dateRange: DateRange): Promise<MRSSlot[]> {
    if (!this.appointmentModuleAvailable) {
      return [];
    }

    const params = new URLSearchParams();
    params.set('provider', providerMrsId);
    params.set('fromDate', this.formatDate(dateRange.start));
    params.set('toDate', this.formatDate(dateRange.end));

    const response = await this.client.get<unknown>(
      `/appointmentscheduling/timeslot?${params.toString()}`
    );

    if (!response) {
      return [];
    }

    return mapSlotList(response as Parameters<typeof mapSlotList>[0]);
  }

  // ============================================
  // Real-Time Slot Validation
  // ============================================

  async verifySlotAvailable(slotId: string): Promise<SlotVerificationResult> {
    if (!this.appointmentModuleAvailable) {
      // Without appointment module, always return available
      // Local system manages availability
      return { available: true };
    }

    const response = await this.client.get<unknown>(
      `/appointmentscheduling/timeslot/${slotId}`
    );

    if (!response) {
      throw new SlotNotFoundError(slotId);
    }

    const slot = mapSlot(response as Parameters<typeof mapSlot>[0]);
    return {
      available: !slot.isBooked,
      slot,
    };
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

    const params = new URLSearchParams();
    params.set('fromDate', this.formatDate(filter.startDate));
    params.set('toDate', this.formatDate(filter.endDate));
    params.set('v', 'full');

    if (filter.providerMrsId) {
      params.set('provider', filter.providerMrsId);
    }
    if (filter.patientMrsId) {
      params.set('patient', filter.patientMrsId);
    }
    if (filter.status && filter.status.length > 0) {
      params.set('status', filter.status.join(','));
    }

    const response = await this.client.get<unknown>(
      `/appointmentscheduling/appointment?${params.toString()}`
    );

    if (!response) {
      return [];
    }

    return mapAppointmentList(response as Parameters<typeof mapAppointmentList>[0]);
  }

  async createAppointment(appointment: NewAppointment): Promise<MRSAppointment> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    const slotVerification = await this.verifySlotAvailable(appointment.slotMrsId);
    if (!slotVerification.available) {
      throw new SlotConflictError(appointment.slotMrsId);
    }

    const body = {
      patient: appointment.patientMrsId,
      timeSlot: appointment.slotMrsId,
      appointmentType: appointment.appointmentTypeMrsId,
      reason: appointment.reason,
      status: 'SCHEDULED',
    };

    const response = await this.client.post<unknown>(
      '/appointmentscheduling/appointment',
      body
    );

    if (!response) {
      throw new MRSValidationError('Failed to create appointment - no response from MRS');
    }

    return mapAppointment(response as Parameters<typeof mapAppointment>[0]);
  }

  async cancelAppointment(mrsId: string, reason?: string): Promise<void> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    const existing = await this.client.get<unknown>(
      `/appointmentscheduling/appointment/${mrsId}`
    );

    if (!existing) {
      throw new NotFoundError('Appointment', mrsId);
    }

    await this.client.post(`/appointmentscheduling/appointment/${mrsId}`, {
      status: 'CANCELLED',
      cancelReason: reason,
    });
  }

  async updateAppointmentStatus(mrsId: string, status: string): Promise<void> {
    if (!this.appointmentModuleAvailable) {
      throw new MRSValidationError('Appointment scheduling module not available on this OpenMRS instance');
    }

    const existing = await this.client.get<unknown>(
      `/appointmentscheduling/appointment/${mrsId}`
    );

    if (!existing) {
      throw new NotFoundError('Appointment', mrsId);
    }

    const openMrsStatus = REVERSE_STATUS_MAP[status] ?? status.toUpperCase();

    await this.client.post(`/appointmentscheduling/appointment/${mrsId}`, {
      status: openMrsStatus,
    });
  }

  // ============================================
  // Helper Methods
  // ============================================

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
