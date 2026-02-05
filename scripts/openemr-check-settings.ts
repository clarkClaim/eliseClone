#!/usr/bin/env tsx
/**
 * Check OpenEMR API settings
 */

const BASE_URL = 'https://demo.openemr.io/a/openemr';

async function main() {
  // Step 1: Get the login page
  console.log('1. Fetching login page...');
  const loginPageResp = await fetch(`${BASE_URL}/interface/login/login.php?site=default`);
  const cookies = loginPageResp.headers.getSetCookie?.() || [];
  let cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  console.log('   Got cookies:', cookieHeader.substring(0, 60));

  // Step 2: Submit login
  console.log('2. Logging in...');
  const loginResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?auth=login&site=default`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    },
    body: 'new_login_session_management=1&authProvider=Default&authUser=admin&clearPass=pass',
    redirect: 'manual',
  });
  console.log('   Login status:', loginResp.status);

  const sessionCookies = loginResp.headers.getSetCookie?.() || [];
  cookieHeader = [...cookies, ...sessionCookies].map(c => c.split(';')[0]).join('; ');

  // Step 3: Follow redirect to main screen
  console.log('3. Following redirect...');
  const mainResp = await fetch(`${BASE_URL}/interface/main/main_screen.php?site=default`, {
    headers: { 'Cookie': cookieHeader },
  });
  console.log('   Main screen status:', mainResp.status);

  // Update cookies again
  const mainCookies = mainResp.headers.getSetCookie?.() || [];
  cookieHeader = [...cookies, ...sessionCookies, ...mainCookies].map(c => c.split(';')[0]).join('; ');

  // Step 4: Fetch globals page
  console.log('4. Fetching globals page...');
  const globalsResp = await fetch(`${BASE_URL}/interface/super/edit_globals.php`, {
    headers: { 'Cookie': cookieHeader },
  });
  console.log('   Globals status:', globalsResp.status);

  const html = await globalsResp.text();
  console.log('   Page length:', html.length);

  // Check if we're logged in or redirected to login
  if (html.includes('login') && html.includes('password')) {
    console.log('   ⚠ Seems to be login page - session may have failed');
  }

  // Save HTML for inspection
  const fs = await import('fs');
  fs.writeFileSync('/tmp/openemr-globals.html', html);
  console.log('   Saved full HTML to /tmp/openemr-globals.html');

  // Look for key terms
  console.log('\n5. Searching for API settings...');
  const terms = ['rest_api', 'fhir', 'oauth', 'Connectors', 'connector', 'API'];
  for (const term of terms) {
    const count = (html.match(new RegExp(term, 'gi')) || []).length;
    console.log(`   "${term}": ${count} occurrences`);
  }

  // Show page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  console.log('\n   Page title:', titleMatch ? titleMatch[1] : 'NOT FOUND');
}

main().catch(console.error);
