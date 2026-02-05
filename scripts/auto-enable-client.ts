#!/usr/bin/env tsx
/**
 * Register and auto-enable client on OpenEMR demo
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

interface CookieJar {
  cookies: Map<string, string>;
  get: () => string;
  update: (headers: Headers) => void;
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();
  return {
    cookies,
    get: () => Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
    update: (headers: Headers) => {
      const setCookies = headers.getSetCookie?.() || [];
      for (const c of setCookies) {
        const [pair] = c.split(';');
        const [key, value] = pair.split('=');
        if (key && value) cookies.set(key.trim(), value.trim());
      }
    },
  };
}

async function loginToAdmin(jar: CookieJar): Promise<boolean> {
  const loginPage = await fetch(`${BASE_URL}/interface/login/login.php?site=default`);
  jar.update(loginPage.headers);

  const loginResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?auth=login&site=default`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': jar.get(),
    },
    body: 'new_login_session_management=1&authProvider=Default&authUser=admin&clearPass=pass',
    redirect: 'manual',
  });
  jar.update(loginResp.headers);

  if (loginResp.status === 302) {
    const mainResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?site=default`, {
      headers: { 'Cookie': jar.get() },
    });
    jar.update(mainResp.headers);
    return mainResp.ok;
  }
  return false;
}

async function main() {
  console.log('=== Auto-Enable OpenEMR Demo Client ===\n');

  // Step 1: Register client
  console.log('1. Registering client with full scopes...');
  const payload = {
    application_type: 'private',
    redirect_uris: ['http://localhost:3001/oauth/callback'],
    client_name: `Elise-Auto-${Date.now()}`,
    token_endpoint_auth_method: 'client_secret_post',
    scope: [
      'openid', 'offline_access', 'api:oemr', 'api:fhir',
      'user/patient.read', 'user/patient.write',
      'user/appointment.read', 'user/appointment.write',
      'user/practitioner.read', 'user/facility.read', 'user/list.read',
    ].join(' '),
  };

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

  // Step 2: Try to enable via registration_access_token
  console.log('\n2. Attempting to enable via registration API...');

  if (client.registration_client_uri && client.registration_access_token) {
    // Try to GET the client first
    const getResp = await fetch(client.registration_client_uri, {
      headers: {
        'Authorization': `Bearer ${client.registration_access_token}`,
        'Accept': 'application/json',
      },
    });

    console.log('   GET client:', getResp.status);
    if (getResp.ok) {
      const clientData = await getResp.json();
      console.log('   Current is_enabled:', clientData.is_enabled);

      // Try to PUT with is_enabled = true
      const updateResp = await fetch(client.registration_client_uri, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${client.registration_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...clientData, is_enabled: true }),
      });

      console.log('   PUT to enable:', updateResp.status);
      if (updateResp.ok) {
        console.log('   ✓ Enabled via API!');
      } else {
        console.log('   Response:', await updateResp.text());
      }
    }
  }

  // Step 3: Try to enable via admin web session
  console.log('\n3. Attempting to enable via admin web session...');

  const jar = createCookieJar();
  const loggedIn = await loginToAdmin(jar);

  if (!loggedIn) {
    console.log('   ✗ Admin login failed');
  } else {
    console.log('   ✓ Logged in as admin');

    // Find the client management endpoint
    // OpenEMR uses a REST endpoint for client management
    const clientsResp = await fetch(
      `${BASE_URL}/interface/modules/zend_modules/public/SMART/client-app/${client.client_id}/enable`,
      {
        method: 'POST',
        headers: { 'Cookie': jar.get() },
      }
    );
    console.log('   Enable endpoint:', clientsResp.status);

    // Try alternative endpoint
    const altResp = await fetch(
      `${BASE_URL}/oauth2/default/client/${client.client_id}/enable`,
      {
        method: 'POST',
        headers: {
          'Cookie': jar.get(),
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('   Alt enable endpoint:', altResp.status);

    // Try to find and submit the enable form
    // First get the client edit page
    const editPageResp = await fetch(
      `${BASE_URL}/interface/smart/register-app.php?client_id=${client.client_id}&edit=1`,
      { headers: { 'Cookie': jar.get() } }
    );
    console.log('   Edit page:', editPageResp.status);

    if (editPageResp.ok) {
      const editHtml = await editPageResp.text();

      // Look for CSRF token and form action
      const csrfMatch = editHtml.match(/name="csrf_token[^"]*"\s*value="([^"]+)"/i);
      const enableMatch = editHtml.match(/enable.*client/i);

      if (csrfMatch) {
        console.log('   Found CSRF token');
      }
      if (enableMatch) {
        console.log('   Found enable option in page');
      }

      // Save for inspection
      fs.writeFileSync('/tmp/client-edit-page.html', editHtml);
      console.log('   Saved edit page to /tmp/client-edit-page.html');
    }
  }

  // Step 4: Test authentication
  console.log('\n4. Testing authentication...');

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
    console.log('   ✓ Authentication SUCCESS!');

    // Save to env
    updateEnvFile(profilePath, {
      'OPENEMR_URL': BASE_URL,
      'OPENEMR_CLIENT_ID': client.client_id,
      'OPENEMR_CLIENT_SECRET': client.client_secret,
    });
    console.log('   ✓ Saved to emr.env');

    // Quick API test
    const patientResp = await fetch(`${BASE_URL}/apis/default/api/patient?_count=2`, {
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    });

    if (patientResp.ok) {
      const data = await patientResp.json();
      console.log(`   ✓ API working - found ${data.data?.length ?? 0} patients`);
    }

    console.log('\n=== READY ===');
  } else {
    const errorText = await tokenResp.text();
    console.log('   ✗ Auth failed:', errorText);

    // Save credentials anyway for manual enabling
    updateEnvFile(profilePath, {
      'OPENEMR_URL': BASE_URL,
      'OPENEMR_CLIENT_ID': client.client_id,
      'OPENEMR_CLIENT_SECRET': client.client_secret,
    });
    console.log('   Credentials saved to emr.env anyway');

    console.log('\n=== MANUAL STEP REQUIRED ===');
    console.log(`Enable client "${client.client_name}" in admin UI`);
  }
}

main().catch(console.error);
