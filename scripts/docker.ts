#!/usr/bin/env tsx
/**
 * Docker Compose wrapper that loads profile-aware environment.
 * Usage: pnpm docker <command> [args...]
 * Example: pnpm docker up -d
 */
import { loadEnv } from '../src/utils/env.js';
import { spawn } from 'child_process';

// Load profile-aware environment
const { profile } = loadEnv();
console.log(`[${profile}] DB_PORT=${process.env.DB_PORT}\n`);

// Pass all args to docker compose
const args = process.argv.slice(2);
const child = spawn('docker', ['compose', ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
