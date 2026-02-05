import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../utils/env.js';

// Ensure env is loaded before checking DATABASE_URL
loadEnv();

// Global singleton for Prisma client
// Prevents multiple instances in development with hot reload
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const adapter = new PrismaPg({ connectionString });

  // Prisma query logs are noisy - enable with PRISMA_LOG_QUERIES=true
  const logQueries = process.env.PRISMA_LOG_QUERIES === 'true';
  const logConfig: ('query' | 'error' | 'warn')[] = logQueries
    ? ['query', 'error', 'warn']
    : ['error', 'warn'];

  return new PrismaClient({
    adapter,
    log: logConfig,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
