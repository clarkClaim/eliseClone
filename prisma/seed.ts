import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

async function main() {
  console.log('Seeding database with test patients...');

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

  console.log(`\nSeeded ${testPatients.length} test patients.`);
  console.log('\nTest data summary:');
  console.log('  - DOB range: 1955-2001 (46 years span)');
  console.log('  - Patients with multiple phones: 2 (Michael Chen, Robert Martinez)');
  console.log('  - Patients without phones: 2 (Amanda Foster, David Kim)');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
