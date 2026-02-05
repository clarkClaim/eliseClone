#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(__dirname, '..', 'config', 'profiles', 'emr.env');
const env = dotenv.parse(fs.readFileSync(profilePath));

const tokenUrl = `${env.OPENEMR_URL}/oauth2/default/token`;

console.log('Testing with user_role=users...');
console.log('URL:', tokenUrl);

const params = new URLSearchParams({
  grant_type: 'password',
  client_id: env.OPENEMR_CLIENT_ID!,
  client_secret: env.OPENEMR_CLIENT_SECRET!,
  username: env.OPENEMR_USER!,
  password: env.OPENEMR_PASSWORD!,
  user_role: 'users',
  scope: 'openid api:oemr',
});

const response = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
});

console.log('Status:', response.status);
const text = await response.text();
console.log('Response:', text.substring(0, 300));

if (response.ok) {
  console.log('\n✓ SUCCESS!');
} else {
  console.log('\n✗ FAILED');
}
