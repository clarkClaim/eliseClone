import { loadEnv } from '../src/utils/env.js';
loadEnv();

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiAssistant {
  id: string;
  name: string;
}

async function listAssistants(apiKey: string): Promise<VapiAssistant[]> {
  const response = await fetch(`${VAPI_API_URL}/assistant`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list assistants: ${await response.text()}`);
  }

  return response.json() as Promise<VapiAssistant[]>;
}

async function deleteAssistant(apiKey: string, assistantId: string): Promise<void> {
  const response = await fetch(`${VAPI_API_URL}/assistant/${assistantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete assistant: ${await response.text()}`);
  }
}

function printUsage() {
  console.log(`
Usage: pnpm run vapi:delete <assistant-name-or-id>

Examples:
  pnpm run vapi:delete "Elise (Jessica - Warm)"
  pnpm run vapi:delete abc123-def456

Run 'pnpm run vapi:list' to see available assistants.
`);
}

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY environment variable is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const assistantArg = args.join(' ');

  // Get all assistants
  const assistants = await listAssistants(apiKey);

  // Find the assistant
  const assistant = assistants.find(a =>
    a.id === assistantArg ||
    a.name.toLowerCase() === assistantArg.toLowerCase() ||
    a.name.toLowerCase().includes(assistantArg.toLowerCase())
  );

  if (!assistant) {
    console.error(`Error: Assistant not found: ${assistantArg}`);
    console.error('\nAvailable assistants:');
    for (const a of assistants) {
      console.error(`  "${a.name}" (${a.id})`);
    }
    process.exit(1);
  }

  console.log(`\nDeleting "${assistant.name}" (${assistant.id})...`);
  await deleteAssistant(apiKey, assistant.id);

  console.log('Deleted successfully.\n');
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
