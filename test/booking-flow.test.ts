// Booking Flow Tests
// Tests for MRS-first booking with graceful degradation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMRSAdapter } from '../src/mrs/adapters/mock/index.js';
import type { MRSSlot } from '../src/mrs/types.js';

// Note: These tests mock the database interactions.
// For full integration tests, run against a test database.

describe('Booking Flow - Unit Tests', () => {
  let adapter: MockMRSAdapter;

  beforeEach(() => {
    adapter = new MockMRSAdapter({ latencyMs: 0 });

    // Set up test data
    adapter.addProvider({
      mrsId: 'provider-1',
      name: 'Dr. Smith',
    });

    adapter.addPatient({
      mrsId: 'patient-1',
      name: 'John Doe',
      phoneNumbers: [{ phone: '555-1234', isPrimary: true }],
    });
  });

  describe('Slot Verification', () => {
    it('should verify available slot', async () => {
      const slot: MRSSlot = {
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:30:00Z'),
        isBooked: false,
      };
      adapter.addSlot(slot);

      const result = await adapter.verifySlotAvailable('slot-1');
      expect(result.available).toBe(true);
    });

    it('should detect booked slot', async () => {
      const slot: MRSSlot = {
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:30:00Z'),
        isBooked: true,
      };
      adapter.addSlot(slot);

      const result = await adapter.verifySlotAvailable('slot-1');
      expect(result.available).toBe(false);
    });
  });

  describe('Appointment Creation', () => {
    beforeEach(() => {
      adapter.addSlot({
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:30:00Z'),
        isBooked: false,
      });
    });

    it('should create appointment successfully', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
        reason: 'Annual checkup',
      });

      expect(appointment.mrsId).toBeDefined();
      expect(appointment.status).toBe('scheduled');
    });

    it('should fail when slot is already booked', async () => {
      // First booking succeeds
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
      });

      // Second booking should fail
      await expect(adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
      })).rejects.toThrow();
    });
  });

  describe('Graceful Degradation', () => {
    it('should report unhealthy when MRS is down', async () => {
      adapter.setHealthy(false);

      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it('should fail to connect when MRS is unhealthy', async () => {
      adapter.setHealthy(false);

      await expect(adapter.connect()).rejects.toThrow();
    });
  });

  describe('Cancellation', () => {
    let appointmentMrsId: string;

    beforeEach(async () => {
      adapter.addSlot({
        mrsId: 'slot-1',
        providerMrsId: 'provider-1',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:30:00Z'),
        isBooked: false,
      });

      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerMrsId: 'provider-1',
        slotMrsId: 'slot-1',
      });

      appointmentMrsId = appointment.mrsId;
    });

    it('should cancel appointment in MRS', async () => {
      await adapter.cancelAppointment(appointmentMrsId, 'Patient request');

      const appointments = await adapter.getAppointments({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const cancelled = appointments.find(a => a.mrsId === appointmentMrsId);
      expect(cancelled?.status).toBe('cancelled');
    });
  });
});
