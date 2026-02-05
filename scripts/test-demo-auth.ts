#!/usr/bin/env tsx
/**
 * Test different auth methods on OpenEMR Demo
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

// Client we just registered
const CLIENT_ID = 'kXRUa8hb8ehaBq_C7QKRSg19JxrKOF2U_ptXqnpDZdI';
const CLIENT_SECRET = 'XGLCz2ZPqCqWcpD4s09tTxMxTCZjmImxSYc_GXHtEgWybhfZvROnIEMdULMC6wNf5CbVloTNDrSnGmJrRjN6aw';

async function main() {
  console.log('=== Testing OpenEMR Demo Auth Methods ===\n');

  const tokenUrl = `${BASE_URL}/oauth2/default/token`;

  // Method 1: client_secret_post (credentials in body)
  console.log('Method 1: client_secret_post');
  {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: 'admin',
      password: 'pass',
      user_role: 'users',
      scope: 'openid offline_access api:oemr api:fhir',
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    console.log('  Status:', resp.status);
    console.log('  Response:', await resp.text());
  }

  // Method 2: client_secret_basic (credentials in Authorization header)
  console.log('\nMethod 2: client_secret_basic');
  {
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'password',
      username: 'admin',
      password: 'pass',
      user_role: 'users',
      scope: 'openid offline_access api:oemr api:fhir',
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: params.toString(),
    });
    console.log('  Status:', resp.status);
    console.log('  Response:', await resp.text());
  }

  // Method 3: Try without user_role
  console.log('\nMethod 3: Without user_role');
  {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: 'admin',
      password: 'pass',
      scope: 'openid offline_access api:oemr',
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    console.log('  Status:', resp.status);
    console.log('  Response:', await resp.text());
  }

  // Method 4: Try client_credentials grant (backend service)
  console.log('\nMethod 4: client_credentials grant');
  {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'openid api:oemr api:fhir',
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    console.log('  Status:', resp.status);
    console.log('  Response:', await resp.text());
  }

  // Try fetching the OpenID discovery to see what grant types are supported
  console.log('\n=== Checking Supported Grant Types ===');
  {
    const resp = await fetch(`${BASE_URL}/oauth2/default/.well-known/openid-configuration`);
    const config = await resp.json();
    console.log('Grant types supported:', config.grant_types_supported);
    console.log('Token endpoint auth methods:', config.token_endpoint_auth_methods_supported);
    console.log('Response types:', config.response_types_supported);
  }

  // Check if there's an API client admin page we can look at
  console.log('\n=== Checking if client is enabled ===');
  // The demo client may need to be enabled via the admin UI
  // Let's try logging in via session and checking
  console.log('Note: The registered client may need to be enabled in OpenEMR admin.');
  console.log('Go to: Admin > System > API Clients');
  console.log('Or try the demo.openemr.io web UI to enable the client.');
}

main().catch(console.error);
