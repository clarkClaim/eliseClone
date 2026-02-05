#!/usr/bin/env tsx
/**
 * Enable client by finding and submitting the enable form
 */

import fs from 'fs';

const BASE_URL = 'https://demo.openemr.io/a/openemr';
const CLIENT_ID = 'am5BoPVkN0k2VfdeA7VgDAyZ47kOPAm8x-xBj4CPnBM'; // Most recent client

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
  const jar = createCookieJar();

  console.log('Logging in as admin...');
  if (!(await login(jar))) {
    console.log('Login failed');
    return;
  }
  console.log('Logged in!\n');

  // The user mentioned they see the client management at "Administration > System > API Clients"
  // This is likely a different URL. Let me search for it.

  // Try various possible admin URLs
  const adminPaths = [
    '/interface/super/edit_globals.php?frag=Connectors', // Connectors tab in globals
    '/interface/super/edit_globals.php#tab-Connectors',
    '/controllers/smart/admin.php',
    '/interface/usergroup/admin.php',
    '/portal/smart',
  ];

  // First, let's see what the main menu structure looks like
  console.log('Fetching main screen to find menu items...');
  const mainHtml = await (await fetch(`${BASE_URL}/interface/main/main_screen.php?site=default`, {
    headers: { 'Cookie': jar.get() },
  })).text();

  // Look for admin menu items
  const adminMatches = mainHtml.match(/admin[^"'<>]*client/gi) || [];
  console.log('Admin/client menu items:', adminMatches.slice(0, 5));

  // Look for any URL with smart or api
  const urlMatches = mainHtml.match(/["'][^"']*(?:smart|api-client|admin-client)[^"']*["']/gi) || [];
  console.log('Smart/API URLs found:', urlMatches.slice(0, 10));

  // Check the globals page for API client settings
  console.log('\nFetching globals page...');
  const globalsResp = await fetch(`${BASE_URL}/interface/super/edit_globals.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (globalsResp.ok) {
    const globalsHtml = await globalsResp.text();

    // Look for API client management links
    const clientLinks = globalsHtml.match(/href="[^"]*client[^"]*"/gi);
    console.log('Client links in globals:', clientLinks?.slice(0, 5));

    // Look for tabs
    const tabMatches = globalsHtml.match(/id="[^"]*tab[^"]*"/gi);
    console.log('Tabs:', tabMatches?.slice(0, 10));
  }

  // Try the smart/register-app with list parameter
  console.log('\nTrying to find client list...');
  const listResp = await fetch(`${BASE_URL}/interface/smart/register-app.php?action=list`, {
    headers: { 'Cookie': jar.get() },
  });
  console.log('List action:', listResp.status);

  // Check if there's a separate clients controller
  const controllerPaths = [
    '/interface/smart/clients.php',
    '/interface/smart/client-admin.php',
    '/interface/smart/client-list.php',
    '/interface/modules/zend_modules/public/Installer/smart-clients',
    '/oauth2/default/admin',
    '/interface/usergroup/usergroup_admin.php',
  ];

  for (const path of controllerPaths) {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Cookie': jar.get() },
      redirect: 'manual',
    });
    if (resp.status !== 404) {
      console.log(`${path}: ${resp.status}`);
      if (resp.ok) {
        const html = await resp.text();
        if (html.includes('client') || html.includes('OAuth') || html.includes('SMART')) {
          fs.writeFileSync('/tmp/potential-admin.html', html);
          console.log('  Saved to /tmp/potential-admin.html');
        }
      }
    }
  }

  console.log('\n---');
  console.log('Based on OpenEMR source code, the enable is done via ClientRepository.saveIsEnabled()');
  console.log('This is likely called from a Zend MVC controller in the SMART module.');
  console.log('');
  console.log('Since the demo site may not expose this directly, the easiest path is:');
  console.log('1. User enables manually via browser (which you already did for one client)');
  console.log('2. We use a local OpenEMR instance where we have full control');
}

main().catch(console.error);
