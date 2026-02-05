#!/usr/bin/env tsx
/**
 * Register an OAuth client on the OpenEMR Demo site
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

async function main() {
  console.log('=== Registering OAuth Client on OpenEMR Demo ===\n');

  // Try dynamic client registration
  const registrationUrl = `${BASE_URL}/oauth2/default/registration`;

  console.log('Registration URL:', registrationUrl);

  const clientData = {
    application_type: 'private',
    client_name: 'Elise Scheduling Test',
    redirect_uris: ['http://localhost:3001/callback'],
    token_endpoint_auth_method: 'client_secret_post',
    contacts: ['test@example.com'],
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

  console.log('\nClient registration payload:');
  console.log(JSON.stringify(clientData, null, 2));

  try {
    const resp = await fetch(registrationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(clientData),
    });

    console.log('\nResponse status:', resp.status);
    const text = await resp.text();
    console.log('Response:', text);

    if (resp.ok) {
      const data = JSON.parse(text);
      console.log('\n=== SUCCESS ===');
      console.log('Client ID:', data.client_id);
      console.log('Client Secret:', data.client_secret);
      console.log('Registration Token:', data.registration_access_token);

      // Now try to get a token
      console.log('\n=== Testing token acquisition ===');

      const tokenUrl = `${BASE_URL}/oauth2/default/token`;
      const tokenParams = new URLSearchParams({
        grant_type: 'password',
        client_id: data.client_id,
        client_secret: data.client_secret,
        username: 'admin',
        password: 'pass',
        scope: 'openid offline_access api:oemr api:fhir user/patient.read user/appointment.read',
      });

      const tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      console.log('Token response status:', tokenResp.status);
      const tokenText = await tokenResp.text();
      console.log('Token response:', tokenText);
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

main().catch(console.error);
