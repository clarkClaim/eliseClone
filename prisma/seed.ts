import { loadEnv } from '../src/utils/env.js';
import { PrismaClient, ScheduleSource } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Load environment with profile support
const { profile } = loadEnv();
console.log(`Using profile: ${profile}`);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ============================================
// Test Providers
// ============================================

// Local test providers for development/testing
// NOTE: mrsId is null - these are local-only providers
// MRS providers are synced separately and have real MRS UUIDs
// The booking flow should use MRS-synced providers for MRS integration
const testProviders: { name: string; specialty: string }[] = [
  {
    name: 'Dr. Smith',
    specialty: 'General Practice',
  },
  {
    name: 'Dr. Jones',
    specialty: 'Internal Medicine',
  },
];

// ============================================
// Test Services (Appointment Types)
// ============================================

// Local test services for development/testing
// NOTE: mrsId is null - these are local-only services
// MRS services are synced separately and have real MRS UUIDs
// The booking flow should use MRS-synced services for MRS integration
const testServices: { name: string; durationMinutes: number; description: string }[] = [
  {
    name: 'General Checkup',
    durationMinutes: 30,
    description: 'Annual health checkup',
  },
  {
    name: 'Follow-up Visit',
    durationMinutes: 15,
    description: 'Follow-up consultation',
  },
  {
    name: 'New Patient Consultation',
    durationMinutes: 60,
    description: 'Initial consultation for new patients',
  },
];

// ============================================
// Schedule Templates
// ============================================

