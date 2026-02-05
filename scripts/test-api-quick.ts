#!/usr/bin/env tsx
/**
 * Quick API test with saved credentials
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(__dirname, '..', 'config', 'profiles', 'emr.env');
const env = dotenv.parse(fs.readFileSync(profilePath));

const BASE_URL = env.OPENEMR_URL;
const CLIENT_ID = env.OPENEMR_CLIENT_ID;
const CLIENT_SECRET = env.OPENEMR_CLIENT_SECRET;

async function main() {
  console.log('=== OpenEMR API Test ===\n');
  console.log('URL:', BASE_URL);
  console.log('Client:', CLIENT_ID.substring(0, 20) + '...\n');

  // Get token
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: env.OPENEMR_USER || 'admin',
    password: env.OPENEMR_PASSWORD || 'pass',
    user_role: 'users',
    scope: 'openid offline_access api:oemr api:fhir user/patient.read user/patient.write user/appointment.read user/appointment.write user/practitioner.read user/facility.read user/list.read',
  });

  const tokenResp = await fetch(`${BASE_URL}/oauth2/default/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!tokenResp.ok) {
    console.log('✗ Auth failed:', await tokenResp.text());
    return;
  }

  const tokenData = await tokenResp.json();
  console.log('✓ Authentication successful!');
  console.log('  Token expires in:', tokenData.expires_in, 'seconds');
  console.log('  Scope:', tokenData.scope);

  const token = tokenData.access_token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

  console.log('\n--- Testing Endpoints ---\n');

  // Test endpoints
  const tests = [
    { name: 'Patients (API)', url: '/apis/default/api/patient?_count=3' },
    { name: 'Patients (FHIR)', url: '/apis/default/fhir/Patient?_count=3' },
    { name: 'Practitioners', url: '/apis/default/fhir/Practitioner?_count=3' },
    { name: 'Facilities', url: '/apis/default/api/facility' },
    { name: 'Appointments', url: '/apis/default/api/appointment' },
    { name: 'Appt Statuses', url: '/apis/default/api/list/apptstat' },
  ];

  for (const test of tests) {
    try {
      const resp = await fetch(`${BASE_URL}${test.url}`, { headers });
      let info = '';

      if (resp.ok) {
        const data = await resp.json();
        if (data.data) info = `${data.data.length} items`;
        else if (data.entry) info = `${data.entry.length} items`;
        else if (Array.isArray(data)) info = `${data.length} items`;
        else info = 'OK';
        console.log(`✓ ${test.name.padEnd(20)} ${resp.status}  ${info}`);
      } else {
        const text = await resp.text();
        console.log(`✗ ${test.name.padEnd(20)} ${resp.status}  ${text.substring(0, 40)}`);
      }
    } catch (e: any) {
      console.log(`✗ ${test.name.padEnd(20)} Error: ${e.message}`);
    }
  }

  console.log('\n=== OpenEMR API Ready ===');
}

main().catch(console.error);
