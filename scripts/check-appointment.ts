import { loadEnv } from '../src/utils/env.js';
loadEnv();

import { prisma } from '../src/db/client.js';

const appointmentId = process.argv[2] || 'db9f4955-229b-4262-934b-40f69f6c58a5';

async function main() {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { name: true } },
    }
  });

  if (!appointment) {
    console.log('Appointment not found!');
    return;
  }

  console.log('=== Local Database ===');
  console.log('ID:', appointment.id);
  console.log('Patient:', appointment.patient.name);
  console.log('Status:', appointment.status);
  console.log('Cancel Reason:', appointment.cancelReason || '(none)');
  console.log('');
  console.log('=== MRS Sync Status ===');
  console.log('MRS ID:', appointment.mrsId || '(none)');
  console.log('Synced to MRS:', appointment.syncedToMrs);
  console.log('Synced at:', appointment.syncedToMrsAt?.toISOString() || '(never)');
  console.log('Last sync error:', appointment.lastSyncError || '(none)');

  // Check for pending push jobs
  const pendingJobs = await prisma.job.findMany({
    where: {
      OR: [
        { type: 'push_appointment_to_mrs', payload: { path: ['appointmentId'], equals: appointmentId } },
        { type: 'push_cancellation_to_mrs', payload: { path: ['appointmentId'], equals: appointmentId } },
      ]
    }
  });

  console.log('');
  console.log('=== Pending Jobs ===');
  if (pendingJobs.length === 0) {
    console.log('No pending push jobs');
  } else {
    for (const job of pendingJobs) {
      console.log('Job:', job.type);
      console.log('  Status:', job.status);
      console.log('  Created:', job.createdAt.toISOString());
      console.log('  Payload:', JSON.stringify(job.payload));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
