// MRS Booking Flow
// MRS-first booking during live calls with graceful degradation

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import { SlotConflictError, SlotNotFoundError, TimeoutError, MRSUnavailableError } from '../mrs/errors.js';
import { createPushJob } from '../sync/push/appointment-push.js';
import { createCancellationPushJob } from '../sync/push/cancellation-push.js';

const MRS_TIMEOUT_MS = 5000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const PRIORITY_SYNC_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export type SyncStatus = 'synced' | 'pending';

export interface SlotWithFreshness {
  id: string;
  mrsId: string | null;
  providerId: string;
  providerName: string;
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
  lastSyncedAt: Date | null;
  freshnessMs: number;
  isStale: boolean;
}

export interface AvailabilityResponse {
  slots: SlotWithFreshness[];
  syncStatus: {
    lastSync: Date | null;
    nextSync: Date | null;
    status: string;
  };
}

export interface BookingRequest {
  patientId: string;
  slotId: string;
  appointmentTypeId?: string;
  reason?: string;
}

export interface BookingResponse {
  success: boolean;
  appointmentId?: string;
  confirmation?: {
    date: string;
    time: string;
    provider: string;
    location?: string;
  };
  syncStatus: SyncStatus;
  message: string;
  error?: 'slot_conflict' | 'slot_not_found' | 'mrs_unavailable' | 'validation_error';
  alternatives?: SlotWithFreshness[];
}

export interface CancellationRequest {
  appointmentId: string;
  reason?: string;
}

export interface CancellationResponse {
  success: boolean;
  syncStatus: SyncStatus;
  message: string;
  error?: string;
}

/**
 * Check availability with freshness metadata.
 */
export async function checkAvailability(
  date: Date,
  options?: {
    providerId?: string;
    forceRefresh?: boolean;
  }
): Promise<AvailabilityResponse> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const syncState = await prisma.syncState.findUnique({
    where: { entityType: 'availability' },
  });

  const slots = await prisma.availability.findMany({
    where: {
      startTime: { gte: startOfDay, lte: endOfDay },
      isBooked: false,
      mrsExists: true,
      ...(options?.providerId ? { providerId: options.providerId } : {}),
    },
    include: {
      provider: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const lastSyncedAt = syncState?.lastSyncAt ?? null;
  const freshnessMs = lastSyncedAt ? Date.now() - lastSyncedAt.getTime() : Infinity;
  const isStale = freshnessMs > STALE_THRESHOLD_MS;

  return {
    slots: slots.map(slot => ({
      id: slot.id,
      mrsId: slot.mrsId,
      providerId: slot.provider.id,
      providerName: slot.provider.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBooked: slot.isBooked,
      lastSyncedAt,
      freshnessMs,
      isStale,
    })),
    syncStatus: {
      lastSync: syncState?.lastSyncAt ?? null,
      nextSync: syncState?.nextSyncAt ?? null,
      status: syncState?.syncStatus ?? 'unknown',
    },
  };
}

/**
 * Book an appointment using MRS-first flow during live calls.
 */
export async function bookAppointment(
  adapter: MRSAdapter,
  request: BookingRequest
): Promise<BookingResponse> {
  const slot = await prisma.availability.findUnique({
    where: { id: request.slotId },
    include: {
      provider: true,
      location: true,
      appointmentType: true,
    },
  });

  if (!slot) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'The requested time slot was not found.',
      error: 'slot_not_found',
    };
  }

  if (slot.isBooked) {
    const alternatives = await getAlternativeSlots(slot.providerId, slot.startTime);
    return {
      success: false,
      syncStatus: 'synced',
      message: "I'm sorry, that time slot has already been booked.",
      error: 'slot_conflict',
      alternatives,
    };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: request.patientId },
  });

  if (!patient) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Patient not found.',
      error: 'validation_error',
    };
  }

  const healthCheck = await adapter.healthCheck();
  if (!healthCheck.healthy) {
    return await bookLocally(request, slot, patient, 'MRS unavailable');
  }

  if (!slot.mrsId) {
    return await bookLocally(request, slot, patient, 'Slot has no MRS ID');
  }

  try {
    const verification = await adapter.verifySlotAvailable(slot.mrsId);

    if (!verification.available) {
      await prisma.availability.update({
        where: { id: slot.id },
        data: { isBooked: true },
      });

      const alternatives = await getAlternativeSlots(slot.providerId, slot.startTime);
      return {
        success: false,
        syncStatus: 'synced',
        message: "I'm sorry, that time was just taken. Let me find some alternatives for you.",
        error: 'slot_conflict',
        alternatives,
      };
    }

    const mrsAppointment = await adapter.createAppointment({
      patientMrsId: patient.mrsId,
      providerMrsId: slot.provider.mrsId,
      slotMrsId: slot.mrsId,
      appointmentTypeMrsId: slot.appointmentType?.mrsId,
      reason: request.reason,
    });

    const appointment = await prisma.appointment.create({
      data: {
        mrsId: mrsAppointment.mrsId,
        patientId: request.patientId,
        slotId: request.slotId,
        status: 'scheduled',
        reason: request.reason,
        bookedVia: 'voice',
        syncedToMrs: true,
        syncedToMrsAt: new Date(),
        mrsUpdatedAt: new Date(),
      },
    });

    await prisma.availability.update({
      where: { id: slot.id },
      data: { isBooked: true },
    });

    return {
      success: true,
      appointmentId: appointment.id,
      confirmation: {
        date: slot.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        time: slot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        provider: slot.provider.name,
        location: slot.location?.name,
      },
      syncStatus: 'synced',
      message: `You're all set for ${slot.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${slot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} with ${slot.provider.name}!`,
    };
  } catch (error) {
    if (error instanceof SlotConflictError) {
      await prisma.availability.update({
        where: { id: slot.id },
        data: { isBooked: true },
      });

      const alternatives = await getAlternativeSlots(slot.providerId, slot.startTime);
      return {
        success: false,
        syncStatus: 'synced',
        message: "I'm sorry, that time was just taken. Let me find some alternatives for you.",
        error: 'slot_conflict',
        alternatives,
      };
    }

    if (error instanceof SlotNotFoundError) {
      await prisma.availability.update({
        where: { id: slot.id },
        data: { mrsExists: false },
      });

      const alternatives = await getAlternativeSlots(slot.providerId, slot.startTime);
      return {
        success: false,
        syncStatus: 'synced',
        message: "I'm sorry, that time slot is no longer available. Let me find some alternatives.",
        error: 'slot_not_found',
        alternatives,
      };
    }

    if (error instanceof TimeoutError || error instanceof MRSUnavailableError) {
      return await bookLocally(request, slot, patient, 'MRS timeout/unavailable');
    }

    throw error;
  }
}

