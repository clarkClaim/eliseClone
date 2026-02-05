import { loadEnv } from '../src/utils/env.js';
loadEnv();

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiTool {
  id: string;
  function?: { name: string };
  [key: string]: unknown;
}

interface VapiAssistant {
  id: string;
  name: string;
  [key: string]: unknown;
}

function interpolateEnvVars(content: string): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const value = process.env[varName];
    if (!value) {
      console.warn(`Warning: Environment variable ${varName} is not set`);
      return '';
    }
    return value;
  });
}

async function createOrUpdateTool(apiKey: string, toolConfig: Record<string, unknown>): Promise<string> {
  const functionName = (toolConfig.function as { name: string })?.name;
  console.log(`  Setting up tool: ${functionName}`);

  // Check if tool already exists by listing tools
  const listResponse = await fetch(`${VAPI_API_URL}/tool`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!listResponse.ok) {
    throw new Error(`Failed to list tools: ${await listResponse.text()}`);
  }

  const existingTools = await listResponse.json() as VapiTool[];
  const existingTool = existingTools.find(t => t.function?.name === functionName);

  if (existingTool) {
    // Update existing tool - remove 'type' field as it's not allowed on updates
    const { type, ...updateConfig } = toolConfig;
    console.log(`    Updating existing tool: ${existingTool.id}`);
    const response = await fetch(`${VAPI_API_URL}/tool/${existingTool.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to update tool: ${await response.text()}`);
    }

    const tool = await response.json() as VapiTool;
    return tool.id;
  } else {
    // Create new tool
    console.log(`    Creating new tool...`);
    const response = await fetch(`${VAPI_API_URL}/tool`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to create tool: ${await response.text()}`);
    }

    const tool = await response.json() as VapiTool;
    console.log(`    Tool created: ${tool.id}`);
    return tool.id;
  }
}

async function createOrUpdateAssistant(
  apiKey: string,
  assistantConfig: Record<string, unknown>,
  toolIds: string[]
): Promise<VapiAssistant> {
  const name = assistantConfig.name as string;

  // Add tool IDs to the model config
  if (toolIds.length > 0) {
    assistantConfig.model = assistantConfig.model || {};
    (assistantConfig.model as Record<string, unknown>).toolIds = toolIds;
  }

  // Check if assistant already exists by name
  const listResponse = await fetch(`${VAPI_API_URL}/assistant`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!listResponse.ok) {
    throw new Error(`Failed to list assistants: ${await listResponse.text()}`);
  }

  const existingAssistants = await listResponse.json() as VapiAssistant[];
  const existingAssistant = existingAssistants.find(a => a.name === name);

  if (existingAssistant) {
    // Update existing assistant
    console.log(`  Updating: ${name} (${existingAssistant.id})`);
    const response = await fetch(`${VAPI_API_URL}/assistant/${existingAssistant.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to update assistant: ${await response.text()}`);
    }

    return response.json() as Promise<VapiAssistant>;
  } else {
    // Create new assistant
    console.log(`  Creating: ${name}`);
    const response = await fetch(`${VAPI_API_URL}/assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to create assistant: ${await response.text()}`);
    }

    const assistant = await response.json() as VapiAssistant;
    console.log(`    Created with ID: ${assistant.id}`);
    return assistant;
  }
}

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY environment variable is required');
    console.error('Get your API key from https://dashboard.vapi.ai');
    process.exit(1);
  }

  // Accept SERVER_URL or NGROK_URL (for convenience)
  const serverUrl = process.env.SERVER_URL || process.env.NGROK_URL;
  if (!serverUrl) {
    console.error('Error: SERVER_URL (or NGROK_URL) environment variable is required');
    console.error('This is the public URL where VAPI will send webhooks');
    console.error('For local development, run: pnpm run tunnel');
    process.exit(1);
  }
  // Make SERVER_URL available for config interpolation
  process.env.SERVER_URL = serverUrl;

  const configDir = join(__dirname, '..', 'config');
  const assistantsDir = join(configDir, 'assistants');

  // Check which assistant configs to use
  const specificAssistant = process.argv[2];

  // Step 1: Create/update tools
  console.log('\n=== Setting up VAPI Tools ===\n');
  const toolIds: string[] = [];

  const toolFiles = readdirSync(configDir).filter(f => f.startsWith('vapi-tool-') && f.endsWith('.json'));
  for (const toolFile of toolFiles) {
    const toolConfigContent = readFileSync(join(configDir, toolFile), 'utf-8');
    const toolConfig = JSON.parse(interpolateEnvVars(toolConfigContent));
    const toolId = await createOrUpdateTool(apiKey, toolConfig);
    toolIds.push(toolId);
  }

  console.log(`\n  ${toolIds.length} tools ready\n`);

  // Step 2: Create/update assistants
  console.log('=== Setting up VAPI Assistants ===\n');

  const createdAssistants: VapiAssistant[] = [];

  // Check for assistants in the assistants/ subdirectory
  if (existsSync(assistantsDir)) {
    const assistantFiles = readdirSync(assistantsDir).filter(f => f.endsWith('.json'));

    for (const file of assistantFiles) {
      // Skip if a specific assistant was requested and this isn't it
      if (specificAssistant && !file.includes(specificAssistant) && !basename(file, '.json').includes(specificAssistant)) {
        continue;
      }

      const configContent = readFileSync(join(assistantsDir, file), 'utf-8');
      const assistantConfig = JSON.parse(interpolateEnvVars(configContent));
      const assistant = await createOrUpdateAssistant(apiKey, assistantConfig, toolIds);
      createdAssistants.push(assistant);
    }
  }

  // Also check for legacy vapi-assistant.json in config root
  const legacyAssistantPath = join(configDir, 'vapi-assistant.json');
  if (existsSync(legacyAssistantPath) && !specificAssistant) {
    console.log('  (Also found legacy config/vapi-assistant.json)');
  }

  console.log('\n=== Setup Complete ===\n');

  if (createdAssistants.length === 0) {
    console.log('No assistants were created/updated.');
    if (specificAssistant) {
      console.log(`No assistant matching "${specificAssistant}" found.`);
    }
  } else {
    console.log('Created/updated assistants:');
    for (const assistant of createdAssistants) {
      console.log(`  - ${assistant.name} (${assistant.id})`);
    }
  }

  console.log('\nNext steps:');
  console.log('1. Run `pnpm run vapi:list` to see all assistants and phone numbers');
  console.log('2. Run `pnpm run vapi:assign <phone> <assistant>` to assign an assistant to a phone');
  console.log('3. Call the phone number to test!');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
