// OpenMRS Integration Tests
// These tests run against the OpenMRS demo instance
// Run with: OPENMRS_URL=... OPENMRS_USER=... OPENMRS_PASSWORD=... pnpm test:integration

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenMRSAdapter } from '../src/mrs/adapters/openmrs/index.js';

const SKIP_INTEGRATION = !process.env.OPENMRS_URL;

describe.skipIf(SKIP_INTEGRATION)('OpenMRS Integration', () => {
  let adapter: OpenMRSAdapter;

  beforeAll(async () => {
    adapter = OpenMRSAdapter.fromEnv();
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  describe('Connection', () => {
    it('should connect and pass health check', async () => {
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeLessThan(5000);
    });
  });

  describe('Providers', () => {
    it('should fetch providers', async () => {
      const providers = await adapter.getProviders();
      expect(Array.isArray(providers)).toBe(true);
      // Demo instance should have providers
      console.log(`Found ${providers.length} providers`);
    });
  });

  describe('Locations', () => {
    it('should fetch locations', async () => {
      const locations = await adapter.getLocations();
      expect(Array.isArray(locations)).toBe(true);
      console.log(`Found ${locations.length} locations`);
    });
  });

  describe('Patients', () => {
    it('should search patients by name', async () => {
      const patients = await adapter.searchPatients({ name: 'John', limit: 5 });
      expect(Array.isArray(patients)).toBe(true);
      console.log(`Found ${patients.length} patients matching "John"`);
    });
  });

  describe('Availability', () => {
    it('should fetch time slots', async () => {
      const range = {
        start: new Date(),
        end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      const slots = await adapter.getAvailability(range);
      expect(Array.isArray(slots)).toBe(true);
      console.log(`Found ${slots.length} slots in next 7 days`);
    });
  });

  describe('Appointments', () => {
    it('should fetch appointments', async () => {
      const filter = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      const appointments = await adapter.getAppointments(filter);
      expect(Array.isArray(appointments)).toBe(true);
      console.log(`Found ${appointments.length} appointments`);
    });
  });
});
