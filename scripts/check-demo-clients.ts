#!/usr/bin/env tsx
/**
 * Check registered API clients on OpenEMR Demo
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

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

async function login(jar: CookieJar): Promise<boolean> {
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
  console.log('=== Checking API Clients on Demo ===\n');

  const jar = createCookieJar();

  console.log('Logging in...');
  const loggedIn = await login(jar);
  if (!loggedIn) {
    console.log('Login failed');
    return;
  }
  console.log('Logged in!\n');

  // Try different paths to find the API clients page
  const paths = [
    '/interface/modules/custom_modules/oe-module-ehi-exporter/index.php',
    '/interface/modules/zend_modules/public/Installer',
    '/interface/smart/register-app.php',
    '/admin/smart/index.php',
    '/interface/modules/zend_modules/module/Carecoordination/src/Carecoordination/Controller/EnclosingDocument.php',
  ];

  // The API clients are managed via the SMART app registration
  console.log('Checking SMART app registration page...');
  const smartResp = await fetch(`${BASE_URL}/interface/smart/register-app.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (smartResp.ok) {
    const html = await smartResp.text();

    // Check if we can see registered apps
    if (html.includes('Registered') || html.includes('client_id')) {
      console.log('Found client management page!\n');

      // Look for our client
      const clientMatches = html.match(/Elise[^<]*/gi);
      if (clientMatches) {
        console.log('Found Elise clients:', clientMatches);
      }

      // Look for enabled/disabled status
      const statusMatches = html.match(/(enabled|disabled|is_enabled)[^<]*/gi);
      if (statusMatches) {
        console.log('Status fields found:', statusMatches.slice(0, 5));
      }

      // Look for any enable/approve buttons or checkboxes
      const enableMatches = html.match(/<input[^>]*(enable|approve|active)[^>]*>/gi);
      if (enableMatches) {
        console.log('Enable controls:', enableMatches.slice(0, 3));
      }

      // Save for inspection
      const fs = await import('fs');
      fs.writeFileSync('/tmp/openemr-smart-apps.html', html);
      console.log('\nSaved to /tmp/openemr-smart-apps.html');

      // Look for the clients table
      const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
      if (tableMatch) {
        // Count rows
        const rows = tableMatch[0].match(/<tr/gi);
        console.log(`Found table with ${rows?.length ?? 0} rows`);
      }
    } else if (html.includes('login')) {
      console.log('Got login page - session issue');
    } else {
      console.log('Page loaded but no client info found');
      console.log('Page preview:', html.substring(0, 500));
    }
  } else {
    console.log(`SMART page status: ${smartResp.status}`);
  }

  // Also try the admin API
  console.log('\n--- Trying Admin Menu ---');
  const adminResp = await fetch(`${BASE_URL}/interface/main/tabs/main.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (adminResp.ok) {
    const html = await adminResp.text();

    // Look for API/OAuth menu items
    const menuMatches = html.match(/API|OAuth|Client|SMART/gi);
    if (menuMatches) {
      console.log('Menu items found:', [...new Set(menuMatches)].join(', '));
    }

    // Look for the specific menu path
    const apiMenuMatch = html.match(/Admin[^<]*System[^<]*API/i);
    if (apiMenuMatch) {
      console.log('Found Admin > System > API path');
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('NEXT STEPS');
  console.log('═'.repeat(50));
  console.log(`
The "invalid_client" error means the client exists but isn't authorized.

In the browser, go to:
  ${BASE_URL}/interface/smart/register-app.php

Look for your registered client and:
1. Check if it's "Enabled" or "Disabled"
2. If there's an "Enable" button, click it
3. Check if it needs "Authorization" approval

Alternative: Check Admin > System > API Clients
`);
}

main().catch(console.error);
