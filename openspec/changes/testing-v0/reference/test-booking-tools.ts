// Test the new booking tools
// Run with: pnpm exec tsx scripts/test-booking-tools.ts

import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { getAvailability } from '../src/agent/tools/get-availability.js';
import { bookAppointment, setMRSAdapter } from '../src/agent/tools/book-appointment.js';
import { OpenMRSAdapter } from '../src/mrs/adapters/openmrs/adapter.js';

async function main() {
  console.log('='.repeat(60));
  console.log('BOOKING TOOLS TEST');
  console.log('='.repeat(60));

  // Initialize MRS adapter if available
  try {
    const adapter = OpenMRSAdapter.fromEnv();
    await adapter.connect();
    setMRSAdapter(adapter);
    console.log('\n✓ MRS adapter connected');
  } catch {
    console.log('\n⚠ MRS adapter not available (local-only mode)');
    setMRSAdapter(null);
  }

  // Test 1: Get availability
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: get_availability');
  console.log('='.repeat(60));

  console.log('\nChecking availability for "tomorrow"...');
  const availResult = await getAvailability({ date: 'tomorrow' });
  console.log('Success:', availResult.success);
  console.log('Date:', availResult.date);
  console.log('Slots:', availResult.slots?.length || 0);
  console.log('Summary:', availResult.summary);

  console.log('\nChecking availability for "next Monday"...');
  const mondayResult = await getAvailability({ date: 'next Monday' });
  console.log('Success:', mondayResult.success);
  console.log('Date:', mondayResult.date);
  console.log('Slots:', mondayResult.slots?.length || 0);
  if (mondayResult.slots && mondayResult.slots.length > 0) {
    console.log('First slot:', mondayResult.slots[0].startTime, 'with', mondayResult.slots[0].providerName);
  }

  // Test 2: Book appointment (requires patient in conversation)
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: book_appointment (no conversation - should fail gracefully)');
  console.log('='.repeat(60));

  const bookResult = await bookAppointment(
    { date: 'tomorrow', time: '10am' },
    undefined // No call ID = no patient context
  );
  console.log('Success:', bookResult.success);
  console.log('Error:', bookResult.error);
  console.log('Message:', bookResult.message);

  // Test 3: Simulate a full flow with a fake conversation
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: book_appointment (with patient context)');
  console.log('='.repeat(60));

  // Get a test patient
  const patient = await prisma.patient.findFirst({ where: { mrsId: 'test-patient-001' } });
  if (!patient) {
    console.log('⚠ Test patient not found, skipping');
  } else {
    // Create a fake conversation with this patient
    const fakeCallId = `test-call-${Date.now()}`;
    await prisma.conversation.create({
      data: {
        externalId: fakeCallId,
        channel: 'voice',
        patientId: patient.id,
      },
    });
    console.log('Created test conversation for', patient.name);

    // Try to book on next Monday at 10am
    console.log('\nBooking for next Monday at 10am...');
    const bookResult2 = await bookAppointment(
      { date: 'next Monday', time: '10am' },
      fakeCallId
    );
    console.log('Success:', bookResult2.success);
    console.log('Message:', bookResult2.message);
    if (bookResult2.appointment) {
      console.log('Appointment:', bookResult2.appointment);
    }
    if (bookResult2.error) {
      console.log('Error:', bookResult2.error);
    }

    // Cleanup: delete conversation and any appointment created
    const conv = await prisma.conversation.findFirst({ where: { externalId: fakeCallId } });
    if (conv) {
      const metadata = conv.metadata as { lastAppointmentId?: string } | null;
      if (metadata?.lastAppointmentId) {
        console.log('\nCleaning up appointment...');
        await prisma.appointment.delete({ where: { id: metadata.lastAppointmentId } });
        await prisma.job.deleteMany({
          where: {
            type: 'push_appointment_to_mrs',
            payload: { path: ['appointmentId'], equals: metadata.lastAppointmentId },
          },
        });
      }
      await prisma.conversation.delete({ where: { id: conv.id } });
      console.log('✓ Cleaned up test data');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(console.error);
