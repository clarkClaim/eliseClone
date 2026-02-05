// Startup Validation Tests
// Tests for essential data validation during server startup
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/db/client.js';

// Mock prisma - include schedule templates relation for provider.count queries
vi.mock('../src/db/client.js', () => ({
  prisma: {
    provider: {
      count: vi.fn(),
    },
    appointmentType: {
      count: vi.fn(),
    },
    location: {
      count: vi.fn(),
    },
    syncState: {
      findUnique: vi.fn(),
    },
    appointment: {
      count: vi.fn(),
    },
    patient: {
      count: vi.fn(),
    },
  },
}));

// Import after mocking
import { validateEssentialData } from '../src/sync/startup.js';

describe('Essential Data Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateEssentialData', () => {
    it('should pass validation when all essential data exists', async () => {
      // First call checks providers with schedules, second checks total
      vi.mocked(prisma.provider.count)
        .mockResolvedValueOnce(2) // providers with schedules
        .mockResolvedValueOnce(2); // total providers (only if first was 0)
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(3);
      vi.mocked(prisma.location.count).mockResolvedValue(1);

      const result = await validateEssentialData();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when no providers exist', async () => {
      vi.mocked(prisma.provider.count)
        .mockResolvedValueOnce(0) // providers with schedules
        .mockResolvedValueOnce(0); // total providers
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(3);
      vi.mocked(prisma.location.count).mockResolvedValue(1);

      const result = await validateEssentialData();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No providers found. At least one provider is required.');
    });

    it('should fail validation when no appointment types exist', async () => {
      vi.mocked(prisma.provider.count)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(0);
      vi.mocked(prisma.location.count).mockResolvedValue(1);

      const result = await validateEssentialData();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No appointment types (services) found. At least one service is required.');
    });

    it('should fail validation when no locations exist', async () => {
      vi.mocked(prisma.provider.count)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(3);
      vi.mocked(prisma.location.count).mockResolvedValue(0);

      const result = await validateEssentialData();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No locations found. At least one location is required.');
    });

    it('should report multiple errors when multiple issues exist', async () => {
      vi.mocked(prisma.provider.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      vi.mocked(prisma.appointmentType.count).mockResolvedValue(0);
      vi.mocked(prisma.location.count).mockResolvedValue(0);

      const result = await validateEssentialData();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
