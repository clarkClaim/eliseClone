// Mock MRS Adapter
// For testing purposes - simulates MRS behavior without network calls

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
import { SlotConflictError, SlotNotFoundError, NotFoundError, MRSUnavailableError } from '../../errors.js';

export interface MockAdapterConfig {
  healthy?: boolean;
  latencyMs?: number;
  simulateFailures?: boolean;
  failureRate?: number;
}

export class MockMRSAdapter implements MRSAdapter {
  readonly systemType: MRSSystemType = 'openmrs';
  readonly capabilities: MRSCapabilities = {
    patientSearch: {
      byPhone: false,
      byName: true,
      byDOB: false,
      byIdentifier: true,
      globalSearch: true,
    },
    appointments: {
      canCreate: true,
      canCancel: true,
      canReschedule: false,
      canQueryByDateRange: true,
      canQueryByPatient: true,
      supportsStatuses: ['SCHEDULED', 'CANCELLED', 'COMPLETED'],
    },
    sync: {
      supportsIncrementalSync: false,
      supportsWebhooks: false,
      hasModifiedSinceQuery: false,
    },
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      burstLimit: 10,
      perEndpointLimits: {},
    },
  };

  private patients: Map<string, MRSPatient> = new Map();
  private providers: Map<string, MRSProvider> = new Map();
  private locations: Map<string, MRSLocation> = new Map();
  private appointmentTypes: Map<string, MRSAppointmentType> = new Map();
  private slots: Map<string, MRSSlot> = new Map();
  private appointments: Map<string, MRSAppointment> = new Map();

  private config: MockAdapterConfig;

  constructor(config: MockAdapterConfig = {}) {
    this.config = {
      healthy: true,
      latencyMs: 50,
      simulateFailures: false,
      failureRate: 0.1,
      ...config,
    };
  }

  // ============================================
  // Test Data Management
  // ============================================

  addPatient(patient: MRSPatient): void {
    this.patients.set(patient.mrsId, patient);
  }

  addProvider(provider: MRSProvider): void {
    this.providers.set(provider.mrsId, provider);
  }

  addLocation(location: MRSLocation): void {
    this.locations.set(location.mrsId, location);
  }

  addAppointmentType(type: MRSAppointmentType): void {
    this.appointmentTypes.set(type.mrsId, type);
  }

  addSlot(slot: MRSSlot): void {
    this.slots.set(slot.mrsId, slot);
  }

  addAppointment(appointment: MRSAppointment): void {
    this.appointments.set(appointment.mrsId, appointment);
    const slot = this.slots.get(appointment.mrsId);
    if (slot) {
      slot.isBooked = true;
    }
  }

  clearAll(): void {
    this.patients.clear();
    this.providers.clear();
    this.locations.clear();
    this.appointmentTypes.clear();
    this.slots.clear();
    this.appointments.clear();
  }

  setHealthy(healthy: boolean): void {
    this.config.healthy = healthy;
  }

  // ============================================
  // MRSAdapter Implementation
  // ============================================

  async connect(): Promise<void> {
    await this.simulateLatency();
    if (!this.config.healthy) {
      throw new MRSUnavailableError('Mock MRS is unhealthy');
    }
  }

  async disconnect(): Promise<void> {
    await this.simulateLatency();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    await this.simulateLatency();
    return {
      healthy: this.config.healthy ?? true,
      latencyMs: this.config.latencyMs ?? 50,
    };
  }

  async getPatient(mrsId: string): Promise<MRSPatient | null> {
    await this.simulateLatency();
    this.maybeThrowError();
    return this.patients.get(mrsId) ?? null;
  }

  async searchPatients(query: PatientQuery): Promise<MRSPatient[]> {
    await this.simulateLatency();
    this.maybeThrowError();

    const results: MRSPatient[] = [];
    for (const patient of this.patients.values()) {
      if (query.name && patient.name.toLowerCase().includes(query.name.toLowerCase())) {
        results.push(patient);
      }
    }
    return results.slice(0, query.limit ?? 100);
  }

  async getPatients(options?: { since?: Date; limit?: number }): Promise<MRSPatient[]> {
    await this.simulateLatency();
    this.maybeThrowError();
    return Array.from(this.patients.values()).slice(0, options?.limit ?? 100);
  }

  async getProvider(mrsId: string): Promise<MRSProvider | null> {
    await this.simulateLatency();
    this.maybeThrowError();
    return this.providers.get(mrsId) ?? null;
  }

  async getProviders(): Promise<MRSProvider[]> {
    await this.simulateLatency();
    this.maybeThrowError();
    return Array.from(this.providers.values());
  }

  async getLocations(): Promise<MRSLocation[]> {
    await this.simulateLatency();
    this.maybeThrowError();
    return Array.from(this.locations.values());
  }

  async getAppointmentTypes(): Promise<MRSAppointmentType[]> {
    await this.simulateLatency();
    this.maybeThrowError();
    return Array.from(this.appointmentTypes.values());
  }

  async getAvailability(range: DateRange): Promise<MRSSlot[]> {
    await this.simulateLatency();
    this.maybeThrowError();

    return Array.from(this.slots.values()).filter(
      slot => slot.startTime >= range.start && slot.endTime <= range.end
    );
  }

  async getProviderAvailability(providerMrsId: string, dateRange: DateRange): Promise<MRSSlot[]> {
    await this.simulateLatency();
    this.maybeThrowError();

    return Array.from(this.slots.values()).filter(
      slot =>
        slot.providerMrsId === providerMrsId &&
        slot.startTime >= dateRange.start &&
        slot.endTime <= dateRange.end
    );
  }

  async verifySlotAvailable(slotId: string): Promise<SlotVerificationResult> {
    await this.simulateLatency();
    this.maybeThrowError();

    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new SlotNotFoundError(slotId);
    }

    return {
      available: !slot.isBooked,
      slot,
    };
  }

  async getAppointments(filter: AppointmentFilter): Promise<MRSAppointment[]> {
    await this.simulateLatency();
    this.maybeThrowError();

    return Array.from(this.appointments.values()).filter(appt => {
      if (filter.providerMrsId && appt.providerMrsId !== filter.providerMrsId) return false;
      if (filter.patientMrsId && appt.patientMrsId !== filter.patientMrsId) return false;
      if (appt.startTime < filter.startDate || appt.startTime > filter.endDate) return false;
      if (filter.status && !filter.status.includes(appt.status)) return false;
      return true;
    });
  }

  async createAppointment(appointment: NewAppointment): Promise<MRSAppointment> {
    await this.simulateLatency();
    this.maybeThrowError();

    const slot = this.slots.get(appointment.slotMrsId);
    if (!slot) {
      throw new SlotNotFoundError(appointment.slotMrsId);
    }

    if (slot.isBooked) {
      throw new SlotConflictError(appointment.slotMrsId);
    }

    slot.isBooked = true;

    const mrsAppointment: MRSAppointment = {
      mrsId: `appt-${Date.now()}`,
      patientMrsId: appointment.patientMrsId,
      providerMrsId: appointment.providerMrsId,
      appointmentTypeMrsId: appointment.appointmentTypeMrsId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: 'scheduled',
      reason: appointment.reason,
    };

    this.appointments.set(mrsAppointment.mrsId, mrsAppointment);
    return mrsAppointment;
  }

  async cancelAppointment(mrsId: string, reason?: string): Promise<void> {
    await this.simulateLatency();
    this.maybeThrowError();

    const appointment = this.appointments.get(mrsId);
    if (!appointment) {
      throw new NotFoundError('Appointment', mrsId);
    }

    appointment.status = 'cancelled';
    appointment.cancelReason = reason;
  }

  async updateAppointmentStatus(mrsId: string, status: string): Promise<void> {
    await this.simulateLatency();
    this.maybeThrowError();

    const appointment = this.appointments.get(mrsId);
    if (!appointment) {
      throw new NotFoundError('Appointment', mrsId);
    }

    appointment.status = status as MRSAppointment['status'];
  }

  // ============================================
  // Helpers
  // ============================================

  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs && this.config.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.latencyMs));
    }
  }

  private maybeThrowError(): void {
    if (this.config.simulateFailures && Math.random() < (this.config.failureRate ?? 0.1)) {
      throw new MRSUnavailableError('Simulated failure');
    }
  }
}
