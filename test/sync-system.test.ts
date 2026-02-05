// Sync System Tests
// Tests for sync startup, health endpoint readiness, idempotency, and cache invalidation
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock prisma before imports
vi.mock('../src/db/client.js', () => ({
  prisma: {
    provider: { count: vi.fn() },
    appointmentType: { count: vi.fn() },
    location: { count: vi.fn() },
    appointment: { count: vi.fn(), findMany: vi.fn() },
    patient: { count: vi.fn() },
    syncState: { findUnique: vi.fn(), upsert: vi.fn() },
    job: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db/client.js';

describe('Sync System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health Endpoint Readiness', () => {
    it('should report not ready before initial sync', async () => {
      // Import here to get fresh module state
      const { getReadinessState, setReadyState } = await import('../src/sync/startup.js');

      // Reset state
      setReadyState(false, false);

      const state = getReadinessState();
      expect(state.ready).toBe(false);
      expect(state.degraded).toBe(false);
    });

    it('should report ready after initial sync completes', async () => {
      const { getReadinessState, setReadyState } = await import('../src/sync/startup.js');

      setReadyState(true, false);

      const state = getReadinessState();
      expect(state.ready).toBe(true);
      expect(state.degraded).toBe(false);
    });

    it('should report degraded when sync times out', async () => {
      const { getReadinessState, setReadyState } = await import('../src/sync/startup.js');

      setReadyState(true, true);

      const state = getReadinessState();
      expect(state.ready).toBe(true);
      expect(state.degraded).toBe(true);
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate idempotency keys with correct format', async () => {
      const { generateIdempotencyKey } = await import('../src/sync/push/appointment-push.js');

      const key1 = generateIdempotencyKey('appt-123');
      const key2 = generateIdempotencyKey('appt-456');

      // Keys should contain the appointment ID
      expect(key1).toContain('appt-123');
      expect(key2).toContain('appt-456');

      // Keys should have the expected format
      expect(key1).toMatch(/^push_appt_appt-123_\d+$/);
      expect(key2).toMatch(/^push_appt_appt-456_\d+$/);

      // Different appointment IDs should produce different keys
      expect(key1).not.toBe(key2);
    });

    it('should create push job with idempotency key', async () => {
      vi.mocked(prisma.job.create).mockResolvedValue({
        id: 'job-123',
        type: 'push_appointment_to_mrs',
        idempotencyKey: 'push_appt_appt-456_12345',
        payload: { appointmentId: 'appt-456' },
        status: 'pending',
        priority: 10,
        runAt: new Date(),
        maxAttempts: 5,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        completedAt: null,
        lastError: null,
        backoffExponent: 1,
        nextRetryAt: null,
      });

      const { createPushJob } = await import('../src/sync/push/appointment-push.js');

      const jobId = await createPushJob('appt-456');

      expect(jobId).toBe('job-123');
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'push_appointment_to_mrs',
            payload: { appointmentId: 'appt-456' },
            idempotencyKey: expect.stringMatching(/^push_appt_appt-456_\d+$/),
          }),
        })
      );
    });
  });

  describe('Availability Cache Invalidation', () => {
    it('should invalidate cache for specific time range', async () => {
      const {
        invalidateAvailabilityCache,
        isTimeInvalidated,
        clearInvalidationCache,
      } = await import('../src/scheduling/availability-cache.js');

      // Clear any existing invalidations
      clearInvalidationCache();

      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T10:30:00Z');

      // Time should not be invalidated initially
      expect(isTimeInvalidated(start, end)).toBe(false);

      // Invalidate the time range
      invalidateAvailabilityCache(start, end, 'provider-123');

      // Now it should be invalidated
      expect(isTimeInvalidated(start, end, 'provider-123')).toBe(true);

      // Different provider should not be invalidated
      expect(isTimeInvalidated(start, end, 'provider-other')).toBe(false);
    });

    it('should revalidate cache when requested', async () => {
      const {
        invalidateAvailabilityCache,
        revalidateAvailabilityCache,
        isTimeInvalidated,
        clearInvalidationCache,
      } = await import('../src/scheduling/availability-cache.js');

      clearInvalidationCache();

      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T10:30:00Z');

      invalidateAvailabilityCache(start, end, 'provider-123');
      expect(isTimeInvalidated(start, end, 'provider-123')).toBe(true);

      revalidateAvailabilityCache(start, end, 'provider-123');
      expect(isTimeInvalidated(start, end, 'provider-123')).toBe(false);
    });
  });

  describe('Duplicate Detection Fallback', () => {
    it('should return existing appointment when duplicate detected', async () => {
      const { MockMRSAdapter } = await import('../src/mrs/adapters/mock/index.js');

      const adapter = new MockMRSAdapter({ latencyMs: 0 });

      // Add a provider and patient
      adapter.addProvider({ mrsId: 'provider-1', name: 'Dr. Smith' });
      adapter.addPatient({
        mrsId: 'patient-1',
        name: 'John Doe',
        phoneNumbers: [],
      });

      const baseTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T10:30:00Z');

      // Create first appointment
      const first = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
        idempotencyKey: 'key-123',
      });

      expect(first.mrsId).toBeDefined();

      // Try to create duplicate with same idempotency key
      const second = await adapter.createAppointment({
        patientMrsId: 'patient-1',
        startDateTime: baseTime,
        endDateTime: endTime,
        providerId: 'provider-1',
        serviceId: 'service-1',
        idempotencyKey: 'key-456', // Different key but same data
      });

      // Should return the existing appointment
      expect(second.mrsId).toBe(first.mrsId);
    });
  });

  describe('Sync Status', () => {
    it('should return sync status for all entities', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        entityType: 'appointments',
        lastSyncAt: new Date('2024-01-15T10:00:00Z'),
        lastSyncCursor: null,
        syncStatus: 'idle',
        lastError: null,
        nextSyncAt: new Date('2024-01-15T10:05:00Z'),
        lastSyncDuration: 1500,
        recordsProcessed: 50,
        consecutiveFailures: 0,
        rateLimitRemaining: null,
        rateLimitResetAt: null,
        backoffUntil: null,
      });

      vi.mocked(prisma.provider.count).mockResolvedValue(5);
      vi.mocked(prisma.patient.count).mockResolvedValue(100);
      vi.mocked(prisma.appointment.count).mockResolvedValue(50);
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(3);
      vi.mocked(prisma.location.count).mockResolvedValue(2);

      const { getSyncStatus } = await import('../src/sync/startup.js');

      const status = await getSyncStatus();

      expect(status.providers.count).toBe(5);
      expect(status.patients.count).toBe(100);
      expect(status.appointments.count).toBe(50);
    });
  });
});
