// Test MRS booking against O3 demo
// Run with: pnpm exec tsx scripts/test-mrs-booking.ts

import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { bookAppointmentByDatetime } from '../src/scheduling/index.js';
import { OpenMRSAdapter } from '../src/mrs/adapters/openmrs/adapter.js';

async function main() {
  console.log('='.repeat(60));
  console.log('MRS BOOKING TEST - Against O3 Demo');
  console.log('='.repeat(60));

  // Connect to OpenMRS
  console.log('\nConnecting to OpenMRS...');
  const adapter = OpenMRSAdapter.fromEnv();
  await adapter.connect();
  console.log('  ✓ Connected');

  // Get schedule config to find a valid service UUID
  console.log('\nFetching services from O3...');
  const configs = await adapter.getScheduleConfig();
  console.log(`  Found ${configs.length} services`);

  if (configs.length === 0) {
    console.log('  ERROR: No services found in O3');
    return;
  }

  const mrsService = configs[0];
  console.log(`  Using service: ${mrsService.serviceName} (${mrsService.serviceId})`);

  // List O3 providers
  console.log('\nFetching providers from O3...');
  const mrsProviders = await adapter.getProviders();
  console.log(`  Found ${mrsProviders.length} providers`);
  for (const p of mrsProviders.slice(0, 5)) {
    console.log(`    - ${p.name} (${p.mrsId})`);
  }
  if (mrsProviders.length > 5) {
    console.log(`    ... and ${mrsProviders.length - 5} more`);
  }

  // Search for a patient in O3
  console.log('\nSearching for patients in O3 (searching "John")...');
  const mrsPatients = await adapter.searchPatients({ name: 'John' });
  console.log(`  Found ${mrsPatients.length} patient(s) in O3`);

  if (mrsPatients.length === 0) {
    console.log('  ERROR: No patients found in O3');
    return;
  }

  const mrsPatient = mrsPatients[0];
  console.log(`  O3 patient: ${mrsPatient.name} (${mrsPatient.mrsId})`);

  // Find matching LOCAL patient (should exist from sync!)
  console.log('\nLooking for synced patient locally...');
  const localPatient = await prisma.patient.findUnique({
    where: { mrsId: mrsPatient.mrsId },
  });

  if (!localPatient) {
    console.log(`  ERROR: Patient with mrsId ${mrsPatient.mrsId} not found locally`);
    console.log('  This patient needs to be synced first');
    return;
  }

  console.log(`  ✓ Found local patient: ${localPatient.name} (${localPatient.id})`);

  // Find or create a service with matching mrsId
  console.log('\nLooking for matching service locally...');
  let localService = await prisma.appointmentType.findUnique({
    where: { mrsId: mrsService.serviceId },
  });

  if (!localService) {
    console.log(`  Service not synced locally, creating temporary one...`);
    localService = await prisma.appointmentType.create({
      data: {
        mrsId: mrsService.serviceId,
        name: mrsService.serviceName,
        durationMinutes: mrsService.durationMins ?? 30,
      },
    });
    console.log(`  ✓ Created: ${localService.name}`);
  } else {
    console.log(`  ✓ Found: ${localService.name}`);
  }

  // Get a provider - use real O3 provider if available
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayOfWeek = tomorrow.getDay();

  // Try to find or create a local provider with a real O3 mrsId
  let localProvider: Awaited<ReturnType<typeof prisma.provider.findFirst>>;

  if (mrsProviders.length > 0) {
    // Use first O3 provider
    const o3Provider = mrsProviders[0];
    console.log(`\nUsing O3 provider: ${o3Provider.name} (${o3Provider.mrsId})`);

    // Find or create local provider with this mrsId
    localProvider = await prisma.provider.findUnique({ where: { mrsId: o3Provider.mrsId } });
    if (!localProvider) {
      console.log('  Creating local provider record...');
      localProvider = await prisma.provider.create({
        data: {
          mrsId: o3Provider.mrsId,
          name: o3Provider.name,
          specialty: 'General',
        },
      });
    } else {
      console.log(`  ✓ Found existing local provider: ${localProvider.name}`);
    }

    // Ensure schedule templates exist for this provider
    const existingTemplates = await prisma.scheduleTemplate.count({
      where: { providerId: localProvider.id },
    });
    if (existingTemplates === 0) {
      console.log('  Creating schedule templates for provider...');
      for (const dow of [1, 2, 3, 4, 5]) {
        await prisma.scheduleTemplate.create({
          data: {
            providerId: localProvider.id,
            dayOfWeek: dow,
            startTime: '08:00',
            endTime: '17:00',
            slotDurationMins: 30,
            source: 'local',
            effectiveFrom: new Date('2024-01-01'),
          },
        });
      }
      console.log('  ✓ Created schedule templates (M-F 8am-5pm)');
    }
  } else {
    // Fallback to test provider
    const providerMrsId = [2, 4].includes(dayOfWeek) ? 'test-provider-002' : 'test-provider-001';
    localProvider = await prisma.provider.findFirst({ where: { mrsId: providerMrsId } });
    if (!localProvider) {
      console.log('  ERROR: No provider found');
      return;
    }
    console.log(`\nUsing local test provider: ${localProvider.name}`);
  }

  // Book appointment for tomorrow at 10am
  tomorrow.setHours(10, 0, 0, 0);

  const endTime = new Date(tomorrow);
  endTime.setHours(10, 30, 0, 0);

  console.log('\n' + '='.repeat(60));
  console.log('BOOKING APPOINTMENT');
  console.log('='.repeat(60));
  console.log(`  Date: ${tomorrow.toLocaleDateString()}`);
  console.log(`  Time: ${tomorrow.toLocaleTimeString()}`);
  console.log(`  Patient: ${localPatient.name} (mrsId: ${localPatient.mrsId})`);
  console.log(`  Service: ${localService.name} (mrsId: ${localService.mrsId})`);

  try {
    const result = await bookAppointmentByDatetime(adapter, {
      patientId: localPatient.id,
      providerId: localProvider.id,
      serviceId: localService.id,
      startTime: tomorrow,
      endTime: endTime,
    });

    console.log('\n' + '-'.repeat(60));
    console.log('RESULT:');
    console.log('-'.repeat(60));
    console.log(`  Success: ${result.success ? '✓ YES' : '✗ NO'}`);
    console.log(`  Sync status: ${result.syncStatus}`);
    console.log(`  Message: ${result.message}`);

    if (result.mrsId) {
      console.log(`  MRS Appointment ID: ${result.mrsId}`);
      console.log('  ^^^ This means it was created in O3!');
    }
    if (result.appointmentId) {
      console.log(`  Local Appointment ID: ${result.appointmentId}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.confirmation) {
      console.log('  Confirmation:');
      console.log(`    Date: ${result.confirmation.date}`);
      console.log(`    Time: ${result.confirmation.time}`);
      console.log(`    Provider: ${result.confirmation.provider}`);
      console.log(`    Service: ${result.confirmation.service}`);
    }

    // Cleanup local appointment (leave O3 appointment - it's a demo)
    if (result.appointmentId) {
      console.log('\nCleaning up local appointment...');
      await prisma.appointment.delete({ where: { id: result.appointmentId } });
      await prisma.job.deleteMany({
        where: {
          type: 'push_appointment_to_mrs',
          payload: { path: ['appointmentId'], equals: result.appointmentId },
        },
      });
      console.log('  ✓ Local appointment deleted');
      console.log('  (O3 appointment left in place - it\'s a demo instance)');
    }

  } catch (error) {
    console.log('\nBooking failed with error:');
    console.log(error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(console.error);
