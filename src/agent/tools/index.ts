import { identifyPatient, IdentifyPatientParams } from './identify-patient.js';
import { saveNewPatient, SaveNewPatientParams, setMRSAdapterForPatient } from './save-new-patient.js';
import { getAvailability, GetAvailabilityParams } from './get-availability.js';
import { bookAppointment, BookAppointmentParams, setMRSAdapter as setBookingAdapter } from './book-appointment.js';
import { rescheduleAppointment, RescheduleAppointmentParams, setMRSAdapterForReschedule } from './reschedule-appointment.js';
import { cancelAppointmentTool, CancelAppointmentParams, setMRSAdapterForCancel } from './cancel-appointment.js';
import { manageAppointment, ManageAppointmentParams, setMRSAdapterForManage } from './manage-appointment.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import { log } from '../../utils/logger.js';

// Set MRS adapter for all tools that need it
export function setMRSAdapter(adapter: MRSAdapter | null): void {
  setBookingAdapter(adapter);
  setMRSAdapterForPatient(adapter);
  setMRSAdapterForReschedule(adapter);
  setMRSAdapterForCancel(adapter);
  setMRSAdapterForManage(adapter);
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
  reschedule_appointment: async (args, callId) => {
    const params = args as unknown as RescheduleAppointmentParams;
    return rescheduleAppointment(params, callId);
  },
  cancel_appointment: async (args, callId) => {
    const params = args as unknown as CancelAppointmentParams;
    return cancelAppointmentTool(params, callId);
  },
  manage_appointment: async (args, callId) => {
    const params = args as unknown as ManageAppointmentParams;
    return manageAppointment(params, callId);
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

  log.tools.info('Tool call received', { callId, callerPhone, toolCount: toolCalls.length });

  for (const toolCall of toolCalls) {
    const { id: toolCallId, function: fn } = toolCall;
    const handler = tools[fn.name];

    if (!handler) {
      log.tools.warn('Unknown tool requested', { tool: fn.name });
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
      if (!args.phone) {
        args.phone = callerPhone;
      }
    }

    log.tools.debug('Executing tool', { tool: fn.name, args });

    try {
      const result = await handler(args, callId);
      // Log actual success status from tool result (if available)
      const resultSuccess = typeof result === 'object' && result !== null && 'success' in result
        ? (result as { success: boolean }).success
        : true;
      log.tools.info('Tool completed', { tool: fn.name, success: resultSuccess });
      results.push({
        toolCallId,
        result: JSON.stringify(result),
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      log.tools.error('Tool failed', { tool: fn.name, error: errorMessage });
      results.push({
        toolCallId,
        result: JSON.stringify({
          error: `Tool execution failed: ${errorMessage}`,
        }),
      });
    }
  }

  return { results };
}
