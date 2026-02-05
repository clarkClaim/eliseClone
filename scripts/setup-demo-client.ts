#!/usr/bin/env tsx
/**
 * Register client on demo and save credentials to emr.env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profilePath = path.join(rootDir, 'config', 'profiles', 'emr.env');

const BASE_URL = 'https://demo.openemr.io/a/openemr';

function updateEnvFile(filePath: string, updates: Record<string, string>): void {
  let content = fs.readFileSync(filePath, 'utf-8');

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(filePath, content);
}

async function main() {
  console.log('=== Setup OpenEMR Demo Client ===\n');

  // Register with full scopes
  const payload = {
    application_type: 'private',
    redirect_uris: ['http://localhost:3001/oauth/callback'],
    client_name: `Elise-Demo-${Date.now()}`,
    token_endpoint_auth_method: 'client_secret_post',
    scope: [
      'openid',
      'offline_access',
      'api:oemr',
      'api:fhir',
      'user/patient.read',
      'user/patient.write',
      'user/appointment.read',
      'user/appointment.write',
      'user/practitioner.read',
      'user/facility.read',
      'user/list.read',
    ].join(' '),
  };

  console.log('1. Registering client...');
  const regResp = await fetch(`${BASE_URL}/oauth2/default/registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!regResp.ok) {
    console.log('   ✗ Registration failed:', await regResp.text());
    return;
  }

  const client = await regResp.json();
  console.log('   ✓ Registered:', client.client_name);
  console.log('   Client ID:', client.client_id);
  console.log('   Client Secret:', client.client_secret);
  console.log('   Scopes:', client.scope);

  // Update emr.env
  console.log('\n2. Updating config/profiles/emr.env...');
  updateEnvFile(profilePath, {
    'OPENEMR_URL': BASE_URL,
    'OPENEMR_CLIENT_ID': client.client_id,
    'OPENEMR_CLIENT_SECRET': client.client_secret,
  });
  console.log('   ✓ Saved credentials to emr.env');

  // Try to authenticate (will fail until enabled)
  console.log('\n3. Testing authentication...');
  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    client_id: client.client_id,
    client_secret: client.client_secret,
    username: 'admin',
    password: 'pass',
    user_role: 'users',
    scope: 'openid offline_access api:oemr api:fhir',
  });

  const tokenResp = await fetch(`${BASE_URL}/oauth2/default/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });

  if (tokenResp.ok) {
    const token = await tokenResp.json();
    console.log('   ✓ Authentication successful!');
    console.log('   Token expires in:', token.expires_in, 'seconds');

    // Test a quick API call
    const patientResp = await fetch(`${BASE_URL}/apis/default/api/patient?_count=1`, {
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    });
    console.log('   ✓ Patient API:', patientResp.status === 200 ? 'Working!' : `Status ${patientResp.status}`);

    console.log('\n=== READY TO USE ===');
  } else {
    console.log('   ✗ Auth failed (client needs to be enabled)');
    console.log('\n=== ACTION REQUIRED ===');
    console.log('Enable this client in OpenEMR admin:');
    console.log('  1. Go to: Administration > System > API Clients');
    console.log(`  2. Find: ${client.client_name}`);
    console.log('  3. Click Edit > Enable Client');
    console.log('\nThen run: pnpm tsx scripts/setup-demo-client.ts');
    console.log('Or test with: pnpm tsx scripts/test-demo-full.ts');
  }
}

main().catch(console.error);