// Dr. Smith: M/W/F 9am-5pm
const drSmithSchedule = [
  { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
  { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
  { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Friday
];

// Dr. Jones: T/Th 8am-3pm
const drJonesSchedule = [
  { dayOfWeek: 2, startTime: '08:00', endTime: '15:00' }, // Tuesday
  { dayOfWeek: 4, startTime: '08:00', endTime: '15:00' }, // Thursday
];

// ============================================
// Test Patients
// ============================================

// Test patients with realistic but obviously fake data
// Uses 555 prefix for phone numbers (reserved for fictional use)
const testPatients = [
  {
    mrsId: 'test-patient-001',
    name: 'Sarah Johnson',
    givenName: 'Sarah',
    familyName: 'Johnson',
    dob: new Date('1985-03-15'),
    gender: 'female',
    phones: [
      { phone: '+15551234567', phoneType: 'mobile', isPrimary: true },
    ],
  },
  {
    mrsId: 'test-patient-002',
    name: 'Michael Chen',
    givenName: 'Michael',
    familyName: 'Chen',
    dob: new Date('1978-11-22'),
    gender: 'male',
    phones: [
      { phone: '+15552345678', phoneType: 'mobile', isPrimary: true },
      { phone: '+15559876543', phoneType: 'home', isPrimary: false },
    ],
  },
  {
    mrsId: 'test-patient-003',
    name: 'Emily Rodriguez',
    givenName: 'Emily',
    familyName: 'Rodriguez',
    dob: new Date('1992-07-08'),
    gender: 'female',
    phones: [
      { phone: '+15553456789', phoneType: 'mobile', isPrimary: true },
    ],
  },
  {
    mrsId: 'test-patient-004',
    name: 'James Wilson',
    givenName: 'James',
    familyName: 'Wilson',
    dob: new Date('1965-01-30'),
    gender: 'male',
    phones: [
      { phone: '+15554567890', phoneType: 'mobile', isPrimary: true },
    ],
  },
  {
    mrsId: 'test-patient-005',
    name: 'Lisa Thompson',
    givenName: 'Lisa',
    familyName: 'Thompson',
    dob: new Date('2001-09-12'),
    gender: 'female',
    phones: [
      { phone: '+15555678901', phoneType: 'mobile', isPrimary: true },
    ],
  },
  {
    mrsId: 'test-patient-006',
    name: 'Robert Martinez',
    givenName: 'Robert',
    familyName: 'Martinez',
    dob: new Date('1955-04-25'),
    gender: 'male',
    phones: [
      { phone: '+15556789012', phoneType: 'home', isPrimary: true },
      { phone: '+15550001111', phoneType: 'work', isPrimary: false },
    ],
  },
  {
    mrsId: 'test-patient-007',
    name: 'Amanda Foster',
    givenName: 'Amanda',
    familyName: 'Foster',
    dob: new Date('1988-12-03'),
    gender: 'female',
    // No phone numbers - for testing name+DOB fallback
    phones: [],
  },
  {
    mrsId: 'test-patient-008',
    name: 'David Kim',
    givenName: 'David',
    familyName: 'Kim',
    dob: new Date('1995-06-18'),
    gender: 'male',
    // No phone numbers - for testing name+DOB fallback
    phones: [],
  },
];

async function seedProviders() {
  console.log('\nSeeding providers...');

  const providers: { id: string; name: string; mrsId: string | null }[] = [];

  for (const provider of testProviders) {
    // Check if provider already exists by name (could have been synced from MRS)
    const existing = await prisma.provider.findFirst({
      where: { name: provider.name },
    });

    let upserted;
    if (existing) {
      // Update existing provider (preserve mrsId if synced from MRS)
      upserted = await prisma.provider.update({
        where: { id: existing.id },
        data: { specialty: provider.specialty },
      });
      console.log(`  ✓ Provider (existing): ${upserted.name} (mrsId: ${upserted.mrsId ?? 'local'})`);
    } else {
      // Create new local provider (no mrsId - will get one when synced to MRS)
      upserted = await prisma.provider.create({
        data: {
          name: provider.name,
          specialty: provider.specialty,
          // mrsId is null - will be set when/if pushed to MRS
        },
      });
      console.log(`  ✓ Provider (new local): ${upserted.name} (no mrsId - local only)`);
    }
    providers.push(upserted);
  }

  return providers;
}

async function seedServices() {
  console.log('\nSeeding services (appointment types)...');

  const services: { id: string; name: string; mrsId: string | null }[] = [];

  for (const service of testServices) {
    // Check if service already exists by name (could have been synced from MRS)
    const existing = await prisma.appointmentType.findFirst({
      where: { name: service.name },
    });

    let upserted;
    if (existing) {
      // Update existing service (preserve mrsId if synced from MRS)
      upserted = await prisma.appointmentType.update({
        where: { id: existing.id },
        data: {
          durationMinutes: service.durationMinutes,
          description: service.description,
        },
      });
      console.log(`  ✓ Service (existing): ${upserted.name} (mrsId: ${upserted.mrsId ?? 'local'})`);
    } else {
      // Create new local service (no mrsId - will get one when synced to MRS)
      upserted = await prisma.appointmentType.create({
        data: {
          name: service.name,
          durationMinutes: service.durationMinutes,
          description: service.description,
          // mrsId is null - will be set when/if pushed to MRS
        },
      });
      console.log(`  ✓ Service (new local): ${upserted.name} (no mrsId - local only)`);
    }
    services.push(upserted);
  }

  return services;
}

async function upsertScheduleTemplate(
  providerId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  slotDurationMins: number
) {
  // Check if template exists (handle null serviceId manually)
  const existing = await prisma.scheduleTemplate.findFirst({
    where: {
      providerId,
      serviceId: null,
      dayOfWeek,
      effectiveFrom: new Date('2024-01-01'),
    },
  });

  if (existing) {
    await prisma.scheduleTemplate.update({
      where: { id: existing.id },
      data: { startTime, endTime, slotDurationMins },
    });
  } else {
    await prisma.scheduleTemplate.create({
      data: {
        providerId,
        dayOfWeek,
        startTime,
        endTime,
        slotDurationMins,
        source: ScheduleSource.local,
        effectiveFrom: new Date('2024-01-01'),
      },
    });
  }
}

async function seedScheduleTemplates(
  providers: { id: string; name: string; mrsId: string | null }[]
) {
  console.log('\nSeeding schedule templates...');

  const drSmith = providers.find(p => p.name === 'Dr. Smith');
  const drJones = providers.find(p => p.name === 'Dr. Jones');

  if (!drSmith || !drJones) {
    console.log('  ⚠ Providers not found, skipping schedule templates');
    return;
  }

  // Dr. Smith: M/W/F 9am-5pm
  for (const schedule of drSmithSchedule) {
    await upsertScheduleTemplate(
      drSmith.id,
      schedule.dayOfWeek,
      schedule.startTime,
      schedule.endTime,
      30
    );
  }
  console.log(`  ✓ Dr. Smith: M/W/F 9am-5pm (30-min slots)`);

  // Dr. Jones: T/Th 8am-3pm
  for (const schedule of drJonesSchedule) {
    await upsertScheduleTemplate(
      drJones.id,
      schedule.dayOfWeek,
      schedule.startTime,
      schedule.endTime,
      30
    );
  }
  console.log(`  ✓ Dr. Jones: T/Th 8am-3pm (30-min slots)`);
}

async function seedPatients() {
  console.log('\nSeeding patients...');

  for (const patient of testPatients) {
    const { phones, ...patientData } = patient;

    // Upsert patient (idempotent - won't create duplicates)
    const upsertedPatient = await prisma.patient.upsert({
      where: { mrsId: patient.mrsId },
      update: {
        name: patientData.name,
        givenName: patientData.givenName,
        familyName: patientData.familyName,
        dob: patientData.dob,
        gender: patientData.gender,
      },
      create: patientData,
    });

    console.log(`  ✓ Patient: ${upsertedPatient.name} (${upsertedPatient.mrsId})`);

    // Upsert phone numbers
    for (const phoneData of phones) {
      await prisma.patientPhone.upsert({
        where: {
          patientId_phone: {
            patientId: upsertedPatient.id,
            phone: phoneData.phone,
          },
        },
        update: {
          phoneType: phoneData.phoneType,
          isPrimary: phoneData.isPrimary,
        },
        create: {
          patientId: upsertedPatient.id,
          phone: phoneData.phone,
          phoneType: phoneData.phoneType,
          isPrimary: phoneData.isPrimary,
        },
      });
      console.log(`    - Phone: ${phoneData.phone} (${phoneData.phoneType})`);
    }

    if (phones.length === 0) {
      console.log(`    - No phone numbers (for name+DOB fallback testing)`);
    }
  }
}

async function backfillPatientSyncStatus() {
  console.log('\nBackfilling patient sync status...');

  // Patients with non-local mrsId are considered already synced from MRS
  // Local patients have mrsId starting with 'local-'
  const result = await prisma.patient.updateMany({
    where: {
      mrsId: { not: { startsWith: 'local-' } },
      syncedToMrs: false,
    },
    data: {
      syncedToMrs: true,
      syncedToMrsAt: new Date(),
    },
  });

  console.log(`  ✓ Marked ${result.count} MRS-synced patients as syncedToMrs=true`);
}

async function main() {
  console.log('='.repeat(50));
  console.log('Seeding database with test data...');
  console.log('='.repeat(50));

  // Seed in order: providers, services, schedule templates, patients
  const providers = await seedProviders();
  await seedServices();
  await seedScheduleTemplates(providers);
  await seedPatients();

  // Backfill sync status for patients that came from MRS
  await backfillPatientSyncStatus();

  console.log('\n' + '='.repeat(50));
  console.log('Seed complete!');
  console.log('='.repeat(50));

  console.log('\nTest data summary:');
  console.log('  Providers:');
  console.log('    - Dr. Smith: M/W/F 9am-5pm');
  console.log('    - Dr. Jones: T/Th 8am-3pm');
  console.log('  Services:');
  console.log('    - General Checkup (30 min)');
  console.log('    - Follow-up Visit (15 min)');
  console.log('    - New Patient Consultation (60 min)');
  console.log('  Patients:');
  console.log(`    - ${testPatients.length} test patients`);
  console.log('    - DOB range: 1955-2001');
  console.log('    - 2 with multiple phones, 2 without phones');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
