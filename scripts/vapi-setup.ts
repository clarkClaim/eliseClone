import { loadEnv } from '../src/utils/env.js';
loadEnv();

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VAPI_API_URL = 'https://api.vapi.ai';
const API_DELAY_MS = 3000; // Delay between API calls to avoid rate limiting

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cache for assistant list to avoid repeated API calls
let cachedAssistants: VapiAssistant[] | null = null;

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

interface OfficeConfig {
  _comment?: string;
  profile?: string;
  template: Record<string, string>;
  overrides?: Record<string, unknown>;
  toolFilter?: string[]; // Only include these tools (by function name)
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

function interpolateTemplateVars(content: string, vars: Record<string, string>): string {
  let result = content;
  const missingVars: string[] = [];

  // Find all placeholders
  const placeholders = content.match(/\{\{(\w+)\}\}/g) || [];
  const uniquePlaceholders = [...new Set(placeholders.map(p => p.slice(2, -2)))];

  for (const varName of uniquePlaceholders) {
    if (vars[varName] !== undefined) {
      result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), vars[varName]);
    } else if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(`Missing required template variables: ${missingVars.join(', ')}`);
  }

  return result;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

function loadAssistantConfig(configPath: string, assistantsDir: string): { config: Record<string, unknown>; profile?: string; toolFilter?: string[] } {
  const configContent = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);

  // Check if this is a template-based config (has 'template' key)
  if (config.template) {
    const officeConfig = config as OfficeConfig;

    // Load base template
    const basePath = join(assistantsDir, '_base_assistant.json');
    if (!existsSync(basePath)) {
      throw new Error(`Base template not found: ${basePath}`);
    }

    const baseContent = readFileSync(basePath, 'utf-8');

    // Replace template variables in base
    const interpolatedBase = interpolateTemplateVars(baseContent, officeConfig.template);

    // Also interpolate env vars (like SERVER_URL)
    const withEnvVars = interpolateEnvVars(interpolatedBase);

    // Parse the interpolated base
    let mergedConfig = JSON.parse(withEnvVars);

    // Deep merge overrides if present
    if (officeConfig.overrides) {
      mergedConfig = deepMerge(mergedConfig, officeConfig.overrides);
    }

    return { config: mergedConfig, profile: officeConfig.profile, toolFilter: officeConfig.toolFilter };
  }

  // Legacy full config - just interpolate env vars
  return { config: JSON.parse(interpolateEnvVars(configContent)) };
}

