import express, { Request, Response } from 'express';
import { SyncService } from './sync/index.js';
import { OpenMRSAdapter } from './mrs/adapters/openmrs/adapter.js';
import { OpenEMRAdapter } from './mrs/adapters/openemr/adapter.js';
import type { MRSAdapter } from './mrs/adapter.js';
import { handleToolCall, setMRSAdapter, VapiToolCallRequest, VapiToolCallResponse } from './agent/tools/index.js';
import { loadEnv } from './utils/env.js';

// Load environment with profile support
const { profile } = loadEnv();
console.log(`[Server] Profile: ${profile}`);

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

// Initialize MRS adapter for sync and booking based on profile
function initializeMRSAdapter(): MRSAdapter | null {
  try {
    let adapter: MRSAdapter;

    if (profile === 'emr') {
      adapter = OpenEMRAdapter.fromEnv();
      console.log('[Server] OpenEMR adapter initialized');
    } else {
      // Default to OpenMRS (profile === 'mrs' or any other)
      adapter = OpenMRSAdapter.fromEnv();
      console.log('[Server] OpenMRS adapter initialized');
    }

    // Share adapter with booking tools
    setMRSAdapter(adapter);
    console.log('[Server] MRS adapter ready for booking');
    return adapter;
  } catch (error) {
    console.warn('[Server] MRS adapter not initialized:', (error as Error).message);
    console.warn('[Server] Booking will work in local-only mode (queued for sync)');
    setMRSAdapter(null);
    return null;
  }
}

// Start sync service if MRS adapter is configured
function startSyncService(adapter: MRSAdapter | null): SyncService | null {
  if (!adapter) return null;

  try {
    const syncService = SyncService.fromEnv(adapter);
    syncService.start();
    return syncService;
  } catch (error) {
    console.warn('[Server] Sync service not started:', (error as Error).message);
    return null;
  }
}

// Start server
// Initialize MRS adapter and sync service
const mrsAdapter = initializeMRSAdapter();
const syncService = startSyncService(mrsAdapter);

const server = app.listen(PORT, () => {
  console.log(`[Server] Elise Clone server running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] VAPI tools: POST http://localhost:${PORT}/vapi/tools`);
  console.log(`[Server] MRS integration: ${mrsAdapter ? 'enabled' : 'disabled (local-only mode)'}`);
});

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
