import { loadEnv } from '../src/utils/env.js';
loadEnv();

const VAPI_API_URL = 'https://api.vapi.ai';

interface VapiMessage {
  role: string;
  message?: string;
  time?: number;
  name?: string;
  result?: string;
  toolCalls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  secondsFromStart?: number;
}

interface VapiCall {
  id: string;
  createdAt: string;
  endedAt?: string;
  status: string;
  messages?: VapiMessage[];
  assistant?: { name: string };
  phoneNumber?: { number: string };
}

async function fetchCallLogs(callId: string): Promise<void> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY not set in environment');
    process.exit(1);
  }

  try {
    const res = await fetch(`${VAPI_API_URL}/call/${callId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Error fetching call: ${res.status} ${text}`);
      process.exit(1);
    }

    const call = await res.json() as VapiCall;

    console.log('\n=== VAPI Call Logs ===\n');
    console.log(`Call ID: ${call.id}`);
    console.log(`Status: ${call.status}`);
    console.log(`Assistant: ${call.assistant?.name || 'Unknown'}`);
    console.log(`Created: ${call.createdAt}`);
    if (call.endedAt) {
      console.log(`Ended: ${call.endedAt}`);
    }
    console.log('\n--- Messages ---\n');

    if (!call.messages || call.messages.length === 0) {
      console.log('No messages found');
      return;
    }

    for (const msg of call.messages) {
      const timestamp = msg.secondsFromStart !== undefined
        ? `[${msg.secondsFromStart.toFixed(1)}s]`
        : '';

      switch (msg.role) {
        case 'system':
          console.log(`${timestamp} SYSTEM: (${msg.message?.length || 0} chars)`);
          break;

        case 'bot':
          console.log(`${timestamp} BOT: ${msg.message}`);
          break;

        case 'user':
          console.log(`${timestamp} USER: ${msg.message}`);
          break;

        case 'tool_calls':
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              console.log(`${timestamp} TOOL_CALL: ${tc.function.name}`);
              try {
                const args = JSON.parse(tc.function.arguments);
                console.log(`    Args: ${JSON.stringify(args)}`);
              } catch {
                console.log(`    Args: ${tc.function.arguments}`);
              }
            }
          }
          break;

        case 'tool_call_result':
          console.log(`${timestamp} TOOL_RESULT: ${msg.name}`);
          if (msg.result) {
            try {
              const result = JSON.parse(msg.result);
              // Truncate long results
              const resultStr = JSON.stringify(result, null, 2);
              if (resultStr.length > 500) {
                console.log(`    Result: ${resultStr.substring(0, 500)}...`);
              } else {
                console.log(`    Result: ${resultStr}`);
              }
            } catch {
              console.log(`    Result: ${msg.result.substring(0, 200)}...`);
            }
          }
          break;

        default:
          console.log(`${timestamp} ${msg.role.toUpperCase()}: ${msg.message || JSON.stringify(msg)}`);
      }
    }

    console.log('\n--- End of Messages ---\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

async function listRecentCalls(limit = 10): Promise<void> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('Error: VAPI_API_KEY not set in environment');
    process.exit(1);
  }

  try {
    const res = await fetch(`${VAPI_API_URL}/call?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Error fetching calls: ${res.status} ${text}`);
      process.exit(1);
    }

    const calls = await res.json() as VapiCall[];

    console.log('\n=== Recent VAPI Calls ===\n');
    console.log('ID                                    | Status    | Assistant                     | Created');
    console.log('--------------------------------------|-----------|-------------------------------|------------------------');

    for (const call of calls) {
      const id = call.id;
      const status = call.status.padEnd(9);
      const assistant = (call.assistant?.name || 'Unknown').substring(0, 29).padEnd(29);
      const created = new Date(call.createdAt).toLocaleString();
      console.log(`${id} | ${status} | ${assistant} | ${created}`);
    }

    console.log('\nUse: pnpm run vapi:logs <call-id> to view details\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

async function getCallIdByIndex(index: number): Promise<string | null> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${VAPI_API_URL}/call?limit=${index + 1}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) return null;

    const calls = await res.json() as VapiCall[];
    if (calls.length > index) {
      return calls[index].id;
    }
    return null;
  } catch {
    return null;
  }
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --last or --last N
  const lastIndex = args.indexOf('--last');
  if (lastIndex !== -1) {
    let offset = 0;
    const nextArg = args[lastIndex + 1];
    if (nextArg && /^\d+$/.test(nextArg)) {
      offset = parseInt(nextArg, 10) - 1; // --last 2 means index 1
    }

    const callId = await getCallIdByIndex(offset);
    if (callId) {
      console.log(`Fetching call #${offset + 1} from recent calls...`);
      await fetchCallLogs(callId);
    } else {
      console.error(`No call found at position ${offset + 1}`);
      process.exit(1);
    }
    return;
  }

  // Handle direct call ID
  const callId = args[0];
  if (!callId) {
    // No call ID provided - list recent calls
    await listRecentCalls();
  } else {
    // Call ID provided - fetch details
    await fetchCallLogs(callId);
  }
}

main().catch(console.error);
