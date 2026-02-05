#!/usr/bin/env tsx
/**
 * Find the endpoint to enable API clients
 */

import fs from 'fs';

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
  const jar = createCookieJar();

  console.log('Logging in...');
  if (!(await login(jar))) {
    console.log('Login failed');
    return;
  }
  console.log('Logged in!\n');

  // Try to find the client list page
  const possiblePaths = [
    '/interface/smart/register-app.php',
    '/interface/modules/zend_modules/public/SMART',
    '/interface/modules/zend_modules/public/SMART/index',
    '/interface/modules/zend_modules/public/SMART/client-app',
    '/interface/modules/zend_modules/public/SMART/ClientApp',
    '/interface/modules/zend_modules/module/SMART',
    '/admin/smart',
    '/interface/super/edit_globals.php',  // Check for API settings here
  ];

  for (const path of possiblePaths) {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Cookie': jar.get() },
    });
    console.log(`${path}: ${resp.status}`);

    if (resp.ok) {
      const html = await resp.text();
      // Look for client list or enable functionality
      if (html.includes('Elise-') || html.includes('client_id') || html.includes('Enable')) {
        console.log('  ^ Contains client/enable content');

        // Look for specific patterns
        const patterns = [
          /href="([^"]*enable[^"]*)"/gi,
          /action="([^"]*client[^"]*)"/gi,
          /data-action="([^"]*)"/gi,
          /<button[^>]*enable[^>]*>/gi,
          /onclick="[^"]*enable[^"]*"/gi,
        ];

        for (const pattern of patterns) {
          const matches = html.match(pattern);
          if (matches) {
            console.log(`  Pattern ${pattern}: ${matches.slice(0, 3).join(', ')}`);
          }
        }

        // Save if it looks useful
        if (html.includes('Elise-Auto') || html.includes('am5BoPVk')) {
          fs.writeFileSync('/tmp/client-list-page.html', html);
          console.log('  Saved to /tmp/client-list-page.html');
        }
      }
    }
  }

  // Check the SMART module routes
  console.log('\n--- Checking SMART module endpoints ---');

  const smartEndpoints = [
    '/interface/modules/zend_modules/public/SMART/AdminApp',
    '/interface/modules/zend_modules/public/SMART/AdminApp/edit',
    '/interface/modules/zend_modules/public/SMART/AdminApp/enable',
    '/interface/modules/zend_modules/public/SMART/AdminApp/list',
  ];

  for (const endpoint of smartEndpoints) {
    const resp = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'Cookie': jar.get() },
    });
    console.log(`${endpoint}: ${resp.status}`);
  }

  // Look at the register-app page more carefully for the client list section
  console.log('\n--- Examining register-app.php in detail ---');

  const regAppResp = await fetch(`${BASE_URL}/interface/smart/register-app.php`, {
    headers: { 'Cookie': jar.get() },
  });

  if (regAppResp.ok) {
    const html = await regAppResp.text();

    // Look for any AJAX endpoints
    const ajaxMatches = html.match(/fetch\s*\(\s*["']([^"']+)["']/g);
    if (ajaxMatches) {
      console.log('AJAX endpoints found:');
      ajaxMatches.forEach(m => console.log(`  ${m}`));
    }

    // Look for API routes
    const apiMatches = html.match(/\/api\/[^"'\s]+/g);
    if (apiMatches) {
      console.log('API routes found:', [...new Set(apiMatches)]);
    }

    // Look for zend routes
    const zendMatches = html.match(/zend_modules\/public\/[^"'\s]+/g);
    if (zendMatches) {
      console.log('Zend routes found:', [...new Set(zendMatches)]);
    }

    // Save full page
    fs.writeFileSync('/tmp/register-app-full.html', html);
    console.log('\nFull page saved to /tmp/register-app-full.html');
  }
}

main().catch(console.error);
