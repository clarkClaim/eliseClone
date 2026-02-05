#!/usr/bin/env tsx
/**
 * Test OpenEMR adapter against the demo site
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(__dirname, '..', 'config', 'profiles', 'emr.env');
const env = dotenv.parse(fs.readFileSync(profilePath));

// Set env vars for the adapter
Object.assign(process.env, env);

async function main() {
  console.log('=== OpenEMR Adapter Test ===\n');

  // Dynamic import to pick up env vars
  const { OpenEMRAdapter } = await import('../src/mrs/adapters/openemr/adapter.js');

  const adapter = OpenEMRAdapter.fromEnv();

  console.log('1. Connecting...');
  try {
    await adapter.connect();
    console.log('   ✓ Connected!\n');
  } catch (e: any) {
    console.log('   ✗ Connection failed:', e.message);
    return;
  }

  console.log('2. Health check...');
  const health = await adapter.healthCheck();
  console.log(`   ${health.healthy ? '✓' : '✗'} Healthy: ${health.healthy}, Latency: ${health.latencyMs}ms\n`);

  console.log('3. Get patients...');
  try {
    const patients = await adapter.getPatients({ limit: 3 });
    console.log(`   ✓ Found ${patients.length} patients`);
    if (patients.length > 0) {
      console.log(`   First: ${patients[0].name} (${patients[0].mrsId})`);
    }
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  console.log('\n4. Get providers...');
  try {
    const providers = await adapter.getProviders();
    console.log(`   ✓ Found ${providers.length} providers`);
    if (providers.length > 0) {
      console.log(`   First: ${providers[0].name} (${providers[0].mrsId})`);
    }
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  console.log('\n5. Get locations...');
  try {
    const locations = await adapter.getLocations();
    console.log(`   ✓ Found ${locations.length} locations`);
    if (locations.length > 0) {
      console.log(`   First: ${locations[0].name}`);
    }
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  console.log('\n6. Get appointment types...');
  try {
    const types = await adapter.getAppointmentTypes();
    console.log(`   ✓ Found ${types.length} appointment types`);
    if (types.length > 0) {
      types.slice(0, 3).forEach(t => console.log(`   - ${t.name} (${t.mrsId})`));
    }
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  console.log('\n7. Get appointments...');
  try {
    const now = new Date();
    const appointments = await adapter.getAppointments({
      startDate: new Date(now.getFullYear(), 0, 1),
      endDate: new Date(now.getFullYear(), 11, 31),
    });
    console.log(`   ✓ Found ${appointments.length} appointments`);
    if (appointments.length > 0) {
      const apt = appointments[0];
      console.log(`   First: ${apt.startTime.toISOString()} - Status: ${apt.status}`);
    }
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  console.log('\n8. Search patients by name...');
  try {
    const results = await adapter.searchPatients({ name: 'John', limit: 3 });
    console.log(`   ✓ Found ${results.length} matches for "John"`);
  } catch (e: any) {
    console.log(`   ✗ Error: ${e.message}`);
  }

  await adapter.disconnect();
  console.log('\n=== Adapter Test Complete ===');
}

main().catch(console.error);
