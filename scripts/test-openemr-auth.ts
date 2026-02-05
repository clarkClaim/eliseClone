#!/usr/bin/env tsx
/**
 * Debug script to test OpenEMR OAuth authentication directly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profilePath = path.join(rootDir, 'config', 'profiles', 'emr.env');

// Load profile env
const profileEnv = dotenv.parse(fs.readFileSync(profilePath));

console.log('=== OpenEMR Auth Debug ===\n');
console.log('Loaded from:', profilePath);
console.log('OPENEMR_URL:', profileEnv.OPENEMR_URL);
console.log('OPENEMR_CLIENT_ID:', profileEnv.OPENEMR_CLIENT_ID);
console.log('OPENEMR_CLIENT_SECRET:', profileEnv.OPENEMR_CLIENT_SECRET?.substring(0, 10) + '...');
console.log('OPENEMR_USER:', profileEnv.OPENEMR_USER);
console.log('');

const tokenUrl = `${profileEnv.OPENEMR_URL}/oauth2/default/token`;
console.log('Token URL:', tokenUrl);
console.log('');

// Try method 1: client_secret_post (credentials in body)
const params = new URLSearchParams({
  grant_type: 'password',
  client_id: profileEnv.OPENEMR_CLIENT_ID!,
  client_secret: profileEnv.OPENEMR_CLIENT_SECRET!,
  username: profileEnv.OPENEMR_USER!,
  password: profileEnv.OPENEMR_PASSWORD!,
  scope: 'openid offline_access api:oemr api:fhir user/patient.read user/patient.write user/appointment.read user/appointment.write',
});

// Try method 2: client_secret_basic (credentials in Authorization header)
const basicAuth = Buffer.from(`${profileEnv.OPENEMR_CLIENT_ID}:${profileEnv.OPENEMR_CLIENT_SECRET}`).toString('base64');
const paramsBasic = new URLSearchParams({
  grant_type: 'password',
  username: profileEnv.OPENEMR_USER!,
  password: profileEnv.OPENEMR_PASSWORD!,
  scope: 'openid offline_access api:oemr api:fhir user/patient.read user/patient.write user/appointment.read user/appointment.write',
});

console.log('=== Method 1: client_secret_post ===');
console.log('Request body:', params.toString().substring(0, 100) + '...');
console.log('');

try {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response:', text.substring(0, 200));
} catch (error) {
  console.error('Error:', error);
}

console.log('\n=== Method 2: client_secret_basic ===');
console.log('Authorization: Basic', basicAuth.substring(0, 20) + '...');
console.log('');

try {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: paramsBasic.toString(),
  });

  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  const text = await response.text();
  console.log('Response body:', text);

  if (response.ok) {
    console.log('\n✓ Authentication successful!');
  } else {
    console.log('\n✗ Authentication failed');
  }
} catch (error) {
  console.error('Fetch error:', error);
}
