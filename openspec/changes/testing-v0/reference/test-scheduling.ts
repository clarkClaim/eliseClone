// Test script for scheduling abstraction redesign
// Run with: pnpm exec tsx scripts/test-scheduling.ts

import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import {
  computeAvailability,
  getScheduleTemplatesForDay,
  checkLocalConflicts,
  bookAppointmentByDatetime,
  isWithinSchedule,
} from '../src/scheduling/index.js';
import { OpenMRSAdapter } from '../src/mrs/adapters/openmrs/adapter.js';

// ============================================
// Helpers
// ============================================

function getNextWeekday(targetDayOfWeek: number): Date {
  const today = new Date();
  const currentDay = today.getDay();
  const daysUntilTarget = (targetDayOfWeek - currentDay + 7) % 7;
  const result = new Date(today);
  result.setDate(today.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ============================================
// Test Functions
// ============================================

async function testScheduleTemplates() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Schedule Templates');
  console.log('='.repeat(60));

  // Monday = 1, Dr. Smith should work
  const monday = getNextWeekday(1);
  console.log(`\nChecking templates for Monday (${monday.toLocaleDateString()}):`);

  const mondayTemplates = await getScheduleTemplatesForDay(monday);
  console.log(`  Found ${mondayTemplates.length} template(s)`);
  for (const t of mondayTemplates) {
    const provider = await prisma.provider.findUnique({ where: { id: t.providerId } });
    console.log(`  - ${provider?.name}: ${t.startTime}-${t.endTime} (${t.slotDurationMins}min slots)`);
  }

  // Tuesday = 2, Dr. Jones should work
  const tuesday = getNextWeekday(2);
  console.log(`\nChecking templates for Tuesday (${tuesday.toLocaleDateString()}):`);

  const tuesdayTemplates = await getScheduleTemplatesForDay(tuesday);
  console.log(`  Found ${tuesdayTemplates.length} template(s)`);
  for (const t of tuesdayTemplates) {
    const provider = await prisma.provider.findUnique({ where: { id: t.providerId } });
    console.log(`  - ${provider?.name}: ${t.startTime}-${t.endTime} (${t.slotDurationMins}min slots)`);
  }

  // Saturday = 6, nobody should work
  const saturday = getNextWeekday(6);
  console.log(`\nChecking templates for Saturday (${saturday.toLocaleDateString()}):`);

  const saturdayTemplates = await getScheduleTemplatesForDay(saturday);
  console.log(`  Found ${saturdayTemplates.length} template(s) (expected: 0)`);

  return { monday, tuesday };
}

async function testComputeAvailability(monday: Date) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Compute Availability');
  console.log('='.repeat(60));

  console.log(`\nComputing availability for Monday (${monday.toLocaleDateString()}):`);

  const availability = await computeAvailability(monday);
  console.log(`  Total available slots: ${availability.length}`);

  // Show first 5 and last 5
  if (availability.length > 0) {
    console.log('\n  First 5 slots:');
    for (const slot of availability.slice(0, 5)) {
      console.log(`    ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`);
    }
    if (availability.length > 10) {
      console.log(`    ... (${availability.length - 10} more slots) ...`);
    }
    if (availability.length > 5) {
      console.log('  Last 5 slots:');
      for (const slot of availability.slice(-5)) {
        console.log(`    ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`);
      }
    }
  }

  return availability;
}

async function testConflictDetection(monday: Date) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Local Conflict Detection');
  console.log('='.repeat(60));

  // Get a provider
  const drSmith = await prisma.provider.findFirst({ where: { mrsId: 'test-provider-001' } });
  if (!drSmith) {
    console.log('  ERROR: Dr. Smith not found');
    return;
  }

  // Test time within schedule
  const testStart = new Date(monday);
  testStart.setHours(10, 0, 0, 0);
  const testEnd = new Date(monday);
  testEnd.setHours(10, 30, 0, 0);

  console.log(`\nChecking if ${formatTime(testStart)}-${formatTime(testEnd)} is within Dr. Smith's schedule:`);
  const withinSchedule = await isWithinSchedule(testStart, testEnd, drSmith.id);
  console.log(`  Result: ${withinSchedule ? '✓ YES' : '✗ NO'}`);

  console.log(`\nChecking for local conflicts at ${formatTime(testStart)}-${formatTime(testEnd)}:`);
  const conflict = await checkLocalConflicts(testStart, testEnd, drSmith.id);
  console.log(`  Has conflict: ${conflict.hasConflict ? '✗ YES' : '✓ NO'}`);
  if (conflict.reason) {
    console.log(`  Reason: ${conflict.reason}`);
  }
}

