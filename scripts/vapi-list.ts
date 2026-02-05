import { loadEnv } from '../src/utils/env.js';
loadEnv();

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiAssistant {
  id: string;
  name: string;
  createdAt: string;
  model?: {
    provider?: string;
    model?: string;
  };
  voice?: {
    provider?: string;
    voiceId?: string;
  };
}

interface VapiPhoneNumber {
  id: string;
  number: string;
  name?: string;
  assistantId?: string;
  createdAt: string;
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

async function main() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('\n=== VAPI Assistants ===\n');

  const assistants = await listAssistants(apiKey);

  if (assistants.length === 0) {
    console.log('No assistants found. Run `pnpm run vapi:setup` to create one.');
  } else {
    console.log('ID                                    | Name                          | Model              | Voice');
    console.log('--------------------------------------|-------------------------------|--------------------|-----------------');

    for (const assistant of assistants) {
      const model = assistant.model ? `${assistant.model.provider}/${assistant.model.model}` : 'N/A';
      const voice = assistant.voice ? `${assistant.voice.provider}/${assistant.voice.voiceId?.slice(0, 8)}...` : 'N/A';
      console.log(`${assistant.id} | ${assistant.name.padEnd(29)} | ${model.padEnd(18)} | ${voice}`);
    }
  }

  console.log('\n=== VAPI Phone Numbers ===\n');

  const phoneNumbers = await listPhoneNumbers(apiKey);

  if (phoneNumbers.length === 0) {
    console.log('No phone numbers found. Buy one in the VAPI dashboard.');
  } else {
    console.log('ID                                    | Number          | Assigned Assistant');
    console.log('--------------------------------------|-----------------|-------------------------------------------');

    for (const phone of phoneNumbers) {
      const assignedAssistant = phone.assistantId
        ? assistants.find(a => a.id === phone.assistantId)?.name || phone.assistantId
        : '(none)';
      console.log(`${phone.id} | ${phone.number.padEnd(15)} | ${assignedAssistant}`);
    }
  }

  console.log('');
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
