#!/usr/bin/env tsx
/**
 * Enable a registered API client on OpenEMR Demo
 *
 * Path: Administration > System > API Clients > Edit > Enable
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
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Enable API Client on OpenEMR Demo                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const jar = createCookieJar();

  console.log('1. Logging in as admin...');
  if (!(await login(jar))) {
    console.log('   ✗ Login failed');
    return;
  }
  console.log('   ✓ Logged in\n');

  // Try different possible URLs for the API Clients page
  const possibleUrls = [
    '/interface/modules/zend_modules/public/SMART',
    '/interface/modules/zend_modules/module/SMART/src/SMART/Controller/SMARTController.php',
    '/interface/super/manage_site_files.php',
    '/interface/modules/custom_modules/',
    '/interface/super/manage_oemr_modules.php',
  ];

  console.log('2. Searching for API Clients page...');

  // The actual path based on documentation is through the zend modules
  // Let's try the SMART module controller
  const smartUrls = [
    `${BASE_URL}/interface/smart/admin-clients.php`,
    `${BASE_URL}/interface/modules/zend_modules/public/SMART/AdminApp`,
    `${BASE_URL}/interface/modules/zend_modules/public/SMART/admin-app`,
  ];

  for (const url of smartUrls) {
    try {
      const resp = await fetch(url, {
        headers: { 'Cookie': jar.get() },
        redirect: 'manual',
      });
      console.log(`   ${url.replace(BASE_URL, '')}: ${resp.status}`);

      if (resp.ok || resp.status === 302) {
        const html = await resp.text();
        if (html.includes('client_id') || html.includes('Elise') || html.includes('API Client')) {
          console.log('   ^ Found API clients content!');

          // Save for inspection
          const fs = await import('fs');
          fs.writeFileSync('/tmp/openemr-api-clients.html', html);
          console.log('   Saved to /tmp/openemr-api-clients.html');

          // Look for our client
          const eliseMatch = html.match(/Elise[^<]*/gi);
          if (eliseMatch) {
            console.log('\n   Found Elise clients:');
            eliseMatch.forEach(m => console.log(`     - ${m}`));
          }

          // Look for client IDs
          const clientIds = html.match(/[a-zA-Z0-9_-]{20,}/g);
          if (clientIds) {
            console.log('\n   Found client IDs:');
            [...new Set(clientIds)].slice(0, 5).forEach(id => {
              console.log(`     - ${id.substring(0, 40)}...`);
            });
          }
        }
      }
    } catch (e: any) {
      console.log(`   ${url.replace(BASE_URL, '')}: Error`);
    }
  }

  // Try to find it through the main menu structure
  console.log('\n3. Examining menu structure...');

  const menuResp = await fetch(`${BASE_URL}/interface/main/tabs/main.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (menuResp.ok) {
    const menuHtml = await menuResp.text();

    // Look for Administration menu items
    const adminMenuMatch = menuHtml.match(/Admin[^<]*System[^<]*API/gi);
    if (adminMenuMatch) {
      console.log('   Found Admin > System > API in menu');
    }

    // Search for any URL with 'smart' or 'api' or 'client'
    const urlMatches = menuHtml.match(/(?:url|href|src)=["']([^"']*(?:smart|api|client)[^"']*)["']/gi);
    if (urlMatches) {
      console.log('\n   URLs containing smart/api/client:');
      const unique = [...new Set(urlMatches)];
      unique.slice(0, 10).forEach(u => {
        const path = u.match(/["']([^"']+)["']/)?.[1];
        if (path) console.log(`     ${path}`);
      });
    }
  }

  // Final instructions
  console.log('\n' + '═'.repeat(67));
  console.log('HOW TO ENABLE YOUR CLIENT IN THE BROWSER');
  console.log('═'.repeat(67));
  console.log(`
1. Open: ${BASE_URL}/interface/login/login.php
2. Login: admin / pass
3. Navigate: Administration menu (top) → System → API Clients
4. Find your client: "Elise-Test-..." or "Elise Scheduling Test"
5. Click "Edit" on your client row
6. Click "Enable Client" button (upper right)
7. Save

If you can't find "API Clients" in the menu:
- It may be under Administration → Config → Connectors
- Or the demo site may not expose client management

After enabling, test with:
  pnpm tsx scripts/test-demo-auth.ts
`);

  // Also provide direct URL to try
  console.log('Direct URL to try in browser:');
  console.log(`  ${BASE_URL}/interface/smart/register-app.php`);
  console.log('  (This shows registered apps at the bottom of the page)\n');
}

main().catch(console.error);
