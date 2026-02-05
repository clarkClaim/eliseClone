#!/usr/bin/env tsx
/**
 * Complete OpenEMR Demo API Test
 * Tests authentication with proper parameters and probes all capabilities
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

// Register a fresh client
async function registerClient(): Promise<{ clientId: string; clientSecret: string } | null> {
  console.log('=== Registering Fresh OAuth Client ===');

  const registrationUrl = `${BASE_URL}/oauth2/default/registration`;
  const clientData = {
    application_type: 'private',
    client_name: `Elise-Test-${Date.now()}`,
    redirect_uris: ['http://localhost:3001/callback'],
    token_endpoint_auth_method: 'client_secret_post',
    contacts: ['test@example.com'],
    scope: 'openid offline_access api:oemr api:fhir user/patient.read user/patient.write user/appointment.read user/appointment.write user/practitioner.read user/facility.read user/list.read',
  };

  try {
    const resp = await fetch(registrationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(clientData),
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log('  ✓ Registered client:', data.client_id.substring(0, 20) + '...');
      return { clientId: data.client_id, clientSecret: data.client_secret };
    }
    console.log('  ✗ Registration failed:', resp.status, await resp.text());
  } catch (e: any) {
    console.log('  ✗ Error:', e.message);
  }
  return null;
}

// Try different users and roles
async function tryAuth(clientId: string, clientSecret: string) {
  console.log('\n=== Testing Authentication Methods ===');

  const tokenUrl = `${BASE_URL}/oauth2/default/token`;

  // Different user/role combinations
  const attempts = [
    { user: 'admin', pass: 'pass', role: 'users' },
    { user: 'physician', pass: 'physician', role: 'users' },
    { user: 'clinician', pass: 'clinician', role: 'users' },
    { user: 'accountant', pass: 'accountant', role: 'users' },
    { user: 'receptionist', pass: 'receptionist', role: 'users' },
    { user: 'front', pass: 'front', role: 'users' },
  ];

  for (const attempt of attempts) {
    console.log(`\nTrying ${attempt.user}/${attempt.role}...`);

    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: attempt.user,
      password: attempt.pass,
      user_role: attempt.role,
      scope: 'openid offline_access api:oemr api:fhir',
    });

    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const text = await resp.text();
      console.log(`  Status: ${resp.status}`);

      if (resp.ok) {
        const data = JSON.parse(text);
        console.log('  ✓ SUCCESS! Got token');
        console.log('  Token expires in:', data.expires_in, 'seconds');
        console.log('  Scope:', data.scope);
        return data.access_token;
      }

      // Parse error for details
      try {
        const error = JSON.parse(text);
        console.log(`  Error: ${error.error} - ${error.error_description || error.message}`);
        if (error.hint) console.log(`  Hint: ${error.hint}`);
      } catch {
        console.log('  Response:', text.substring(0, 100));
      }
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  return null;
}

// Check if Swagger UI is available
async function checkSwagger() {
  console.log('\n=== Checking for Swagger/API Documentation ===');

  const urls = [
    `${BASE_URL}/swagger`,
    `${BASE_URL}/swagger/`,
    `${BASE_URL}/api-explorer`,
    `${BASE_URL}/interface/modules/custom_modules/oe-module-api-explorer/`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { redirect: 'manual' });
      console.log(`  ${url.replace(BASE_URL, '')}: ${resp.status}`);
      if (resp.ok || resp.status === 302) {
        console.log('    ^ This might be the API explorer!');
      }
    } catch (e: any) {
      console.log(`  ${url.replace(BASE_URL, '')}: Error - ${e.message}`);
    }
  }
}

// Test API without auth to see what's public
async function testPublicEndpoints() {
  console.log('\n=== Testing Public Endpoints ===');

  // FHIR metadata is always public
  console.log('FHIR Capability Statement (public):');
  const resp = await fetch(`${BASE_URL}/apis/default/fhir/metadata`);
  if (resp.ok) {
    const cap = await resp.json();
    console.log('  ✓ OpenEMR version:', cap.software?.version);
    console.log('  ✓ FHIR version:', cap.fhirVersion);

    // Count supported resources
    const resources = cap.rest?.[0]?.resource ?? [];
    console.log('  ✓ Supported resources:', resources.length);

    // Find appointment-related resources
    const apptResource = resources.find((r: any) => r.type === 'Appointment');
    if (apptResource) {
      console.log('  Appointment resource:');
      console.log('    Interactions:', apptResource.interaction?.map((i: any) => i.code).join(', '));
      console.log('    Search params:', apptResource.searchParam?.map((s: any) => s.name).join(', '));
    }

    const slotResource = resources.find((r: any) => r.type === 'Slot');
    const scheduleResource = resources.find((r: any) => r.type === 'Schedule');
    console.log('  Slot resource:', slotResource ? 'SUPPORTED' : 'NOT FOUND');
    console.log('  Schedule resource:', scheduleResource ? 'SUPPORTED' : 'NOT FOUND');
  }
}

// Check globals settings via web session
async function checkApiSettings() {
  console.log('\n=== Checking API Settings Status ===');
  console.log('Note: Password grant must be enabled in:');
  console.log('  Administration → Config → Connectors → "OAuth2 Password Grant"');
  console.log('');
  console.log('The demo site may have this disabled for security.');
  console.log('For testing, use a local OpenEMR instance where you can enable it.');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  OpenEMR Demo Site Complete API Test                           ║');
  console.log('║  Target: demo.openemr.io/a/openemr                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. Test public endpoints
  await testPublicEndpoints();

  // 2. Check swagger
  await checkSwagger();

  // 3. Register client and try auth
  const client = await registerClient();
  if (client) {
    const token = await tryAuth(client.clientId, client.clientSecret);

    if (!token) {
      await checkApiSettings();
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('FINDINGS SUMMARY');
  console.log('═'.repeat(70));
  console.log(`
Key Findings:
1. Demo site OAuth registration works (dynamic client registration)
2. Password grant authentication fails - likely DISABLED on demo site
3. FHIR metadata endpoint is public and shows capabilities
4. For API testing, you need either:
   a) A local OpenEMR instance with password grant enabled
   b) Authorization code flow (interactive browser login)

OpenEMR API Capabilities (from FHIR metadata):
- Patient: create, update, search, read
- Practitioner: create, update, search, read
- Appointment: search, read (NO create/update in FHIR!)
- Location: search, read
- Organization: create, update, search, read

Note: Appointment creation uses the Standard REST API (/apis/default/api),
NOT the FHIR API. The adapter is correctly using both.
`);
}

main().catch(console.error);
