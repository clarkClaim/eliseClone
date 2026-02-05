#!/usr/bin/env tsx
/**
 * Probe OpenEMR Demo Site
 * Discovers API capabilities, available endpoints, and OAuth scopes.
 *
 * Usage: pnpm tsx scripts/probe-openemr-demo.ts
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

// Known OpenEMR API endpoints to probe
const STANDARD_API_ENDPOINTS = [
  '/patient',
  '/appointment',
  '/facility',
  '/practitioner',
  '/user',
  '/list/apptstat',
  '/list/titles',
  '/list/marital',
  '/insurance',
  '/medical_problem',
  '/allergy',
  '/medication',
  '/document',
];

const FHIR_ENDPOINTS = [
  '/Patient',
  '/Practitioner',
  '/Organization',
  '/Location',
  '/Appointment',
  '/Slot',
  '/Schedule',
  '/Encounter',
  '/Condition',
  '/Observation',
  '/AllergyIntolerance',
  '/MedicationRequest',
  '/DocumentReference',
  '/metadata', // Capability statement
];

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

// Step 1: Try to discover OAuth configuration
async function discoverOAuth() {
  console.log('=== OAuth Discovery ===\n');

  // Try .well-known endpoints
  const wellKnownEndpoints = [
    `${BASE_URL}/.well-known/openid-configuration`,
    `${BASE_URL}/.well-known/smart-configuration`,
    `${BASE_URL}/oauth2/default/.well-known/openid-configuration`,
  ];

  for (const url of wellKnownEndpoints) {
    try {
      console.log(`Trying: ${url}`);
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        redirect: 'follow'
      });
      if (resp.ok) {
        const data = await resp.json();
        console.log('  ✓ Found configuration:');
        console.log('    Token endpoint:', data.token_endpoint);
        console.log('    Auth endpoint:', data.authorization_endpoint);
        console.log('    Scopes supported:', data.scopes_supported?.join(', ') ?? 'not listed');
        return data;
      } else {
        console.log(`  ✗ Status ${resp.status}`);
      }
    } catch (e: any) {
      console.log(`  ✗ Error: ${e.message}`);
    }
  }

  return null;
}

// Step 2: Attempt to authenticate
async function authenticate(): Promise<string | null> {
  console.log('\n=== Authentication ===\n');

  // The demo site may allow unauthenticated API access or use public credentials
  // Let's try the standard demo credentials
  const credentials = [
    { user: 'admin', pass: 'pass' },
    { user: 'physician', pass: 'physician' },
    { user: 'demo', pass: 'demo' },
  ];

  // First, try to get a token without OAuth (some demos allow basic auth)
  for (const cred of credentials) {
    console.log(`Trying basic auth: ${cred.user}:***`);

    try {
      const resp = await fetch(`${BASE_URL}/apis/default/api/patient?_count=1`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64'),
          'Accept': 'application/json',
        },
      });

      if (resp.ok) {
        console.log('  ✓ Basic auth works!');
        return 'basic:' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64');
      }
      console.log(`  ✗ Status ${resp.status}: ${await resp.text().then(t => t.substring(0, 100))}`);
    } catch (e: any) {
      console.log(`  ✗ Error: ${e.message}`);
    }
  }

  // Try OAuth password grant
  console.log('\nTrying OAuth password grant...');
  const tokenUrl = `${BASE_URL}/oauth2/default/token`;

  // Try without client credentials first (public client)
  for (const cred of credentials) {
    const params = new URLSearchParams({
      grant_type: 'password',
      username: cred.user,
      password: cred.pass,
      scope: 'openid api:oemr api:fhir',
    });

    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (resp.ok) {
        const data = await resp.json() as TokenResponse;
        console.log(`  ✓ Got token for ${cred.user}!`);
        console.log(`    Scope: ${data.scope ?? 'not specified'}`);
        console.log(`    Expires in: ${data.expires_in}s`);
        return data.access_token;
      }
      const errorText = await resp.text();
      console.log(`  User ${cred.user}: Status ${resp.status} - ${errorText.substring(0, 100)}`);
    } catch (e: any) {
      console.log(`  Error for ${cred.user}: ${e.message}`);
    }
  }

  console.log('\n⚠ Could not authenticate - will try unauthenticated access');
  return null;
}

// Step 3: Probe API endpoints
async function probeEndpoints(token: string | null) {
  console.log('\n=== API Endpoint Discovery ===\n');

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (token) {
    if (token.startsWith('basic:')) {
      headers['Authorization'] = 'Basic ' + token.substring(6);
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Standard API
  console.log('Standard API (/apis/default/api):');
  console.log('-'.repeat(50));

  const standardResults: Record<string, any> = {};
  for (const endpoint of STANDARD_API_ENDPOINTS) {
    const url = `${BASE_URL}/apis/default/api${endpoint}?_count=1`;
    try {
      const resp = await fetch(url, { headers });
      const status = resp.status;
      let info = '';

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          info = `${data.length} items`;
        } else if (data.data && Array.isArray(data.data)) {
          info = `${data.data.length} items`;
        } else if (data.total !== undefined) {
          info = `total: ${data.total}`;
        } else {
          info = 'OK';
        }
        standardResults[endpoint] = { status: 'available', data };
      } else {
        const text = await resp.text();
        info = text.substring(0, 60).replace(/\n/g, ' ');
        standardResults[endpoint] = { status: 'error', statusCode: status, error: info };
      }

      const symbol = resp.ok ? '✓' : '✗';
      console.log(`  ${symbol} ${endpoint.padEnd(25)} ${status} ${info}`);
    } catch (e: any) {
      console.log(`  ✗ ${endpoint.padEnd(25)} ERROR: ${e.message}`);
      standardResults[endpoint] = { status: 'error', error: e.message };
    }
  }

  // FHIR API
  console.log('\nFHIR API (/apis/default/fhir):');
  console.log('-'.repeat(50));

  const fhirResults: Record<string, any> = {};
  for (const endpoint of FHIR_ENDPOINTS) {
    const url = `${BASE_URL}/apis/default/fhir${endpoint}?_count=1`;
    try {
      const resp = await fetch(url, { headers });
      const status = resp.status;
      let info = '';

      if (resp.ok) {
        const data = await resp.json();
        if (data.resourceType === 'Bundle') {
          info = `Bundle (total: ${data.total ?? data.entry?.length ?? 0})`;
        } else if (data.resourceType === 'CapabilityStatement') {
          info = `FHIR ${data.fhirVersion}`;
        } else {
          info = data.resourceType ?? 'OK';
        }
        fhirResults[endpoint] = { status: 'available', data };
      } else {
        const text = await resp.text();
        info = text.substring(0, 60).replace(/\n/g, ' ');
        fhirResults[endpoint] = { status: 'error', statusCode: status, error: info };
      }

      const symbol = resp.ok ? '✓' : '✗';
      console.log(`  ${symbol} ${endpoint.padEnd(25)} ${status} ${info}`);
    } catch (e: any) {
      console.log(`  ✗ ${endpoint.padEnd(25)} ERROR: ${e.message}`);
      fhirResults[endpoint] = { status: 'error', error: e.message };
    }
  }

  return { standard: standardResults, fhir: fhirResults };
}

// Step 4: Parse FHIR capability statement
async function getFhirCapabilities(token: string | null) {
  console.log('\n=== FHIR Capability Statement ===\n');

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token && !token.startsWith('basic:')) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (token?.startsWith('basic:')) {
    headers['Authorization'] = 'Basic ' + token.substring(6);
  }

  try {
    const resp = await fetch(`${BASE_URL}/apis/default/fhir/metadata`, { headers });
    if (!resp.ok) {
      console.log(`Failed to get capability statement: ${resp.status}`);
      return;
    }

    const cap = await resp.json();
    console.log(`FHIR Version: ${cap.fhirVersion}`);
    console.log(`Software: ${cap.software?.name ?? 'Unknown'} ${cap.software?.version ?? ''}`);
    console.log(`Status: ${cap.status}`);

    if (cap.rest) {
      for (const rest of cap.rest) {
        console.log(`\nMode: ${rest.mode}`);
        console.log('Supported Resources:');

        if (rest.resource) {
          for (const resource of rest.resource) {
            const interactions = resource.interaction?.map((i: any) => i.code).join(', ') ?? 'none';
            const searchParams = resource.searchParam?.length ?? 0;
            console.log(`  ${resource.type.padEnd(25)} interactions: [${interactions}]  searchParams: ${searchParams}`);
          }
        }
      }
    }

    // Check for OAuth/SMART info
    if (cap.rest?.[0]?.security) {
      console.log('\nSecurity:');
      const security = cap.rest[0].security;
      if (security.service) {
        console.log('  Services:', security.service.map((s: any) => s.coding?.[0]?.code).join(', '));
      }
      if (security.extension) {
        for (const ext of security.extension) {
          if (ext.url?.includes('oauth-uris')) {
            console.log('  OAuth URIs:');
            for (const inner of ext.extension ?? []) {
              console.log(`    ${inner.url}: ${inner.valueUri}`);
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
}

// Step 5: Test write operations (safely)
async function testWriteCapabilities(token: string | null) {
  console.log('\n=== Write Capability Test ===\n');

  if (!token) {
    console.log('⚠ No token - skipping write tests');
    return;
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (token.startsWith('basic:')) {
    headers['Authorization'] = 'Basic ' + token.substring(6);
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Test patient creation (with obviously fake data that we'll delete)
  console.log('Testing patient creation...');
  const testPatient = {
    fname: 'TestProbe',
    lname: 'DeleteMe',
    DOB: '1990-01-01',
    sex: 'Male',
  };

  try {
    const resp = await fetch(`${BASE_URL}/apis/default/api/patient`, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPatient),
    });

    console.log(`  Status: ${resp.status}`);
    const result = await resp.text();
    console.log(`  Response: ${result.substring(0, 200)}`);

    if (resp.ok || resp.status === 201) {
      console.log('  ✓ Patient creation is ALLOWED');
      // Try to parse and get the UUID for cleanup
      try {
        const data = JSON.parse(result);
        if (data.uuid) {
          console.log(`  Created patient UUID: ${data.uuid}`);
          // Note: we're leaving it - demo site gets reset periodically
        }
      } catch {}
    } else if (resp.status === 401 || resp.status === 403) {
      console.log('  ✗ Patient creation is FORBIDDEN (insufficient permissions)');
    } else {
      console.log('  ? Patient creation returned unexpected status');
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
  }

  // Test appointment creation
  console.log('\nTesting appointment creation (dry run - no actual creation)...');
  // Just check if the endpoint accepts POST
  try {
    const resp = await fetch(`${BASE_URL}/apis/default/api/patient/1/appointment`, {
      method: 'OPTIONS',
      headers,
    });
    console.log(`  OPTIONS status: ${resp.status}`);
    console.log(`  Allow header: ${resp.headers.get('allow') ?? 'not provided'}`);
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
  }
}

// Main
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   OpenEMR Demo Site API Probe                      ║');
  console.log('║   Target: demo.openemr.io                          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Step 1: OAuth discovery
  const oauthConfig = await discoverOAuth();

  // Step 2: Authenticate
  const token = await authenticate();

  // Step 3: Probe endpoints
  await probeEndpoints(token);

  // Step 4: Get FHIR capabilities
  await getFhirCapabilities(token);

  // Step 5: Test writes
  await testWriteCapabilities(token);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Authentication: ${token ? 'SUCCESS' : 'FAILED'}`);
  console.log(`OAuth Config: ${oauthConfig ? 'DISCOVERED' : 'NOT FOUND'}`);
  console.log('\nFor your OpenEMR client to work, you need:');
  console.log('  1. A registered OAuth client_id and client_secret');
  console.log('  2. Proper scopes: api:oemr, api:fhir, user/patient.read, etc.');
  console.log('  3. The correct token endpoint URL');
}

main().catch(console.error);
