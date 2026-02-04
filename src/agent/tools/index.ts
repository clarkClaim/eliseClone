import { identifyPatient, IdentifyPatientParams, IdentifyPatientResult } from './identify-patient.js';

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
};

// Handle incoming VAPI tool calls
export async function handleToolCall(request: VapiToolCallRequest): Promise<VapiToolCallResponse> {
  const results: VapiToolCallResponse['results'] = [];

  const callId = request.message.call?.id;
  const toolCalls = request.message.toolCallList || [];

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

    try {
      const result = await handler(fn.arguments, callId);
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
