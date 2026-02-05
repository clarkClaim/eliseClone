/**
 * Setup Availability Script
 *
 * Lists providers and creates schedule templates for ones with real names.
 * Usage:
 *   pnpm run setup:availability           # List all providers
 *   pnpm run setup:availability --create  # Create schedules for known providers
 */

import { loadEnv } from '../src/utils/env.js';
loadEnv();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface ScheduleTemplate {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Schedules for known providers
const PROVIDER_SCHEDULES: Record<string, ScheduleTemplate[]> = {
  // Match by partial name (case-insensitive)
  'dr. jones': [
    { dayOfWeek: 2, startTime: '08:00', endTime: '15:00' }, // Tuesday
    { dayOfWeek: 4, startTime: '08:00', endTime: '15:00' }, // Thursday
  ],
  'dr. smith': [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Friday
  ],
  'nurse': [
    { dayOfWeek: 1, startTime: '08:00', endTime: '16:00' }, // Monday
    { dayOfWeek: 2, startTime: '08:00', endTime: '16:00' }, // Tuesday
    { dayOfWeek: 3, startTime: '08:00', endTime: '16:00' }, // Wednesday
    { dayOfWeek: 4, startTime: '08:00', endTime: '16:00' }, // Thursday
    { dayOfWeek: 5, startTime: '08:00', endTime: '16:00' }, // Friday
  ],
};

function isKnownProvider(name: string): boolean {
  const lower = name.toLowerCase();
  return !lower.includes('unknown') && !lower.includes('placeholder') && !lower.includes('admin');
}

function getScheduleForProvider(name: string): ScheduleTemplate[] | null {
  const lower = name.toLowerCase();
  for (const [key, schedule] of Object.entries(PROVIDER_SCHEDULES)) {
    if (lower.includes(key)) {
      return schedule;
    }
  }
  return null;
}

async function listProviders(): Promise<void> {
  console.log('\n=== Providers in Database ===\n');

  const providers = await prisma.provider.findMany({
    include: {
      scheduleTemplates: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log('ID                                    | Name                          | Schedules | Known');
  console.log('--------------------------------------|-------------------------------|-----------|------');

  for (const provider of providers) {
    const id = provider.id;
    const name = provider.name.substring(0, 29).padEnd(29);
    const schedules = String(provider.scheduleTemplates.length).padEnd(9);
    const known = isKnownProvider(provider.name) ? 'Yes' : 'No';
    console.log(`${id} | ${name} | ${schedules} | ${known}`);
  }

  console.log(`\nTotal: ${providers.length} providers`);

  const knownWithoutSchedules = providers.filter(
    p => isKnownProvider(p.name) && p.scheduleTemplates.length === 0
  );

  if (knownWithoutSchedules.length > 0) {
    console.log('\n⚠️  Known providers without schedules:');
    for (const p of knownWithoutSchedules) {
      console.log(`   - ${p.name}`);
    }
    console.log('\nRun with --create to add schedules for these providers.');
  }
}

async function createSchedules(): Promise<void> {
  console.log('\n=== Creating Schedules for Known Providers ===\n');

  const providers = await prisma.provider.findMany({
    include: {
      scheduleTemplates: true,
    },
  });

  let created = 0;

  for (const provider of providers) {
    if (!isKnownProvider(provider.name)) {
      continue;
    }

    const schedule = getScheduleForProvider(provider.name);
    if (!schedule) {
      console.log(`⚠️  No schedule defined for: ${provider.name}`);
      continue;
    }

    // Skip if already has schedules
    if (provider.scheduleTemplates.length > 0) {
      console.log(`✓ ${provider.name} already has ${provider.scheduleTemplates.length} schedules`);
      continue;
    }

    console.log(`Creating schedules for: ${provider.name}`);

    for (const s of schedule) {
      await prisma.scheduleTemplate.create({
        data: {
          providerId: provider.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          slotDurationMins: 30,
          effectiveFrom: new Date('2020-01-01'),
          source: 'local',
        },
      });
      console.log(`   + ${DAY_NAMES[s.dayOfWeek]}: ${s.startTime} - ${s.endTime}`);
      created++;
    }
  }

  console.log(`\n✓ Created ${created} schedule templates`);
}

async function main(): Promise<void> {
  try {
    const createMode = process.argv.includes('--create');

    if (createMode) {
      await createSchedules();
    } else {
      await listProviders();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
