#!/usr/bin/env tsx
/**
 * Quickstart script - gets a fresh clone up and running.
 *
 * Usage:
 *   pnpm quickstart          # Normal setup
 *   pnpm quickstart --reset  # Full reset (destroys data) then setup
 */
import { loadEnv } from '../src/utils/env.js';
import { spawn, execSync } from 'child_process';
import * as readline from 'readline';

const args = process.argv.slice(2);
const isReset = args.includes('--reset');

// Colors for terminal output
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function log(msg: string) {
  console.log(msg);
}

function step(num: number, msg: string) {
  console.log(`\n${cyan(`[${num}]`)} ${bold(msg)}`);
}

function success(msg: string) {
  console.log(green(`    ✓ ${msg}`));
}

function warn(msg: string) {
  console.log(yellow(`    ⚠ ${msg}`));
}

function error(msg: string) {
  console.log(red(`    ✗ ${msg}`));
}

function run(cmd: string, description: string): boolean {
  log(`    Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    success(description);
    return true;
  } catch (e) {
    error(`Failed: ${description}`);
    return false;
  }
}

function runQuiet(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log(bold('\n🏥 Elise Clone - Quickstart\n'));

  // Load environment
  let profile: string;
  try {
    const env = loadEnv();
    profile = env.profile;
    log(`Profile: ${cyan(profile)}`);
    log(`DB Port: ${cyan(process.env.DB_PORT || '5432')}`);
    log(`Server Port: ${cyan(process.env.PORT || '3000')}`);
  } catch (e) {
    error('Failed to load environment. Make sure .env exists with PROFILE set.');
    console.log('\nCreate .env with at minimum:');
    console.log('  PROFILE=mrs');
    console.log('  VAPI_API_KEY=your-key-here');
    process.exit(1);
  }

  // Check for VAPI_API_KEY
  if (!process.env.VAPI_API_KEY) {
    warn('VAPI_API_KEY not set in .env - VAPI setup will be skipped');
  }

  // Reset if requested
  if (isReset) {
    step(0, 'Resetting everything (--reset flag)');
    run('pnpm docker down -v', 'Stopped containers and removed volumes');
  }

  // Step 1: Start database
  step(1, 'Starting PostgreSQL');
  if (!run('pnpm docker up -d', 'Database container started')) {
    process.exit(1);
  }

  // Wait for database to be ready
  log('    Waiting for database to be ready...');
  let dbReady = false;
  for (let i = 0; i < 30; i++) {
    const result = runQuiet(`pnpm docker exec postgres pg_isready -U postgres 2>/dev/null`);
    if (result?.includes('accepting connections')) {
      dbReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (dbReady) {
    success('Database is ready');
  } else {
    warn('Database may still be starting - continuing anyway');
  }

  // Step 2: Generate Prisma client
  step(2, 'Generating Prisma client');
  if (!run('pnpm db:generate', 'Prisma client generated')) {
    process.exit(1);
  }

  // Step 3: Run migrations
  step(3, 'Running database migrations');
  if (!run('pnpm db:migrate', 'Migrations applied')) {
    process.exit(1);
  }

  // Step 4: VAPI setup (if key is set)
  if (process.env.VAPI_API_KEY) {
    step(4, 'Deploying VAPI assistant config');
    run('pnpm vapi:setup', 'VAPI assistant configured');
  } else {
    step(4, 'Skipping VAPI setup (no API key)');
    warn('Set VAPI_API_KEY in .env and run: pnpm vapi:setup');
  }

  // Step 5: Ngrok setup instructions
  step(5, 'Tunnel setup for VAPI webhooks');

  const ngrokDomain = process.env.NGROK_DOMAIN;
  const port = process.env.PORT || '3000';

  if (ngrokDomain) {
    log(`    Your ngrok domain: ${cyan(ngrokDomain)}`);
    log(`    Start tunnel with: ${cyan('pnpm tunnel')}`);
  } else {
    log('    No NGROK_DOMAIN set. You have two options:\n');
    log('    Option A: Use a reserved ngrok domain (recommended)');
    log('      1. Get a free domain at https://dashboard.ngrok.com/domains');
    log('      2. Add to .env: NGROK_DOMAIN=your-domain.ngrok-free.app');
    log(`      3. Run: ${cyan('pnpm tunnel')}\n`);
    log('    Option B: Use a temporary ngrok URL');
    log(`      1. Run: ${cyan(`ngrok http ${port}`)}`);
    log('      2. Copy the https URL and update VAPI assistant webhook URL');
  }

  // Done!
  console.log(bold('\n✅ Setup complete!\n'));
  console.log('Next steps:');
  console.log(`  1. Start the server:     ${cyan('pnpm dev')}`);
  console.log(`  2. Start ngrok tunnel:   ${cyan('pnpm tunnel')} (in another terminal)`);
  console.log(`  3. Make a test call to your VAPI phone number\n`);

  console.log('Useful commands:');
  console.log(`  ${cyan('pnpm db:studio')}    - Browse database`);
  console.log(`  ${cyan('pnpm vapi:logs')}    - View recent calls`);
  console.log(`  ${cyan('pnpm db:seed')}      - Add test patients (optional)\n`);
}

main().catch(console.error);