/**
 * Book locally when MRS is unavailable (graceful degradation).
 */
async function bookLocally(
  request: BookingRequest,
  slot: Awaited<ReturnType<typeof prisma.availability.findUnique>> & { provider: { name: string }; location?: { name: string } | null },
  patient: { id: string; mrsId: string },
  reason: string
): Promise<BookingResponse> {
  console.log(`[MRSBooking] Degrading to local booking: ${reason}`);

  const appointment = await prisma.appointment.create({
    data: {
      patientId: request.patientId,
      slotId: request.slotId,
      status: 'scheduled',
      reason: request.reason,
      bookedVia: 'voice',
      syncedToMrs: false,
    },
  });

  await prisma.availability.update({
    where: { id: slot!.id },
    data: { isBooked: true },
  });

  await createPushJob(appointment.id, { priority: 10 });

  return {
    success: true,
    appointmentId: appointment.id,
    confirmation: {
      date: slot!.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      time: slot!.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      provider: slot!.provider.name,
      location: slot!.location?.name,
    },
    syncStatus: 'pending',
    message: `You're booked for ${slot!.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${slot!.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. You'll receive a confirmation once our system syncs.`,
  };
}

/**
 * Cancel an appointment with MRS-first flow.
 */
export async function cancelAppointment(
  adapter: MRSAdapter,
  request: CancellationRequest
): Promise<CancellationResponse> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: request.appointmentId },
    include: {
      slot: true,
    },
  });

  if (!appointment) {
    return {
      success: false,
      syncStatus: 'synced',
      message: 'Appointment not found.',
      error: 'Appointment not found',
    };
  }

  if (appointment.status === 'cancelled') {
    return {
      success: true,
      syncStatus: 'synced',
      message: 'This appointment has already been cancelled.',
    };
  }

  if (!appointment.syncedToMrs || !appointment.mrsId) {
    await prisma.appointment.update({
      where: { id: request.appointmentId },
      data: {
        status: 'cancelled',
        cancelReason: request.reason,
      },
    });

    await prisma.availability.update({
      where: { id: appointment.slotId },
      data: { isBooked: false },
    });

    await prisma.job.deleteMany({
      where: {
        type: 'push_appointment_to_mrs',
        status: 'pending',
        payload: {
          path: ['appointmentId'],
          equals: request.appointmentId,
        },
      },
    });

    return {
      success: true,
      syncStatus: 'synced',
      message: 'Your appointment has been cancelled.',
    };
  }

  const healthCheck = await adapter.healthCheck();
  if (!healthCheck.healthy) {
    await prisma.appointment.update({
      where: { id: request.appointmentId },
      data: {
        status: 'cancelled',
        cancelReason: request.reason,
      },
    });

    await prisma.availability.update({
      where: { id: appointment.slotId },
      data: { isBooked: false },
    });

    await createCancellationPushJob(
      request.appointmentId,
      appointment.mrsId,
      request.reason,
      { priority: 10 }
    );

    return {
      success: true,
      syncStatus: 'pending',
      message: 'Your appointment has been cancelled. Confirmation pending system sync.',
    };
  }

  try {
    await adapter.cancelAppointment(appointment.mrsId, request.reason);

    await prisma.appointment.update({
      where: { id: request.appointmentId },
      data: {
        status: 'cancelled',
        cancelReason: request.reason,
        syncedToMrsAt: new Date(),
      },
    });

    await prisma.availability.update({
      where: { id: appointment.slotId },
      data: { isBooked: false },
    });

    return {
      success: true,
      syncStatus: 'synced',
      message: 'Your appointment has been cancelled.',
    };
  } catch (error) {
    await prisma.appointment.update({
      where: { id: request.appointmentId },
      data: {
        status: 'cancelled',
        cancelReason: request.reason,
      },
    });

    await prisma.availability.update({
      where: { id: appointment.slotId },
      data: { isBooked: false },
    });

    await createCancellationPushJob(
      request.appointmentId,
      appointment.mrsId,
      request.reason,
      { priority: 10 }
    );

    return {
      success: true,
      syncStatus: 'pending',
      message: 'Your appointment has been cancelled. Confirmation pending system sync.',
    };
  }
}

