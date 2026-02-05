#!/usr/bin/env tsx
/**
 * Set up OAuth2 client for local OpenEMR development.
 *
 * This script:
 * 1. Registers an OAuth2 client with OpenEMR
 * 2. Enables the client via SQL (for local dev - skips admin UI)
 * 3. Adds password grant type for API access
 *
 * Usage:
 *   pnpm openemr:setup
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profilePath = path.join(rootDir, 'config', 'profiles', 'emr.env');

interface RegistrationResponse {
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  registration_client_uri: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
}

function updateEnvFile(filePath: string, key: string, value: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }

  fs.writeFileSync(filePath, content);
}

function runSql(sql: string): boolean {
  try {
    execSync(
      `docker exec openemr-mysql mariadb -u root -proot openemr -e "${sql}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== OpenEMR Local Setup ===\n');

  // Load the emr profile to get OPENEMR_URL
  const profileEnv = dotenv.parse(fs.readFileSync(profilePath));
  const baseUrl = profileEnv.OPENEMR_URL;

  if (!baseUrl) {
    console.error('ERROR: OPENEMR_URL not set in config/profiles/emr.env');
    process.exit(1);
  }

  // Check if this is local OpenEMR
  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  if (!isLocal) {
    console.log('NOTE: Not using local OpenEMR. Use pnpm openemr:register instead.');
    console.log(`      Current OPENEMR_URL: ${baseUrl}`);
    process.exit(1);
  }

  // Check if OpenEMR is running
  console.log('1. Checking OpenEMR is running...');
  try {
    const healthCheck = await fetch(`${baseUrl}/oauth2/default/.well-known/openid-configuration`);
    if (!healthCheck.ok) throw new Error('Not ready');
    console.log('   ✓ OpenEMR is running\n');
  } catch {
    console.error('   ✗ OpenEMR is not responding');
    console.error('   Start it with: cd ../openemr-local && ./start.sh');
    process.exit(1);
  }

  // Register client
  console.log('2. Registering OAuth2 client...');
  const registrationUrl = `${baseUrl}/oauth2/default/registration`;

  const allScopes = [
    'openid', 'offline_access', 'api:oemr', 'api:fhir',
    'user/patient.read', 'user/patient.write',
    'user/appointment.read', 'user/appointment.write',
    'user/practitioner.read', 'user/practitioner.write',
    'user/facility.read', 'user/facility.write',
    'user/encounter.read', 'user/encounter.write',
    'user/list.read',
    'user/Patient.read', 'user/Patient.write',
    'user/Practitioner.read', 'user/Appointment.read',
    'user/Encounter.read', 'user/Location.read',
  ];

  const payload = {
    application_type: 'private',
    redirect_uris: ['http://localhost:3001/oauth/callback'],
    client_name: 'Elise Clone',
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['password', 'authorization_code', 'refresh_token'],
    scope: allScopes.join(' '),
  };

  try {
    const response = await fetch(registrationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ✗ Registration failed (${response.status}): ${errorText}`);
      process.exit(1);
    }

    const data = await response.json() as RegistrationResponse;

    // Save credentials
    updateEnvFile(profilePath, 'OPENEMR_CLIENT_ID', data.client_id);
    updateEnvFile(profilePath, 'OPENEMR_CLIENT_SECRET', data.client_secret);

    console.log('   ✓ Client registered');
    console.log(`   ✓ Credentials saved to config/profiles/emr.env\n`);

    // Enable client via SQL (local dev only)
    console.log('3. Enabling client via database...');
    const enableSql = `UPDATE oauth_clients SET is_enabled=1, grant_types='password authorization_code refresh_token' WHERE client_name='Elise Clone'`;

    if (runSql(enableSql)) {
      console.log('   ✓ Client enabled with password grant\n');
    } else {
      console.log('   ⚠ Could not enable via SQL (is openemr-mysql container running?)');
      console.log('   You may need to enable manually in OpenEMR admin UI\n');
    }

    // Test the connection
    console.log('4. Testing API access...');
    const tokenParams = new URLSearchParams({
      grant_type: 'password',
      client_id: data.client_id,
      client_secret: data.client_secret,
      username: 'admin',
      password: 'pass',
      user_role: 'users',
      scope: 'openid api:oemr user/patient.read',
    });

    const tokenRes = await fetch(`${baseUrl}/oauth2/default/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json() as { access_token: string };

      // Test patient API
      const patientRes = await fetch(`${baseUrl}/apis/default/api/patient?_count=1`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (patientRes.ok) {
        const patients = await patientRes.json() as { data: unknown[] };
        console.log(`   ✓ API working - found ${patients.data?.length ?? 0} patients\n`);
      } else {
        console.log(`   ⚠ Patient API returned ${patientRes.status}\n`);
      }
    } else {
      console.log(`   ⚠ Token request returned ${tokenRes.status}\n`);
    }

    console.log('=== Setup Complete ===');
    console.log('');
    console.log('You can now run: pnpm dev');

  } catch (error) {
    console.error('Failed:', (error as Error).message);
    process.exit(1);
  }
}

main();
