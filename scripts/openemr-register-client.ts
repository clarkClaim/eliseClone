#!/usr/bin/env tsx
/**
 * Register an OAuth2 client with OpenEMR.
 *
 * OpenEMR requires OAuth2 for API access. This script registers a client
 * dynamically and saves the credentials to config/profiles/emr.env.
 *
 * Useful for demo instances that reset daily.
 *
 * Usage:
 *   pnpm openemr:register
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profilePath = path.join(rootDir, 'config', 'profiles', 'emr.env');

interface RegistrationResponse {
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  registration_client_uri: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
}

function updateEnvFile(filePath: string, key: string, value: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }

  fs.writeFileSync(filePath, content);
}

async function registerClient() {
  // Load the emr profile to get OPENEMR_URL
  const profileEnv = dotenv.parse(fs.readFileSync(profilePath));
  const baseUrl = profileEnv.OPENEMR_URL;

  if (!baseUrl) {
    console.error('ERROR: OPENEMR_URL not set in config/profiles/emr.env');
    process.exit(1);
  }

  const registrationUrl = `${baseUrl}/oauth2/default/registration`;

  console.log(`Registering OAuth2 client with: ${baseUrl}`);
  console.log(`Registration endpoint: ${registrationUrl}\n`);

  // Request ALL useful scopes to avoid permission issues
  const allScopes = [
    // Core
    'openid',
    'offline_access',
    'api:oemr',
    'api:fhir',
    // User scopes (staff access)
    'user/patient.read',
    'user/patient.write',
    'user/appointment.read',
    'user/appointment.write',
    'user/practitioner.read',
    'user/practitioner.write',
    'user/facility.read',
    'user/facility.write',
    'user/encounter.read',
    'user/encounter.write',
    'user/allergy.read',
    'user/allergy.write',
    'user/medication.read',
    'user/medication.write',
    'user/immunization.read',
    'user/insurance.read',
    'user/insurance.write',
    'user/document.read',
    'user/document.write',
    'user/vital.read',
    'user/vital.write',
    'user/list.read',
    'user/medical_problem.read',
    'user/medical_problem.write',
    'user/user.read',
    // FHIR resources
    'user/Patient.read',
    'user/Patient.write',
    'user/Practitioner.read',
    'user/Appointment.read',
    'user/Encounter.read',
    'user/Location.read',
    'user/Organization.read',
    'user/AllergyIntolerance.read',
    'user/Condition.read',
    'user/Observation.read',
    'user/MedicationRequest.read',
    'user/Immunization.read',
    'user/DocumentReference.read',
  ];

  const payload = {
    application_type: 'private',
    redirect_uris: ['http://localhost:3001/oauth/callback'],
    client_name: 'Elise Clone',
    token_endpoint_auth_method: 'client_secret_post',
    scope: allScopes.join(' '),
  };

  try {
    const response = await fetch(registrationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Registration failed (${response.status}): ${errorText}`);
      process.exit(1);
    }

    const data = await response.json() as RegistrationResponse;

    // Write credentials to profile env file
    updateEnvFile(profilePath, 'OPENEMR_CLIENT_ID', data.client_id);
    updateEnvFile(profilePath, 'OPENEMR_CLIENT_SECRET', data.client_secret);

    console.log('✓ Client registered successfully!');
    console.log(`✓ Credentials saved to: config/profiles/emr.env\n`);
    console.log(`  OPENEMR_CLIENT_ID=${data.client_id}`);
    console.log(`  OPENEMR_CLIENT_SECRET=${data.client_secret.substring(0, 8)}...`);
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACTION REQUIRED: Enable the client in OpenEMR admin           ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  1. Login to OpenEMR as admin                                  ║');
    console.log('║  2. Go to: Admin > System > API Clients                        ║');
    console.log(`║  3. Find: "${payload.client_name}" and click Edit                         ║`);
    console.log('║  4. Set "Is Enabled" to checked/true                           ║');
    console.log('║  5. Save                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Note: OpenEMR demo resets daily at 8:00 AM UTC.');
    console.log('Re-run this script after a reset: pnpm openemr:register');

  } catch (error) {
    console.error('Failed to register client:', (error as Error).message);
    console.error('\nMake sure the OpenEMR instance is running and accessible.');
    process.exit(1);
  }
}

registerClient();
