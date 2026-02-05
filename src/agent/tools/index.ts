import { identifyPatient, IdentifyPatientParams } from './identify-patient.js';
import { saveNewPatient, SaveNewPatientParams, setMRSAdapterForPatient } from './save-new-patient.js';
import { getAvailability, GetAvailabilityParams } from './get-availability.js';
import { bookAppointment, BookAppointmentParams, setMRSAdapter as setBookingAdapter } from './book-appointment.js';
import type { MRSAdapter } from '../../mrs/adapter.js';

// Set MRS adapter for all tools that need it
export function setMRSAdapter(adapter: MRSAdapter | null): void {
  setBookingAdapter(adapter);
  setMRSAdapterForPatient(adapter);
}

// VAPI tool call request format
export interface VapiToolCallRequest {
  message: {
    type: 'tool-calls';
    toolCallList: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
    call?: {
      id: string;
      customer?: {
        number?: string;
      };
    };
  };
}

// VAPI tool call response format
export interface VapiToolCallResponse {
  results: Array<{
    toolCallId: string;
    result: string;
  }>;
}

// Tool registry
type ToolHandler = (args: Record<string, unknown>, callId?: string) => Promise<unknown>;

const tools: Record<string, ToolHandler> = {
  identify_patient: async (args, callId) => {
    const params = args as unknown as IdentifyPatientParams;
    return identifyPatient(params, callId);
  },
  save_new_patient: async (args, callId) => {
    const params = args as unknown as SaveNewPatientParams;
    return saveNewPatient(params, callId);
  },
  get_availability: async (args) => {
    const params = args as unknown as GetAvailabilityParams;
    return getAvailability(params);
  },
  book_appointment: async (args, callId) => {
    const params = args as unknown as BookAppointmentParams;
    return bookAppointment(params, callId);
  },
};

// Tools that should automatically receive caller's phone from caller ID
const TOOLS_NEEDING_CALLER_PHONE = ['identify_patient', 'save_new_patient'];

// Handle incoming VAPI tool calls
export async function handleToolCall(request: VapiToolCallRequest): Promise<VapiToolCallResponse> {
  const results: VapiToolCallResponse['results'] = [];

  const callId = request.message.call?.id;
  const callerPhone = request.message.call?.customer?.number;
  const toolCalls = request.message.toolCallList || [];

  console.log(`[Tools] Call ID: ${callId}, Caller phone: ${callerPhone}`);

  for (const toolCall of toolCalls) {
    const { id: toolCallId, function: fn } = toolCall;
    const handler = tools[fn.name];

    if (!handler) {
      results.push({
        toolCallId,
        result: JSON.stringify({
          error: `Unknown tool: ${fn.name}`,
        }),
      });
      continue;
    }

    // Handle phone numbers for tools that need caller phone
    let args = { ...fn.arguments };
    if (TOOLS_NEEDING_CALLER_PHONE.includes(fn.name) && callerPhone) {
      // Use caller ID as default, but LLM-provided phone overrides if present
      if (args.phone) {
        console.log(`[Tools] LLM provided phone for ${fn.name}: ${args.phone} (caller ID: ${callerPhone})`);
      } else {
        args.phone = callerPhone;
        console.log(`[Tools] Using caller ID phone for ${fn.name}: ${callerPhone}`);
      }
    }

    try {
      const result = await handler(args, callId);
      results.push({
        toolCallId,
        result: JSON.stringify(result),
      });
    } catch (error) {
      console.error(`[Tools] Error in ${fn.name}:`, error);
      results.push({
        toolCallId,
        result: JSON.stringify({
          error: `Tool execution failed: ${(error as Error).message}`,
        }),
      });
    }
  }

  return { results };
}
