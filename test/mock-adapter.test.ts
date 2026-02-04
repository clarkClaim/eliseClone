// Mock Adapter Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { MockMRSAdapter } from '../src/mrs/adapters/mock/index.js';
import { SlotConflictError, SlotNotFoundError, NotFoundError } from '../src/mrs/errors.js';

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

  describe('Slots and Appointments', () => {
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

      adapter.addSlot({
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: baseTime,
        endTime: endTime,
        isBooked: false,
      });
    });

    it('should verify slot availability', async () => {
      const result = await adapter.verifySlotAvailable('slot-1');
      expect(result.available).toBe(true);
      expect(result.slot?.mrsId).toBe('slot-1');
    });

    it('should throw SlotNotFoundError for unknown slot', async () => {
      await expect(adapter.verifySlotAvailable('unknown')).rejects.toThrow(SlotNotFoundError);
    });

    it('should create appointment', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
        reason: 'Checkup',
      });

      expect(appointment.mrsId).toBeDefined();
      expect(appointment.patientMrsId).toBe('patient-1');
      expect(appointment.status).toBe('scheduled');
    });

    it('should throw SlotConflictError for booked slot', async () => {
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
      });

      await expect(adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
      })).rejects.toThrow(SlotConflictError);
    });

    it('should cancel appointment', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
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

  describe('Availability Query', () => {
    it('should return slots within date range', async () => {
      adapter.addProvider({ mrsId: 'provider-1', name: 'Dr. Smith' });

      const jan15 = new Date('2024-01-15T10:00:00Z');
      const jan16 = new Date('2024-01-16T10:00:00Z');

      adapter.addSlot({
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: jan15,
        endTime: new Date(jan15.getTime() + 30 * 60000),
        isBooked: false,
      });

      adapter.addSlot({
        mrsId: 'slot-2',
        providerMrsId: 'provider-1',
        startTime: jan16,
        endTime: new Date(jan16.getTime() + 30 * 60000),
        isBooked: false,
      });

      const slots = await adapter.getAvailability({
        start: new Date('2024-01-15T00:00:00Z'),
        end: new Date('2024-01-15T23:59:59Z'),
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].mrsId).toBe('slot-1');
    });
  });
});
