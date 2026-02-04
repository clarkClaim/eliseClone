// OpenMRS Adapter Implementation
// Implements MRSAdapter interface for OpenMRS REST API

import type { MRSAdapter } from '../adapter.js';
import type {
  MRSPatient,
  MRSProvider,
  MRSAppointment,
  MRSSlot,
  PatientQuery,
  AppointmentFilter,
  DateRange,
  NewAppointment,
} from '../types.js';
import { NotFoundError, MRSValidationError } from '../errors.js';
import { OpenMRSClient } from './client.js';
import {
  mapPatient,
  mapPatientList,
  mapProvider,
  mapProviderList,
  mapAppointment,
  mapAppointmentList,
  mapSlotList,
} from './mappers.js';

export interface OpenMRSAdapterConfig {
  url: string;
  username: string;
  password: string;
  timeoutMs?: number;
  /** Maximum results per API request (default: 50, server may enforce lower) */
  maxResultsPerRequest?: number;
}

const DEFAULT_MAX_RESULTS = 50;

export class OpenMRSAdapter implements MRSAdapter {
  private readonly client: OpenMRSClient;
  private readonly maxResults: number;

  constructor(config: OpenMRSAdapterConfig) {
    this.client = new OpenMRSClient({
      baseUrl: config.url,
      username: config.username,
      password: config.password,
      timeoutMs: config.timeoutMs,
    });
    this.maxResults = config.maxResultsPerRequest ?? DEFAULT_MAX_RESULTS;
  }

  /**
   * Create an adapter from environment variables.
   * @throws Error if required environment variables are missing
   */
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

  async getPatients(limit?: number): Promise<MRSPatient[]> {
    const effectiveLimit = limit ?? this.maxResults;
    const response = await this.client.get<unknown>(
      `/patient?v=default&limit=${effectiveLimit}`
    );

    if (!response) {
      return [];
    }

    return mapPatientList(response as Parameters<typeof mapPatientList>[0]);
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
  // Appointment Operations
  // ============================================

  async getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]> {
    // Build query parameters
    const params = new URLSearchParams();
    params.set('fromDate', this.formatDate(filter.startDate));
    params.set('toDate', this.formatDate(filter.endDate));

    if (filter.providerMrsId) {
      params.set('provider', filter.providerMrsId);
    }
    if (filter.patientMrsId) {
      params.set('patient', filter.patientMrsId);
    }
    if (filter.status && filter.status.length > 0) {
      params.set('status', filter.status.join(','));
    }

    // Try the appointment scheduling module endpoint first
    // Fall back to bahmni endpoint if available
    const response = await this.client.get<unknown>(
      `/appointmentscheduling/appointment?${params.toString()}`
    );

    if (!response) {
      return [];
    }

    return mapAppointmentList(response as Parameters<typeof mapAppointmentList>[0]);
  }

  async createAppointment(appointment: NewAppointment): Promise<MRSAppointment> {
    const body = {
      patient: appointment.patientMrsId,
      provider: appointment.providerMrsId,
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

  async cancelAppointment(mrsId: string, reason: string): Promise<void> {
    // First, get the appointment to verify it exists
    const existing = await this.client.get<unknown>(
      `/appointmentscheduling/appointment/${mrsId}`
    );

    if (!existing) {
      throw new NotFoundError('Appointment', mrsId);
    }

    // Update status to CANCELLED
    await this.client.post(`/appointmentscheduling/appointment/${mrsId}`, {
      status: 'CANCELLED',
      cancelReason: reason,
    });
  }

  // ============================================
  // Availability Operations
  // ============================================

  async getAvailability(providerMrsId: string, dateRange: DateRange): Promise<MRSSlot[]> {
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
  // Helper Methods
  // ============================================

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
