#!/usr/bin/env tsx
/**
 * Find the API client management page on OpenEMR Demo
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
  console.log('=== Finding API Client Management Page ===\n');

  const jar = createCookieJar();

  console.log('Logging in...');
  if (!(await login(jar))) {
    console.log('Login failed');
    return;
  }
  console.log('Logged in!\n');

  // Possible client management URLs
  const urls = [
    '/interface/modules/zend_modules/module/SMART/src/SMART/Controller/SMARTController.php',
    '/interface/smart/admin.php',
    '/admin/api-clients',
    '/interface/super/api_clients.php',
    '/apis/api/admin/clients',
    '/oauth2/default/admin/clients',
  ];

  // Also search the main interface for links
  console.log('Searching main interface for API/OAuth links...\n');

  const mainResp = await fetch(`${BASE_URL}/interface/main/tabs/main.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (mainResp.ok) {
    const html = await mainResp.text();

    // Find all href links containing api, oauth, client, smart
    const linkMatches = html.match(/href="([^"]*(?:api|oauth|client|smart)[^"]*)"/gi) || [];
    const links = [...new Set(linkMatches)];

    if (links.length > 0) {
      console.log('Found relevant links:');
      links.forEach(link => {
        const url = link.match(/href="([^"]+)"/)?.[1];
        if (url) console.log(`  ${url}`);
      });
    }

    // Also look in the left nav/menu
    const menuMatches = html.match(/<li[^>]*>[\s\S]*?(?:API|OAuth|Client|SMART)[\s\S]*?<\/li>/gi);
    if (menuMatches) {
      console.log('\nMenu items containing API/OAuth/Client/SMART:');
      menuMatches.slice(0, 5).forEach(m => {
        const text = m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`  ${text.substring(0, 80)}`);
      });
    }
  }

  // Try a direct query to the OAuth admin API
  console.log('\n--- Trying OAuth Admin Endpoints ---');

  const adminEndpoints = [
    `${BASE_URL}/oauth2/default/clients`,
    `${BASE_URL}/oauth2/default/admin`,
    `${BASE_URL}/apis/default/api/admin/clients`,
  ];

  for (const url of adminEndpoints) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Cookie': jar.get(),
          'Accept': 'application/json',
        },
      });
      console.log(`${url.replace(BASE_URL, '')}: ${resp.status}`);
      if (resp.ok) {
        const text = await resp.text();
        console.log(`  Response: ${text.substring(0, 200)}`);
      }
    } catch (e: any) {
      console.log(`${url.replace(BASE_URL, '')}: Error - ${e.message}`);
    }
  }

  // Check if there's an API module installed
  console.log('\n--- Checking Installed Modules ---');
  const modulesResp = await fetch(`${BASE_URL}/interface/modules/zend_modules/public/Installer`, {
    headers: { 'Cookie': jar.get() },
  });
  console.log(`Modules page: ${modulesResp.status}`);

  // Final recommendation
  console.log('\n' + '═'.repeat(60));
  console.log('RECOMMENDATION');
  console.log('═'.repeat(60));
  console.log(`
The "invalid_client" error on the demo site might be because:

1. Dynamically registered clients need manual admin approval
2. The demo site may reset/clear clients periodically
3. There may be a delay before clients become active

TRY THIS IN YOUR BROWSER:
1. Go to: ${BASE_URL}/interface/login/login.php
2. Login: admin / pass
3. Go to: Admin menu → System → API Clients
   OR: Admin menu → Config → Connectors
4. Look for your registered client and enable it

If you can't find the client management page, the demo site
may not expose this functionality. Use your local OpenEMR instead.
`);
}

main().catch(console.error);