/**
 * Get alternative slots near a given time.
 */
async function getAlternativeSlots(
  providerId: string,
  nearTime: Date,
  limit = 3
): Promise<SlotWithFreshness[]> {
  const syncState = await prisma.syncState.findUnique({
    where: { entityType: 'availability' },
  });

  const lastSyncedAt = syncState?.lastSyncAt ?? null;
  const freshnessMs = lastSyncedAt ? Date.now() - lastSyncedAt.getTime() : Infinity;
  const isStale = freshnessMs > STALE_THRESHOLD_MS;

  const startOfDay = new Date(nearTime);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(nearTime);
  endOfDay.setHours(23, 59, 59, 999);

  const slots = await prisma.availability.findMany({
    where: {
      providerId,
      startTime: { gte: startOfDay, lte: endOfDay },
      isBooked: false,
      mrsExists: true,
    },
    include: {
      provider: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
    take: limit,
  });

  return slots.map(slot => ({
    id: slot.id,
    mrsId: slot.mrsId,
    providerId: slot.provider.id,
    providerName: slot.provider.name,
    startTime: slot.startTime,
    endTime: slot.endTime,
    isBooked: slot.isBooked,
    lastSyncedAt,
    freshnessMs,
    isStale,
  }));
}

/**
 * Refresh availability from MRS on demand.
 */
export async function refreshAvailability(
  adapter: MRSAdapter,
  date: Date,
  providerId?: string
): Promise<AvailabilityResponse> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const mrsSlots = await adapter.getAvailability({ start: startOfDay, end: endOfDay });

  for (const mrsSlot of mrsSlots) {
    if (providerId && mrsSlot.providerMrsId !== providerId) continue;

    await prisma.availability.upsert({
      where: { mrsId: mrsSlot.mrsId },
      create: {
        mrsId: mrsSlot.mrsId,
        providerId: await getProviderIdByMrsId(mrsSlot.providerMrsId),
        startTime: mrsSlot.startTime,
        endTime: mrsSlot.endTime,
        isBooked: mrsSlot.isBooked,
        mrsExists: true,
        mrsUpdatedAt: new Date(),
      },
      update: {
        startTime: mrsSlot.startTime,
        endTime: mrsSlot.endTime,
        isBooked: mrsSlot.isBooked,
        mrsExists: true,
        mrsUpdatedAt: new Date(),
      },
    });
  }

  await prisma.syncState.upsert({
    where: { entityType: 'availability' },
    create: {
      entityType: 'availability',
      syncStatus: 'idle',
      lastSyncAt: new Date(),
    },
    update: {
      lastSyncAt: new Date(),
    },
  });

  return checkAvailability(date, { providerId });
}

async function getProviderIdByMrsId(mrsId: string): Promise<string> {
  const provider = await prisma.provider.findUnique({
    where: { mrsId },
  });
  if (!provider) {
    throw new Error(`Provider not found: ${mrsId}`);
  }
  return provider.id;
}
