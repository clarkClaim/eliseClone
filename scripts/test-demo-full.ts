#!/usr/bin/env tsx
/**
 * Full test: Register client with correct scopes, authenticate, and test API
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

async function main() {
  console.log('=== Full OpenEMR Demo Test ===\n');

  // Step 1: Register client with full scopes
  console.log('1. Registering client with full scopes...');

  const payload = {
    application_type: 'private',
    redirect_uris: ['http://localhost:3001/oauth/callback'],
    client_name: `Elise-Full-${Date.now()}`,
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

  const regResp = await fetch(`${BASE_URL}/oauth2/default/registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!regResp.ok) {
    console.log('   Registration failed:', regResp.status, await regResp.text());
    return;
  }

  const client = await regResp.json();
  console.log('   ✓ Registered:', client.client_name);
  console.log('   Client ID:', client.client_id);
  console.log('   Scopes granted:', client.scope);

  // Step 2: Try to authenticate
  console.log('\n2. Attempting authentication...');

  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    client_id: client.client_id,
    client_secret: client.client_secret,
    username: 'admin',
    password: 'pass',
    user_role: 'users',
    scope: 'openid offline_access api:oemr api:fhir user/patient.read user/appointment.read',
  });

  const tokenResp = await fetch(`${BASE_URL}/oauth2/default/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });

  console.log('   Token response:', tokenResp.status);
  const tokenText = await tokenResp.text();

  if (!tokenResp.ok) {
    console.log('   ✗ Auth failed:', tokenText);
    console.log('\n   The client needs to be ENABLED in the admin UI.');
    console.log('   Go to: Administration > System > API Clients');
    console.log(`   Find: ${client.client_name}`);
    console.log('   Click Edit > Enable Client');
    return;
  }

  const tokenData = JSON.parse(tokenText);
  console.log('   ✓ Got access token!');
  console.log('   Expires in:', tokenData.expires_in, 'seconds');
  console.log('   Scope:', tokenData.scope);

  const token = tokenData.access_token;

  // Step 3: Test API endpoints
  console.log('\n3. Testing API endpoints...');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };

  // Test patient endpoint
  const patientResp = await fetch(`${BASE_URL}/apis/default/api/patient?_count=2`, { headers });
  console.log('   GET /patient:', patientResp.status);
  if (patientResp.ok) {
    const data = await patientResp.json();
    console.log('   ✓ Got', data.data?.length ?? 0, 'patients');
  }

  // Test FHIR patient
  const fhirPatientResp = await fetch(`${BASE_URL}/apis/default/fhir/Patient?_count=2`, { headers });
  console.log('   GET /fhir/Patient:', fhirPatientResp.status);
  if (fhirPatientResp.ok) {
    const data = await fhirPatientResp.json();
    console.log('   ✓ Got', data.entry?.length ?? 0, 'FHIR patients');
  }

  // Test practitioners
  const practResp = await fetch(`${BASE_URL}/apis/default/fhir/Practitioner?_count=2`, { headers });
  console.log('   GET /fhir/Practitioner:', practResp.status);
  if (practResp.ok) {
    const data = await practResp.json();
    console.log('   ✓ Got', data.entry?.length ?? 0, 'practitioners');
  }

  // Test facilities
  const facResp = await fetch(`${BASE_URL}/apis/default/api/facility`, { headers });
  console.log('   GET /facility:', facResp.status);
  if (facResp.ok) {
    const data = await facResp.json();
    console.log('   ✓ Got', data.data?.length ?? 0, 'facilities');
  }

  // Test appointments
  const apptResp = await fetch(`${BASE_URL}/apis/default/api/appointment`, { headers });
  console.log('   GET /appointment:', apptResp.status);
  if (apptResp.ok) {
    const data = await apptResp.json();
    console.log('   ✓ Got', data.data?.length ?? 0, 'appointments');
  }

  console.log('\n=== SUCCESS ===');
  console.log('Client credentials for emr.env:');
  console.log(`OPENEMR_URL=${BASE_URL}`);
  console.log(`OPENEMR_CLIENT_ID=${client.client_id}`);
  console.log(`OPENEMR_CLIENT_SECRET=${client.client_secret}`);
}

main().catch(console.error);
