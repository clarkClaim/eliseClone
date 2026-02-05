import { loadEnv } from '../src/utils/env.js';
loadEnv();

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiAssistant {
  id: string;
  name: string;
}

interface VapiPhoneNumber {
  id: string;
  number: string;
  assistantId?: string;
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

async function listPhoneNumbers(apiKey: string): Promise<VapiPhoneNumber[]> {
  const response = await fetch(`${VAPI_API_URL}/phone-number`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list phone numbers: ${await response.text()}`);
  }

  return response.json() as Promise<VapiPhoneNumber[]>;
}

async function assignAssistant(apiKey: string, phoneId: string, assistantId: string): Promise<void> {
  const response = await fetch(`${VAPI_API_URL}/phone-number/${phoneId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assistantId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to assign assistant: ${await response.text()}`);
  }
}

function printUsage() {
  console.log(`
Usage: pnpm run vapi:assign <assistant-name-or-id> [phone-number-or-id]

If you only have one phone number, you can omit it.

Examples:
  pnpm run vapi:assign jessica
  pnpm run vapi:assign asteria
  pnpm run vapi:assign orion
  pnpm run vapi:assign "Elise (Jessica - Warm)"
  pnpm run vapi:assign abc123-def456 +15551234567

Run 'pnpm run vapi:list' to see available phones and assistants.
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

  // Get all assistants and phone numbers
  const [assistants, phoneNumbers] = await Promise.all([
    listAssistants(apiKey),
    listPhoneNumbers(apiKey),
  ]);

  // Determine if first arg is a phone or assistant
  let phoneArg: string | undefined;
  let assistantArg: string;

  // Check if we have 2+ args and the last one looks like a phone
  if (args.length >= 2) {
    const lastArg = args[args.length - 1];
    const isPhone = phoneNumbers.some(p =>
      p.id === lastArg ||
      p.number === lastArg ||
      p.number.replace(/\D/g, '') === lastArg.replace(/\D/g, '')
    );

    if (isPhone) {
      phoneArg = lastArg;
      assistantArg = args.slice(0, -1).join(' ');
    } else {
      assistantArg = args.join(' ');
    }
  } else {
    assistantArg = args.join(' ');
  }

  // Find or default the phone number
  let phone: VapiPhoneNumber | undefined;

  if (phoneArg) {
    phone = phoneNumbers.find(p =>
      p.id === phoneArg ||
      p.number === phoneArg ||
      p.number.replace(/\D/g, '') === phoneArg.replace(/\D/g, '')
    );

    if (!phone) {
      console.error(`Error: Phone number not found: ${phoneArg}`);
      process.exit(1);
    }
  } else if (phoneNumbers.length === 1) {
    phone = phoneNumbers[0];
    console.log(`Using default phone: ${phone.number}`);
  } else if (phoneNumbers.length === 0) {
    console.error('Error: No phone numbers found. Buy one in the VAPI dashboard.');
    process.exit(1);
  } else {
    console.error('Error: Multiple phone numbers found. Please specify which one:');
    for (const p of phoneNumbers) {
      console.error(`  ${p.number} (${p.id})`);
    }
    process.exit(1);
  }

  // Find the assistant (fuzzy match)
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

  // Assign the assistant to the phone number
  console.log(`Assigning "${assistant.name}" to ${phone.number}...`);
  await assignAssistant(apiKey, phone.id, assistant.id);

  console.log('Done!\n');
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
