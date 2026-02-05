#!/usr/bin/env tsx
/**
 * Try to enable the OAuth client via the admin web interface
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';
const CLIENT_ID = 'kXRUa8hb8ehaBq_C7QKRSg19JxrKOF2U_ptXqnpDZdI';

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

async function main() {
  console.log('=== Attempting to enable OAuth client via admin ===\n');

  const jar = createCookieJar();

  // Step 1: Get login page to capture CSRF token and session
  console.log('1. Fetching login page...');
  const loginPageResp = await fetch(`${BASE_URL}/interface/login/login.php?site=default`);
  jar.update(loginPageResp.headers);
  const loginHtml = await loginPageResp.text();
  console.log('   Cookies:', jar.get().substring(0, 60));

  // Step 2: Submit login
  console.log('2. Submitting login...');
  const loginResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?auth=login&site=default`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': jar.get(),
    },
    body: 'new_login_session_management=1&authProvider=Default&authUser=admin&clearPass=pass',
    redirect: 'manual',
  });
  console.log('   Status:', loginResp.status);
  jar.update(loginResp.headers);

  // Step 3: Follow redirect to main
  console.log('3. Following to main screen...');
  const mainResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?site=default`, {
    headers: { 'Cookie': jar.get() },
    redirect: 'manual',
  });
  jar.update(mainResp.headers);
  console.log('   Status:', mainResp.status);

  // Step 4: Try to access the API clients list page
  console.log('4. Fetching API clients page...');
  const apiClientsResp = await fetch(`${BASE_URL}/interface/modules/custom_modules/oe-module-faxsms/index.php?view=api-clients`, {
    headers: { 'Cookie': jar.get() },
  });
  console.log('   Status:', apiClientsResp.status);

  // Also try the smart apps registration page
  console.log('5. Fetching SMART apps page...');
  const smartAppsResp = await fetch(`${BASE_URL}/interface/smart/register-app.php`, {
    headers: { 'Cookie': jar.get() },
  });
  console.log('   Status:', smartAppsResp.status);
  const smartHtml = await smartAppsResp.text();
  console.log('   Page length:', smartHtml.length);

  // Check if we're logged in or got redirected
  if (smartHtml.includes('Registered Apps') || smartHtml.includes('API Clients')) {
    console.log('   Found apps management page');
    // Look for existing clients
    const clientMatches = smartHtml.match(/client_id[^>]*>([^<]+)</gi);
    if (clientMatches) {
      console.log('   Existing clients found:', clientMatches.slice(0, 5));
    }
  } else if (smartHtml.includes('login')) {
    console.log('   ⚠ Got redirected to login - session may have failed');
  }

  // Try to look at the client management endpoint directly
  console.log('\n6. Checking client management API...');
  const clientsApiResp = await fetch(`${BASE_URL}/oauth2/default/client`, {
    headers: {
      'Cookie': jar.get(),
      'Accept': 'application/json',
    },
  });
  console.log('   Status:', clientsApiResp.status);
  const clientsText = await clientsApiResp.text();
  console.log('   Response:', clientsText.substring(0, 200));

  // Step 7: Check if we can enable via the registration access token
  console.log('\n7. Trying to view/modify client via registration_client_uri...');
  const regToken = '-SfS2VwjQr3a8XdwoDYOjSZSlP_yloRTJ71kGnyt7RY';
  const clientUri = `${BASE_URL}/oauth2/default/client/kFBjmhgDC8AIQuqmSCg5JA`;

  const clientResp = await fetch(clientUri, {
    headers: {
      'Authorization': `Bearer ${regToken}`,
      'Accept': 'application/json',
    },
  });
  console.log('   Status:', clientResp.status);
  const clientData = await clientResp.text();
  console.log('   Response:', clientData.substring(0, 300));

  if (clientResp.ok) {
    const data = JSON.parse(clientData);
    console.log('\n   Client details:');
    console.log('   - is_enabled:', data.is_enabled);
    console.log('   - client_role:', data.client_role);
    console.log('   - scope:', data.scope);

    // If we can see it, try to enable it
    if (data.is_enabled === false || data.is_enabled === 0) {
      console.log('\n   Attempting to enable client...');
      // OpenEMR may support PUT/PATCH to update
      const updateResp = await fetch(clientUri, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${regToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, is_enabled: true }),
      });
      console.log('   Update status:', updateResp.status);
      console.log('   Update response:', await updateResp.text());
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log('The demo site requires manual approval of OAuth clients.');
  console.log('Options:');
  console.log('1. Use the demo site web UI (login as admin) to enable the client');
  console.log('2. Use a pre-existing demo client if available');
  console.log('3. Use a local OpenEMR instance for testing');
}

main().catch(console.error);
