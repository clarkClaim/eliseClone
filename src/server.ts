import 'dotenv/config';
import { SyncService } from './sync/index.js';
import { OpenMRSAdapter } from './mrs/openmrs/adapter.js';

const PORT = process.env.PORT || 3000;

// Placeholder server - will be replaced with Express/Fastify
console.log(`Starting Elise Clone server...`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Port: ${PORT}`);

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

const syncService = startSyncService();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  syncService?.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  syncService?.stop();
  process.exit(0);
});

// Health check endpoint will go here
// VAPI webhook endpoint will go here
// Chat HTTP endpoint will go here

console.log('Server placeholder running. Implement HTTP server next.');
