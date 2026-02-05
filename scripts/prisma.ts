#!/usr/bin/env tsx
/**
 * Prisma CLI wrapper that loads profile-aware environment.
 * Usage: pnpm prisma <command> [args...]
 * Example: pnpm prisma migrate dev
 */
import { loadEnv } from '../src/utils/env.js';
import { spawn } from 'child_process';

// Load profile-aware environment (sets DATABASE_URL from DB_PORT)
const { profile } = loadEnv();
console.log(`[${profile}] DATABASE_URL=${process.env.DATABASE_URL}\n`);

// Pass all args to prisma
const args = process.argv.slice(2);
const child = spawn('pnpm', ['exec', 'prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