async function testOpenMRSAdapter() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: OpenMRS Adapter');
  console.log('='.repeat(60));

  // Check if OpenMRS env vars are set
  if (!process.env.OPENMRS_URL) {
    console.log('\n  OPENMRS_URL not set - skipping MRS tests');
    return null;
  }

  console.log('\nConnecting to OpenMRS...');
  const adapter = OpenMRSAdapter.fromEnv();

  try {
    await adapter.connect();
    console.log('  ✓ Connected successfully');

    // Health check
    const health = await adapter.healthCheck();
    console.log(`  Health: ${health.healthy ? 'healthy' : 'unhealthy'} (${health.latencyMs}ms)`);
    console.log(`  Appointment module: ${adapter.hasAppointmentSupport() ? 'available' : 'not available'}`);

    // Get schedule config
    if (adapter.hasAppointmentSupport()) {
      console.log('\nFetching schedule config from MRS...');
      const configs = await adapter.getScheduleConfig();
      console.log(`  Found ${configs.length} service configuration(s)`);
      for (const config of configs.slice(0, 3)) {
        console.log(`  - ${config.serviceName}: ${config.startTime || 'N/A'}-${config.endTime || 'N/A'}`);
      }
      if (configs.length > 3) {
        console.log(`  ... and ${configs.length - 3} more`);
      }

      // Test conflict check
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(10, 30, 0, 0);

      console.log(`\nChecking MRS conflicts for ${tomorrow.toISOString().split('T')[0]} 10:00-10:30...`);
      const mrsConflict = await adapter.checkConflicts({
        startDateTime: tomorrow,
        endDateTime: tomorrowEnd,
      });
      console.log(`  Has conflict: ${mrsConflict.hasConflict ? 'YES' : 'NO'}`);
      if (mrsConflict.conflictingAppointments) {
        console.log(`  Conflicting appointments: ${mrsConflict.conflictingAppointments.length}`);
      }
    }

    return adapter;
  } catch (error) {
    console.log(`  ✗ Connection failed: ${error}`);
    return null;
  }
}

async function testLocalBooking(monday: Date) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Local Booking (no MRS)');
  console.log('='.repeat(60));

  // Get test data
  const patient = await prisma.patient.findFirst({ where: { mrsId: 'test-patient-001' } });
  const provider = await prisma.provider.findFirst({ where: { mrsId: 'test-provider-001' } });
  const service = await prisma.appointmentType.findFirst({ where: { mrsId: 'test-service-001' } });

  if (!patient || !provider || !service) {
    console.log('  ERROR: Missing test data');
    console.log(`    Patient: ${patient ? '✓' : '✗'}`);
    console.log(`    Provider: ${provider ? '✓' : '✗'}`);
    console.log(`    Service: ${service ? '✓' : '✗'}`);
    return;
  }

  console.log(`\nTest data:`);
  console.log(`  Patient: ${patient.name} (${patient.id})`);
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Service: ${service.name} (${service.id})`);

  // Book at 11am on Monday
  const startTime = new Date(monday);
  startTime.setHours(11, 0, 0, 0);
  const endTime = new Date(monday);
  endTime.setHours(11, 30, 0, 0);

  console.log(`\nBooking appointment for ${monday.toLocaleDateString()} at ${formatTime(startTime)}...`);

  const result = await bookAppointmentByDatetime(null, {
    patientId: patient.id,
    providerId: provider.id,
    serviceId: service.id,
    startTime,
    endTime,
  });

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success ? '✓' : '✗'}`);
  console.log(`  Message: ${result.message}`);
  console.log(`  Sync status: ${result.syncStatus}`);
  if (result.appointmentId) {
    console.log(`  Appointment ID: ${result.appointmentId}`);
  }
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  if (result.confirmation) {
    console.log(`  Confirmation:`);
    console.log(`    Date: ${result.confirmation.date}`);
    console.log(`    Time: ${result.confirmation.time}`);
    console.log(`    Provider: ${result.confirmation.provider}`);
    console.log(`    Service: ${result.confirmation.service}`);
  }

  // Test conflict detection - try to book same slot again
  console.log(`\nTrying to book the same slot again (should fail)...`);
  const conflictResult = await bookAppointmentByDatetime(null, {
    patientId: patient.id,
    providerId: provider.id,
    serviceId: service.id,
    startTime,
    endTime,
  });

  console.log(`  Success: ${conflictResult.success ? '✓ (unexpected!)' : '✗ (expected)'}`);
  console.log(`  Error: ${conflictResult.error || 'none'}`);
  console.log(`  Message: ${conflictResult.message}`);

  return result;
}

async function cleanup(appointmentId?: string) {
  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP');
  console.log('='.repeat(60));

  if (appointmentId) {
    console.log(`\nDeleting test appointment ${appointmentId}...`);
    await prisma.appointment.delete({ where: { id: appointmentId } });
    console.log('  ✓ Deleted');

    // Also delete any queued jobs
    const deleted = await prisma.job.deleteMany({
      where: {
        type: 'push_appointment_to_mrs',
        payload: {
          path: ['appointmentId'],
          equals: appointmentId,
        },
      },
    });
    if (deleted.count > 0) {
      console.log(`  ✓ Deleted ${deleted.count} queued job(s)`);
    }
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('='.repeat(60));
  console.log('SCHEDULING ABSTRACTION REDESIGN - TEST SUITE');
  console.log('='.repeat(60));
  console.log(`\nRunning at: ${new Date().toISOString()}`);

  try {
    // Test 1: Schedule Templates
    const { monday } = await testScheduleTemplates();

    // Test 2: Compute Availability
    await testComputeAvailability(monday);

    // Test 3: Conflict Detection
    await testConflictDetection(monday);

    // Test 4: OpenMRS Adapter
    await testOpenMRSAdapter();

    // Test 5: Local Booking
    const bookingResult = await testLocalBooking(monday);

    // Cleanup
    await cleanup(bookingResult?.appointmentId);

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS COMPLETED');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n\nTEST FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
