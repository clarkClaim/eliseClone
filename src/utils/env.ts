import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Load environment with profile support.
 *
 * 1. Loads .env (secrets + PROFILE)
 * 2. Checks PROFILE is set
 * 3. Loads config/profiles/${PROFILE}.env (overrides)
 * 4. Constructs DATABASE_URL from DB_PORT if not set
 *
 * Call this at the top of any script that needs env vars.
 */
export function loadEnv(): { profile: string } {
  // Find root directory by looking for package.json
  const currentFile = fileURLToPath(import.meta.url);
  let dir = path.dirname(currentFile);
  let rootDir = dir;

  // Walk up until we find package.json
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      rootDir = dir;
      break;
    }
    dir = path.dirname(dir);
  }

  // Load base .env
  dotenv.config({ path: path.join(rootDir, '.env') });

  // Check for PROFILE
  const profile = process.env.PROFILE;
  if (!profile) {
    console.error('ERROR: PROFILE environment variable is required');
    console.error('Set PROFILE=mrs or PROFILE=emr in your .env file');
    process.exit(1);
  }

  // Load profile-specific config
  const profilePath = path.join(rootDir, 'config', 'profiles', `${profile}.env`);
  dotenv.config({ path: profilePath, override: true });

  // Construct DATABASE_URL if not set
  if (!process.env.DATABASE_URL) {
    const dbPort = process.env.DB_PORT || '5432';
    process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${dbPort}/elise_clone`;
  }

  return { profile };
}
