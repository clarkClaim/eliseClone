import 'dotenv/config';
import express, { Request, Response } from 'express';
import { SyncService } from './sync/index.js';
import { OpenMRSAdapter } from './mrs/openmrs/adapter.js';
import { handleToolCall, VapiToolCallRequest, VapiToolCallResponse } from './agent/tools/index.js';

const PORT = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(express.json());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// VAPI tool-call endpoint
app.post('/vapi/tools', async (req: Request, res: Response) => {
  const request = req.body as VapiToolCallRequest;

  console.log('[VAPI] Tool call received:', JSON.stringify(request, null, 2));

  const response = await handleToolCall(request);

  console.log('[VAPI] Tool call response:', JSON.stringify(response, null, 2));

  res.json(response);
});

// Start sync service if OpenMRS is configured
function startSyncService(): SyncService | null {
  try {
    const adapter = OpenMRSAdapter.fromEnv();
    const syncService = SyncService.fromEnv(adapter);
    syncService.start();
    return syncService;
  } catch (error) {
    console.warn('[Server] Sync service not started:', (error as Error).message);
    console.warn('[Server] Set OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD to enable MRS sync');
    return null;
  }
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Server] Elise Clone server running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] VAPI tools: POST http://localhost:${PORT}/vapi/tools`);
});

const syncService = startSyncService();

// Graceful shutdown
function shutdown() {
  console.log('[Server] Shutting down...');
  syncService?.stop();
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
