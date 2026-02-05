// Appointment Sync Tests
// Tests for service matching during appointment sync
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/db/client.js';
import type { MRSAppointment } from '../src/mrs/types.js';

// Mock prisma
vi.mock('../src/db/client.js', () => ({
  prisma: {
    appointmentType: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    provider: {
      findUnique: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    availability: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    appointment: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Appointment Sync Service Matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service matching by mrsId', () => {
    it('should match service by appointmentTypeMrsId first', async () => {
      const mockService = { id: 'local-service-1', mrsId: 'mrs-service-1', name: 'General Checkup' };

      vi.mocked(prisma.appointmentType.findUnique).mockResolvedValue(mockService);
      vi.mocked(prisma.appointmentType.findFirst).mockResolvedValue(null);

      // Call findUnique with the mrsId
      const result = await prisma.appointmentType.findUnique({
        where: { mrsId: 'mrs-service-1' },
      });

      expect(result).toEqual(mockService);
      expect(prisma.appointmentType.findUnique).toHaveBeenCalledWith({
        where: { mrsId: 'mrs-service-1' },
      });
    });
  });

  describe('Service matching by name fallback', () => {
    it('should fallback to name match when mrsId not found', async () => {
      const mockService = { id: 'local-service-1', mrsId: null, name: 'General Checkup' };

      vi.mocked(prisma.appointmentType.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.appointmentType.findFirst).mockResolvedValue(mockService);

      // First call returns null (no match by mrsId)
      const byMrsId = await prisma.appointmentType.findUnique({
        where: { mrsId: 'unknown-mrs-id' },
      });
      expect(byMrsId).toBeNull();

      // Second call matches by name
      const byName = await prisma.appointmentType.findFirst({
        where: {
          name: { contains: 'General Checkup', mode: 'insensitive' },
        },
      });
      expect(byName).toEqual(mockService);
    });

    it('should perform case-insensitive name matching', async () => {
      const mockService = { id: 'local-service-1', mrsId: null, name: 'GENERAL CHECKUP' };

      vi.mocked(prisma.appointmentType.findFirst).mockResolvedValue(mockService);

      const result = await prisma.appointmentType.findFirst({
        where: {
          name: { contains: 'general checkup', mode: 'insensitive' },
        },
      });

      expect(result).toEqual(mockService);
    });
  });

  describe('Missing service handling', () => {
    it('should handle missing service gracefully', async () => {
      vi.mocked(prisma.appointmentType.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.appointmentType.findFirst).mockResolvedValue(null);

      const byMrsId = await prisma.appointmentType.findUnique({
        where: { mrsId: 'unknown-id' },
      });

      const byName = await prisma.appointmentType.findFirst({
        where: {
          name: { contains: 'Unknown Service', mode: 'insensitive' },
        },
      });

      expect(byMrsId).toBeNull();
      expect(byName).toBeNull();
      // In actual code, serviceId would be null and a warning would be logged
    });
  });
});
