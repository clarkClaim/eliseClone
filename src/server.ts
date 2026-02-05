import express, { Request, Response } from 'express';
import {
  SyncScheduler,
  initialSync,
  getReadinessState,
  getSyncStatus,
  setDegradedMode,
} from './sync/index.js';
import { OpenMRSAdapter } from './mrs/adapters/openmrs/adapter.js';
import { handleToolCall, setMRSAdapter, VapiToolCallRequest } from './agent/tools/index.js';
import { loadEnv } from './utils/env.js';

// Load environment with profile support
const { profile } = loadEnv();
console.log(`[Server] Profile: ${profile}`);

const PORT = process.env.PORT || 3000;
const STARTUP_TIMEOUT_MS = parseInt(process.env.STARTUP_TIMEOUT_MS || '300000', 10); // 5 minutes default
const app = express();

// Middleware
app.use(express.json());

// Health endpoint with readiness support
app.get('/health', async (req: Request, res: Response) => {
  const readiness = getReadinessState();
  const checkReady = req.query.ready === 'true';

  // If ?ready=true is specified, return 503 if not ready
  if (checkReady && !readiness.ready) {
    res.status(503).json({
      status: 'not_ready',
      ready: false,
      degraded: readiness.degraded,
      degradedReason: readiness.degradedReason,
      initialSyncComplete: readiness.initialSyncComplete,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
    return;
  }

  // Get sync status for detailed health response
  let syncStatus: Record<string, { count: number; lastSync: Date | null }> | undefined;
  try {
    syncStatus = await getSyncStatus();
  } catch {
    // Ignore errors getting sync status
  }

  res.json({
    status: 'ok',
    ready: readiness.ready,
    degraded: readiness.degraded,
    degradedReason: readiness.degradedReason,
    sync: {
      initialSyncComplete: readiness.initialSyncComplete,
      entities: syncStatus,
    },
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

// Initialize MRS adapter for sync and booking
function initializeMRSAdapter(): OpenMRSAdapter | null {
  try {
    const adapter = OpenMRSAdapter.fromEnv();
    // Share adapter with booking tools
    setMRSAdapter(adapter);
    console.log('[Server] MRS adapter initialized for booking');
    return adapter;
  } catch (error) {
    console.warn('[Server] MRS adapter not initialized:', (error as Error).message);
    console.warn('[Server] Booking will work in local-only mode (queued for sync)');
    setMRSAdapter(null);
    return null;
  }
}

// Start sync scheduler (replaces legacy SyncService)
function startSyncScheduler(adapter: OpenMRSAdapter | null): SyncScheduler | null {
  if (!adapter) return null;

  try {
    const scheduler = new SyncScheduler(adapter);
    scheduler.start();
    console.log('[Server] Sync scheduler started');
    return scheduler;
  } catch (error) {
    console.warn('[Server] Sync scheduler not started:', (error as Error).message);
    return null;
  }
}

// Main startup sequence
async function startServer() {
  // Initialize MRS adapter
  const mrsAdapter = initializeMRSAdapter();

  // If MRS adapter is available, perform initial sync before accepting requests
  if (mrsAdapter) {
    console.log('[Server] Performing initial sync before accepting requests...');

    try {
      const syncResult = await initialSync(mrsAdapter, {
        timeoutMs: STARTUP_TIMEOUT_MS,
      });

      if (!syncResult.success) {
        if (syncResult.validationErrors && syncResult.validationErrors.length > 0) {
          // Validation failed - exit with error
          console.error('[Server] FATAL: Essential data validation failed');
          for (const error of syncResult.validationErrors) {
            console.error(`  - ${error}`);
          }
          console.error('[Server] Cannot start without essential data. Exiting.');
          process.exit(1);
        }

        if (syncResult.degraded) {
          // Timeout - continue in degraded mode
          console.warn('[Server] Starting in degraded mode due to sync timeout');
        }
      } else {
        console.log(`[Server] Initial sync completed successfully in ${syncResult.durationMs}ms`);
      }
    } catch (error) {
      // MRS unavailable - enter degraded mode
      console.error('[Server] Initial sync failed:', error);
      setDegradedMode(`Initial sync failed: ${(error as Error).message}`);
    }
  }

  // Start sync scheduler for ongoing sync
  const syncScheduler = startSyncScheduler(mrsAdapter);

  // Start HTTP server
  const server = app.listen(PORT, () => {
    const readiness = getReadinessState();
    console.log(`[Server] Elise Clone server running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    console.log(`[Server] Readiness probe: http://localhost:${PORT}/health?ready=true`);
    console.log(`[Server] VAPI tools: POST http://localhost:${PORT}/vapi/tools`);
    console.log(`[Server] MRS integration: ${mrsAdapter ? 'enabled' : 'disabled (local-only mode)'}`);
    console.log(`[Server] Status: ${readiness.ready ? (readiness.degraded ? 'DEGRADED' : 'READY') : 'NOT READY'}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[Server] Shutting down...');
    syncScheduler?.stop();
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start the server
startServer().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
