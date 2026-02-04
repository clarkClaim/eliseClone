import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiAssistant {
  id: string;
  name: string;
  [key: string]: unknown;
}

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY environment variable is required');
    console.error('Get your API key from https://dashboard.vapi.ai');
    process.exit(1);
  }

  const serverUrl = process.env.SERVER_URL;
  if (!serverUrl) {
    console.error('Error: SERVER_URL environment variable is required');
    console.error('This is the public URL where VAPI will send webhooks');
    console.error('For local development, use ngrok: ngrok http 3000');
    process.exit(1);
  }

  // Load assistant config
  const configPath = join(__dirname, '..', 'config', 'vapi-assistant.json');
  const configContent = readFileSync(configPath, 'utf-8');

  // Interpolate environment variables
  const interpolated = configContent.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const value = process.env[varName];
    if (!value) {
      console.warn(`Warning: Environment variable ${varName} is not set`);
      return '';
    }
    return value;
  });

  const config = JSON.parse(interpolated);
  console.log('Loaded assistant config:', config.name);

  // Check if we have an existing assistant ID
  const existingId = process.env.VAPI_ASSISTANT_ID;

  if (existingId) {
    // Update existing assistant
    console.log(`Updating existing assistant: ${existingId}`);
    const response = await fetch(`${VAPI_API_URL}/assistant/${existingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to update assistant:', error);
      process.exit(1);
    }

    const assistant = await response.json() as VapiAssistant;
    console.log('Assistant updated successfully!');
    console.log(`  ID: ${assistant.id}`);
    console.log(`  Name: ${assistant.name}`);
  } else {
    // Create new assistant
    console.log('Creating new assistant...');
    const response = await fetch(`${VAPI_API_URL}/assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create assistant:', error);
      process.exit(1);
    }

    const assistant = await response.json() as VapiAssistant;
    console.log('Assistant created successfully!');
    console.log(`  ID: ${assistant.id}`);
    console.log(`  Name: ${assistant.name}`);
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`  VAPI_ASSISTANT_ID=${assistant.id}`);
  }
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