function updateProfileConfig(profile: string, assistantId: string, configDir: string): void {
  const profilePath = join(configDir, 'profiles', `${profile}.env`);

  if (!existsSync(profilePath)) {
    console.warn(`    Warning: Profile config not found: ${profilePath}`);
    return;
  }

  let content = readFileSync(profilePath, 'utf-8');

  // Check if VAPI_ASSISTANT_ID line exists
  if (content.includes('VAPI_ASSISTANT_ID=')) {
    // Update existing line
    content = content.replace(/VAPI_ASSISTANT_ID=.*/, `VAPI_ASSISTANT_ID=${assistantId}`);
  } else {
    // Add new line after the comment about VAPI Assistant
    const lines = content.split('\n');
    const insertIndex = lines.findIndex(l => l.includes('VAPI Assistant'));
    if (insertIndex >= 0) {
      lines[insertIndex] = lines[insertIndex].replace(/VAPI_ASSISTANT_ID=.*/, '');
      lines.splice(insertIndex + 1, 0, `VAPI_ASSISTANT_ID=${assistantId}`);
      content = lines.join('\n');
    } else {
      // Just append
      content += `\nVAPI_ASSISTANT_ID=${assistantId}\n`;
    }
  }

  writeFileSync(profilePath, content);
  console.log(`    Updated ${profile}.env with VAPI_ASSISTANT_ID`);
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
  toolIds: string[],
  skipToolIds: boolean = false
): Promise<VapiAssistant> {
  const name = assistantConfig.name as string;

  // Add tool IDs to the model config (skip if --skip-tools to preserve existing)
  if (!skipToolIds && toolIds.length > 0) {
    assistantConfig.model = assistantConfig.model || {};
    (assistantConfig.model as Record<string, unknown>).toolIds = toolIds;
  }

  // Use cached assistant list, or fetch if not available
  if (!cachedAssistants) {
    const listResponse = await fetch(`${VAPI_API_URL}/assistant`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to list assistants: ${await listResponse.text()}`);
    }

    cachedAssistants = await listResponse.json() as VapiAssistant[];
    await sleep(API_DELAY_MS);
  }

  const existingAssistant = cachedAssistants.find(a => a.name === name);

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
    // Add to cache so subsequent lookups find it
    if (cachedAssistants) {
      cachedAssistants.push(assistant);
    }
    return assistant;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipTools = args.includes('--skip-tools');
  const specificAssistant = args.find(a => !a.startsWith('--'));

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made to VAPI ===\n');
  }

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey && !dryRun) {
    console.error('Error: VAPI_API_KEY environment variable is required');
    console.error('Get your API key from https://dashboard.vapi.ai');
    console.error('(Use --dry-run to preview merged configs without API key)');
    process.exit(1);
  }

  // Accept SERVER_URL or NGROK_URL or construct from NGROK_DOMAIN
  let serverUrl = process.env.SERVER_URL || process.env.NGROK_URL;
  if (!serverUrl && process.env.NGROK_DOMAIN) {
    serverUrl = `https://${process.env.NGROK_DOMAIN}`;
  }
  if (!serverUrl && !dryRun) {
    console.error('Error: SERVER_URL, NGROK_URL, or NGROK_DOMAIN environment variable is required');
    console.error('This is the public URL where VAPI will send webhooks');
    console.error('For local development, run: pnpm run tunnel');
    process.exit(1);
  }
  // Make SERVER_URL available for config interpolation
  if (serverUrl) {
    process.env.SERVER_URL = serverUrl;
  }

  const configDir = join(__dirname, '..', 'config');
  const assistantsDir = join(configDir, 'assistants');

  // Step 1: Create/update tools (skip in dry-run or with --skip-tools)
  const toolsMap: Map<string, string> = new Map(); // name -> id
  if (!dryRun && !skipTools) {
    console.log('\n=== Setting up VAPI Tools ===\n');

    const toolFiles = readdirSync(configDir).filter(f => f.startsWith('vapi-tool-') && f.endsWith('.json'));
    for (const toolFile of toolFiles) {
      const toolConfigContent = readFileSync(join(configDir, toolFile), 'utf-8');
      const toolConfig = JSON.parse(interpolateEnvVars(toolConfigContent));
      const toolName = toolConfig.function?.name;
      const toolId = await createOrUpdateTool(apiKey!, toolConfig);
      if (toolName) {
        toolsMap.set(toolName, toolId);
      }
      await sleep(API_DELAY_MS);
    }

    console.log(`\n  ${toolsMap.size} tools ready\n`);
  }

  // Step 2: Create/update assistants
  console.log('=== Setting up VAPI Assistants ===\n');

  const createdAssistants: { assistant: VapiAssistant; profile?: string }[] = [];

  // Check for assistants in the assistants/ subdirectory
  if (existsSync(assistantsDir)) {
    const assistantFiles = readdirSync(assistantsDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('_')); // Skip _base_assistant.json

    for (const file of assistantFiles) {
      const baseName = basename(file, '.json');

      // Skip if a specific assistant was requested and this isn't it
      if (specificAssistant && !file.includes(specificAssistant) && !baseName.includes(specificAssistant)) {
        continue;
      }

      // Skip legacy full configs if they exist alongside new template configs
      if (file.includes('-elise.json') && existsSync(join(assistantsDir, file.replace('-elise.json', '.json')))) {
        console.log(`  Skipping legacy config: ${file}`);
        continue;
      }

      console.log(`  Processing: ${file}`);
      const configPath = join(assistantsDir, file);

      try {
        const { config: assistantConfig, profile, toolFilter } = loadAssistantConfig(configPath, assistantsDir);

        if (dryRun) {
          console.log(`\n  --- Merged config for ${file} (profile: ${profile || 'none'}) ---`);
          console.log(JSON.stringify(assistantConfig, null, 2));
          console.log(`  --- End ${file} ---\n`);
        } else {
          // Filter tools if toolFilter is specified (skip if --skip-tools)
          let assistantToolIds: string[] = [];
          if (!skipTools) {
            if (toolFilter && toolFilter.length > 0) {
              assistantToolIds = toolFilter
                .map(name => toolsMap.get(name))
                .filter((id): id is string => id !== undefined);
              console.log(`    Using filtered tools: ${toolFilter.join(', ')}`);
            } else {
              assistantToolIds = [...toolsMap.values()];
            }
          }

          const assistant = await createOrUpdateAssistant(apiKey!, assistantConfig, assistantToolIds, skipTools);
          createdAssistants.push({ assistant, profile });

          // Auto-update profile config with assistant ID
          if (profile) {
            updateProfileConfig(profile, assistant.id, configDir);
          }
          await sleep(API_DELAY_MS);
        }
      } catch (error) {
        console.error(`  Error processing ${file}:`, (error as Error).message);
        if (!dryRun) {
          process.exit(1);
        }
      }
    }
  }

  if (dryRun) {
    console.log('=== Dry run complete ===');
    return;
  }

  console.log('\n=== Setup Complete ===\n');

  if (createdAssistants.length === 0) {
    console.log('No assistants were created/updated.');
    if (specificAssistant) {
      console.log(`No assistant matching "${specificAssistant}" found.`);
    }
  } else {
    console.log('Summary:');
    for (const { assistant, profile } of createdAssistants) {
      console.log(`  - ${assistant.name}`);
      console.log(`    ID: ${assistant.id}`);
      if (profile) {
        console.log(`    Profile: ${profile} (config updated automatically)`);
      }
    }
  }

  console.log('\nProfile configs updated. Restart your server to use the new assistant IDs.');
  console.log('\nNext steps:');
  console.log('1. Run `pnpm run vapi:list` to see all assistants and phone numbers');
  console.log('2. Run `pnpm run vapi:assign "<assistant-name>" <phone>` to assign an assistant to a phone');
  console.log('3. Call the phone number to test!');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
