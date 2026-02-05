#!/usr/bin/env npx ts-node
/**
 * OpenEMR Connection Test Script
 *
 * Tests the OpenEMR adapter against the configured instance.
 *
 * Usage:
 *   pnpm run test:openemr
 */

import { loadEnv } from '../src/utils/env.js';
loadEnv();
import { OpenEMRAdapter } from '../src/mrs/adapters/openemr/index.js';

async function main() {
  console.log('\n=== OpenEMR Connection Test ===\n');

  // Check environment
  const envVars = ['OPENEMR_URL', 'OPENEMR_CLIENT_ID', 'OPENEMR_CLIENT_SECRET', 'OPENEMR_USERNAME', 'OPENEMR_PASSWORD'];
  const missing = envVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    console.error('\nFor the public demo, you need to register an OAuth client first:');
    console.error('  curl -X POST "https://demo.openemr.io/openemr/oauth2/default/registration" \\');
    console.error('    -H "Content-Type: application/json" \\');
    console.error('    -d \'{"application_type":"private","redirect_uris":["http://localhost:3000/callback"],"client_name":"Elise","token_endpoint_auth_method":"client_secret_post","scope":"openid api:oemr user/patient.crus user/appointment.cruds"}\'');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  URL: ${process.env.OPENEMR_URL}`);
  console.log(`  Username: ${process.env.OPENEMR_USERNAME}`);
  console.log(`  Client ID: ${process.env.OPENEMR_CLIENT_ID?.substring(0, 20)}...`);

  try {
    // Create adapter
    console.log('\n1. Creating adapter...');
    const adapter = OpenEMRAdapter.fromEnv();
    console.log('   ✓ Adapter created');

    // Connect (OAuth authentication)
    console.log('\n2. Connecting (OAuth authentication)...');
    await adapter.connect();
    console.log('   ✓ Connected successfully');

    // Health check
    console.log('\n3. Health check...');
    const health = await adapter.healthCheck();
    console.log(`   ✓ Healthy: ${health.healthy}, Latency: ${health.latencyMs}ms`);

    // List providers
    console.log('\n4. Fetching providers...');
    const providers = await adapter.getProviders();
    console.log(`   ✓ Found ${providers.length} providers`);
    for (const p of providers.slice(0, 3)) {
      console.log(`     - ${p.name} (${p.mrsId})`);
    }
    if (providers.length > 3) console.log(`     ... and ${providers.length - 3} more`);

    // List locations
    console.log('\n5. Fetching locations...');
    const locations = await adapter.getLocations();
    console.log(`   ✓ Found ${locations.length} locations`);
    for (const l of locations.slice(0, 3)) {
      console.log(`     - ${l.name} (${l.mrsId})`);
    }
    if (locations.length > 3) console.log(`     ... and ${locations.length - 3} more`);

    // List appointment types
    console.log('\n6. Fetching appointment types...');
    const types = await adapter.getAppointmentTypes();
    console.log(`   ✓ Found ${types.length} appointment types`);
    for (const t of types.slice(0, 5)) {
      console.log(`     - ${t.name} (${t.mrsId})${t.durationMinutes ? ` - ${t.durationMinutes}min` : ''}`);
    }

    // Search patients
    console.log('\n7. Searching patients (name: "test")...');
    const patients = await adapter.searchPatients({ name: 'test', limit: 5 });
    console.log(`   ✓ Found ${patients.length} patients`);
    for (const p of patients.slice(0, 3)) {
      console.log(`     - ${p.name} (${p.mrsId})`);
    }

    // Disconnect
    console.log('\n8. Disconnecting...');
    await adapter.disconnect();
    console.log('   ✓ Disconnected');

    console.log('\n=== All Tests Passed! ===\n');
    console.log('OpenEMR adapter is working correctly.');
    console.log('You can now use it in your application.\n');

  } catch (error) {
    console.error('\n✗ Error:', (error as Error).message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main();
