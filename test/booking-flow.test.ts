// Booking Flow Tests
// Tests for MRS-first booking with graceful degradation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMRSAdapter } from '../src/mrs/adapters/mock/index.js';

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

  describe('Conflict Detection', () => {
    const baseTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T10:30:00Z');

    it('should verify available slot', async () => {
      const result = await adapter.checkConflicts({
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
      });
      expect(result.hasConflict).toBe(false);
    });

    it('should detect booked slot', async () => {
      // Create an appointment first
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerId: 'provider-1',
        serviceId: 'service-1',
        startDateTime: baseTime,
        endDateTime: endTime,
      });

      const result = await adapter.checkConflicts({
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
      });
      expect(result.hasConflict).toBe(true);
    });
  });

  describe('Appointment Creation', () => {
    const baseTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T10:30:00Z');

    it('should create appointment successfully', async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerId: 'provider-1',
        serviceId: 'service-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        reason: 'Annual checkup',
      });

      expect(appointment.mrsId).toBeDefined();
      expect(appointment.status).toBe('scheduled');
    });

    it('should fail when slot is already booked', async () => {
      // First booking succeeds
      await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerId: 'provider-1',
        serviceId: 'service-1',
        startDateTime: baseTime,
        endDateTime: endTime,
      });

      // Second booking should fail
      await expect(adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerId: 'provider-1',
        serviceId: 'service-1',
        startDateTime: baseTime,
        endDateTime: endTime,
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
    const baseTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T10:30:00Z');
    let appointmentMrsId: string;

    beforeEach(async () => {
      const appointment = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        providerId: 'provider-1',
        serviceId: 'service-1',
        startDateTime: baseTime,
        endDateTime: endTime,
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
