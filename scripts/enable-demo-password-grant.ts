#!/usr/bin/env tsx
/**
 * Enable OAuth2 Password Grant on OpenEMR Demo via Web UI
 *
 * This script logs in as admin and attempts to enable the password grant setting.
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
  console.log('1. Getting login page...');
  const loginPage = await fetch(`${BASE_URL}/interface/login/login.php?site=default`);
  jar.update(loginPage.headers);

  console.log('2. Submitting login as admin...');
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
    console.log('   Login redirect received, following...');
    const mainResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?site=default`, {
      headers: { 'Cookie': jar.get() },
    });
    jar.update(mainResp.headers);
    return mainResp.ok;
  }

  return false;
}

async function getGlobalsPage(jar: CookieJar): Promise<string | null> {
  console.log('3. Fetching globals/config page...');

  // The globals page URL
  const globalsUrl = `${BASE_URL}/interface/super/edit_globals.php`;

  const resp = await fetch(globalsUrl, {
    headers: { 'Cookie': jar.get() },
  });
  jar.update(resp.headers);

  if (!resp.ok) {
    console.log(`   Failed: ${resp.status}`);
    return null;
  }

  const html = await resp.text();

  // Check if we're actually on the globals page
  if (html.includes('Global Settings') || html.includes('edit_globals')) {
    console.log('   Got globals page!');
    return html;
  }

  if (html.includes('login')) {
    console.log('   Session expired - got login page');
    return null;
  }

  return html;
}

async function findAndEnablePasswordGrant(jar: CookieJar, html: string): Promise<void> {
  console.log('4. Looking for OAuth2 Password Grant setting...');

  // Look for the setting in the HTML
  // The setting name is typically "rest_api" related or "oauth"
  const patterns = [
    /oauth.*password/i,
    /rest_api/i,
    /password.*grant/i,
    /gl_rest_portal_api/i,
    /rest_portal_api/i,
  ];

  for (const pattern of patterns) {
    const matches = html.match(new RegExp(`.{0,100}${pattern.source}.{0,100}`, 'gi'));
    if (matches) {
      console.log(`   Found matches for ${pattern}:`);
      matches.slice(0, 3).forEach(m => {
        // Clean up and show
        const clean = m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`     "${clean.substring(0, 80)}..."`);
      });
    }
  }

  // Look for the specific checkbox/input
  const checkboxMatch = html.match(/name="([^"]*oauth[^"]*password[^"]*)"/i)
    || html.match(/name="([^"]*rest[^"]*api[^"]*)"/i);

  if (checkboxMatch) {
    console.log(`   Found form field: ${checkboxMatch[1]}`);
  }

  // Try to find the section in the tabs
  const tabMatch = html.match(/<a[^>]*href="#([^"]*)"[^>]*>.*?Connectors.*?<\/a>/i);
  if (tabMatch) {
    console.log(`   Found Connectors tab: #${tabMatch[1]}`);
  }

  // Look for gl_rest_api or similar
  const restApiMatch = html.match(/gl_rest_api|rest_api_auth|oauth2_password/gi);
  if (restApiMatch) {
    console.log('   REST API settings found:', [...new Set(restApiMatch)].join(', '));
  }

  // Extract form action and CSRF token
  const formMatch = html.match(/<form[^>]*action="([^"]*edit_globals[^"]*)"[^>]*>/i);
  const csrfMatch = html.match(/name="csrf_token[^"]*"\s+value="([^"]+)"/i)
    || html.match(/csrf_token[^"]*=([^&"]+)/i);

  if (formMatch) {
    console.log(`   Form action: ${formMatch[1]}`);
  }
  if (csrfMatch) {
    console.log(`   CSRF token found: ${csrfMatch[1].substring(0, 20)}...`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Enable OAuth2 Password Grant on OpenEMR Demo                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const jar = createCookieJar();

  // Login
  const loggedIn = await login(jar);
  if (!loggedIn) {
    console.log('\n❌ Login failed');
    return;
  }
  console.log('   ✓ Logged in successfully\n');

  // Get globals page
  const html = await getGlobalsPage(jar);
  if (!html) {
    console.log('\n❌ Could not access globals page');
    return;
  }

  // Analyze the page
  await findAndEnablePasswordGrant(jar, html);

  // Save HTML for manual inspection
  const fs = await import('fs');
  const path = '/tmp/openemr-globals.html';
  fs.writeFileSync(path, html);
  console.log(`\n   Full HTML saved to: ${path}`);

  console.log('\n' + '═'.repeat(66));
  console.log('MANUAL STEPS');
  console.log('═'.repeat(66));
  console.log(`
To enable Password Grant manually:

1. Open in browser:
   ${BASE_URL}/interface/login/login.php

2. Login as:
   Username: admin
   Password: pass

3. Navigate to:
   Administration → Config → Connectors

4. Find and enable:
   "OAuth2 Password Grant (Not considered secure)"

5. Click "Save" at the bottom

6. Then test with:
   pnpm tsx scripts/test-demo-auth.ts
`);
}

main().catch(console.error);
