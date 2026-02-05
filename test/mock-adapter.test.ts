// Mock Adapter Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { MockMRSAdapter } from '../src/mrs/adapters/mock/index.js';
import { SlotConflictError, NotFoundError } from '../src/mrs/errors.js';

describe('MockMRSAdapter', () => {
  let adapter: MockMRSAdapter;

  beforeEach(() => {
    adapter = new MockMRSAdapter({ latencyMs: 0 });
  });

  describe('Connection', () => {
    it('should connect successfully when healthy', async () => {
      await expect(adapter.connect()).resolves.toBeUndefined();
    });

    it('should fail to connect when unhealthy', async () => {
      adapter.setHealthy(false);
      await expect(adapter.connect()).rejects.toThrow('Mock MRS is unhealthy');
    });

    it('should return health status', async () => {
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeDefined();
    });
  });

  describe('Patients', () => {
    it('should add and retrieve patients', async () => {
      adapter.addPatient({
        mrsId: 'patient-1',
        name: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        phoneNumbers: [],
      });

      const patient = await adapter.getPatient('patient-1');
      expect(patient).not.toBeNull();
      expect(patient?.name).toBe('John Doe');
    });

    it('should return null for unknown patient', async () => {
      const patient = await adapter.getPatient('unknown');
      expect(patient).toBeNull();
    });

    it('should search patients by name', async () => {
      adapter.addPatient({
        mrsId: 'patient-1',
        name: 'John Doe',
        phoneNumbers: [],
      });
      adapter.addPatient({
        mrsId: 'patient-2',
        name: 'Jane Smith',
        phoneNumbers: [],
      });

      const results = await adapter.searchPatients({ name: 'john' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('John Doe');
    });
  });

  describe('Appointments (Datetime-Based)', () => {
    const baseTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T10:30:00Z');

    beforeEach(() => {
      adapter.addProvider({
        mrsId: 'provider-1',
        name: 'Dr. Smith',
      });

      adapter.addPatient({
        mrsId: 'patient-1',
        name: 'John Doe',
        phoneNumbers: [],
      });
    });

    it('should check for conflicts with checkConflicts()', async () => {
      const result = await adapter.checkConflicts({
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
      });
      expect(result.hasConflict).toBe(false);
    });

    it('should detect conflicts when appointment exists', async () => {
      // Create an appointment
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
        reason: 'Checkup',
      });

      // Check for conflict at same time
      const result = await adapter.checkConflicts({
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingAppointments).toHaveLength(1);
    });

    it('should create appointment with datetime-based booking', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
        reason: 'Checkup',
      });

      expect(appointment.mrsId).toBeDefined();
      expect(appointment.patientMrsId).toBe('patient-1');
      expect(appointment.status).toBe('scheduled');
    });

    it('should throw SlotConflictError for overlapping appointment', async () => {
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
      });

      await expect(adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
      })).rejects.toThrow(SlotConflictError);
    });

    it('should cancel appointment', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
      });

      await adapter.cancelAppointment(appointment.mrsId, 'Patient request');

      const appointments = await adapter.getAppointments({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const cancelled = appointments.find(a => a.mrsId === appointment.mrsId);
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.cancelReason).toBe('Patient request');
    });

    it('should throw NotFoundError when cancelling unknown appointment', async () => {
      await expect(adapter.cancelAppointment('unknown', 'reason')).rejects.toThrow(NotFoundError);
    });
  });
});
