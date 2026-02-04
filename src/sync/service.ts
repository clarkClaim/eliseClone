// Sync Service
// Synchronizes data between OpenMRS and the local Context Store

import { prisma } from '../db/client.js';
import type { MRSAdapter } from '../mrs/adapter.js';
import type { MRSPatient, MRSProvider, MRSAppointment, MRSSlot } from '../mrs/types.js';
import { MRSError } from '../mrs/errors.js';

const DEFAULT_SYNC_INTERVAL_MS = 300000; // 5 minutes
const DEFAULT_MAX_REQUESTS_PER_CYCLE = 20; // Leave bandwidth for real-time ops
const DEFAULT_REQUEST_DELAY_MS = 500; // Delay between sync requests (2 req/sec max)
const CONSECUTIVE_FAILURES_THRESHOLD = 5;
const LOOKBACK_DAYS = 30;
const BASE_BACKOFF_MS = 60000; // 1 minute

export interface SyncServiceConfig {
  adapter: MRSAdapter;
  intervalMs?: number;
  /** Max API requests per sync cycle (default: 20). Preserves bandwidth for live operations. */
  maxRequestsPerCycle?: number;
  /** Minimum delay between sync requests in ms (default: 500). Rate limits sync to preserve bandwidth. */
  requestDelayMs?: number;
}

type EntityType = 'patients' | 'providers' | 'appointments' | 'timeslots';

export class SyncService {
  private readonly adapter: MRSAdapter;
  private readonly intervalMs: number;
  private readonly maxRequestsPerCycle: number;
  private readonly requestDelayMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private requestCount = 0;

  constructor(config: SyncServiceConfig) {
    this.adapter = config.adapter;
    this.intervalMs = config.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.maxRequestsPerCycle = config.maxRequestsPerCycle ?? DEFAULT_MAX_REQUESTS_PER_CYCLE;
    this.requestDelayMs = config.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  }

  /** Check if we've hit the request limit for this cycle */
  private hasRequestBudget(): boolean {
    return this.requestCount < this.maxRequestsPerCycle;
  }

  /**
   * Rate-limited request wrapper. Adds delay and tracks count.
   * Call this before each MRS API call during sync.
   */
  private async throttle(): Promise<boolean> {
    if (!this.hasRequestBudget()) {
      console.log(`[Sync] Request budget exhausted (${this.maxRequestsPerCycle} requests)`);
      return false;
    }

    if (this.requestCount > 0 && this.requestDelayMs > 0) {
      await this.sleep(this.requestDelayMs);
    }

    this.requestCount++;
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a SyncService from environment variables.
   */
  static fromEnv(adapter: MRSAdapter): SyncService {
    const intervalMs = process.env.SYNC_INTERVAL_MS
      ? parseInt(process.env.SYNC_INTERVAL_MS, 10)
      : DEFAULT_SYNC_INTERVAL_MS;

    const maxRequestsPerCycle = process.env.SYNC_MAX_REQUESTS
      ? parseInt(process.env.SYNC_MAX_REQUESTS, 10)
      : DEFAULT_MAX_REQUESTS_PER_CYCLE;

    const requestDelayMs = process.env.SYNC_REQUEST_DELAY_MS
      ? parseInt(process.env.SYNC_REQUEST_DELAY_MS, 10)
      : DEFAULT_REQUEST_DELAY_MS;

    return new SyncService({ adapter, intervalMs, maxRequestsPerCycle, requestDelayMs });
  }

  /**
   * Start the sync service.
   */
  start(): void {
    if (this.intervalId) {
      console.log('[Sync] Already running');
      return;
    }

    console.log(`[Sync] Starting sync service with interval ${this.intervalMs}ms`);

    // Run immediately, then on interval
    this.runSyncCycle();
    this.intervalId = setInterval(() => this.runSyncCycle(), this.intervalMs);
  }

  /**
   * Stop the sync service.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Sync] Stopped');
    }
  }

  /**
   * Run a single sync cycle.
   */
  async runSyncCycle(): Promise<void> {
    if (this.isRunning) {
      console.log('[Sync] Skipping - previous cycle still running');
      return;
    }

    this.isRunning = true;
    this.requestCount = 0; // Reset request budget for this cycle
    const startTime = Date.now();
    console.log('[Sync] Starting sync cycle');

    try {
      // Sync in order: providers, patients, availability, appointments
      await this.syncProviders();
      await this.syncPatients();
      await this.syncAvailability();
      await this.syncAppointmentsFromMRS();
      await this.pushAppointmentsToMRS();

      const duration = Date.now() - startTime;
      console.log(`[Sync] Cycle complete in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Sync] Cycle failed after ${duration}ms:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  // ============================================
  // Provider Sync
  // ============================================

  private async syncProviders(): Promise<void> {
    const entityType: EntityType = 'providers';
    const syncStart = Date.now();

    try {
      await this.updateSyncState(entityType, 'running');

      if (!await this.throttle()) {
        await this.completeSyncState(entityType, syncStart, 0);
        return;
      }

      const mrsProviders = await this.adapter.getProviders();
      let recordsProcessed = 0;

      for (const provider of mrsProviders) {
        await this.upsertProvider(provider);
        recordsProcessed++;
      }

      await this.completeSyncState(entityType, syncStart, recordsProcessed);
      console.log(`[Sync] Providers: ${recordsProcessed} processed`);
    } catch (error) {
      await this.failSyncState(entityType, error);
      throw error;
    }
  }

  private async upsertProvider(provider: MRSProvider): Promise<void> {
    await prisma.provider.upsert({
      where: { mrsId: provider.mrsId },
      create: {
        mrsId: provider.mrsId,
        name: provider.name,
        specialty: provider.specialty,
      },
      update: {
        name: provider.name,
        specialty: provider.specialty,
      },
    });
  }

  // ============================================
  // Patient Sync
  // ============================================

  private async syncPatients(): Promise<void> {
    const entityType: EntityType = 'patients';
    const syncStart = Date.now();

    try {
      await this.updateSyncState(entityType, 'running');

      // Refresh patient data for patients we already have locally
      // (New patients are imported via appointment sync)
      const localPatients = await prisma.patient.findMany({
        select: { mrsId: true },
      });

      let recordsProcessed = 0;

      for (const { mrsId } of localPatients) {
        if (!await this.throttle()) break;

        const mrsPatient = await this.adapter.getPatient(mrsId);
        if (mrsPatient) {
          await this.upsertPatient(mrsPatient);
          recordsProcessed++;
        }
      }

      await this.completeSyncState(entityType, syncStart, recordsProcessed);
      console.log(`[Sync] Patients: ${recordsProcessed} refreshed`);
    } catch (error) {
      await this.failSyncState(entityType, error);
      throw error;
    }
  }

  private async upsertPatient(patient: MRSPatient): Promise<void> {
    // MRS wins for patient data
    await prisma.patient.upsert({
      where: { mrsId: patient.mrsId },
      create: {
        mrsId: patient.mrsId,
        name: patient.name,
        givenName: patient.givenName,
        familyName: patient.familyName,
        dob: patient.dateOfBirth,
        gender: patient.gender,
      },
      update: {
        name: patient.name,
        givenName: patient.givenName,
        familyName: patient.familyName,
        dob: patient.dateOfBirth,
        gender: patient.gender,
      },
    });

    // Sync phone numbers
    const localPatient = await prisma.patient.findUnique({
      where: { mrsId: patient.mrsId },
    });

    if (localPatient) {
      // Delete existing phones and replace with MRS data
      await prisma.patientPhone.deleteMany({
        where: { patientId: localPatient.id },
      });

      for (const phone of patient.phoneNumbers) {
        await prisma.patientPhone.create({
          data: {
            patientId: localPatient.id,
            phone: phone.phone,
            phoneType: phone.phoneType,
            isPrimary: phone.isPrimary,
          },
        });
      }
    }
  }

  // ============================================
  // Availability Sync
  // ============================================

  private async syncAvailability(): Promise<void> {
    const entityType: EntityType = 'timeslots';
    const syncStart = Date.now();

    try {
      await this.updateSyncState(entityType, 'running');

      const providers = await prisma.provider.findMany();
      const dateRange = {
        start: new Date(),
        end: new Date(Date.now() + LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      };

      let recordsProcessed = 0;
      const seenMrsIds = new Set<string>();

      for (const provider of providers) {
        const slots = await this.adapter.getProviderAvailability(provider.mrsId, dateRange);

        for (const slot of slots) {
          seenMrsIds.add(slot.mrsId);
          await this.upsertSlot(slot, provider.id);
          recordsProcessed++;
        }
      }

      // Mark slots deleted from MRS
      await this.markDeletedSlots(seenMrsIds);

      await this.completeSyncState(entityType, syncStart, recordsProcessed);
      console.log(`[Sync] Availability: ${recordsProcessed} processed`);
    } catch (error) {
      await this.failSyncState(entityType, error);
      throw error;
    }
  }

  private async upsertSlot(slot: MRSSlot, providerId: string): Promise<void> {
    const existingSlot = await prisma.availability.findUnique({
      where: { mrsId: slot.mrsId },
    });

    // Get location and appointment type IDs if available
    let locationId: string | undefined;
    let appointmentTypeId: string | undefined;

    if (slot.locationMrsId) {
      const location = await prisma.location.findUnique({
        where: { mrsId: slot.locationMrsId },
      });
      locationId = location?.id;
    }

    if (slot.appointmentTypeMrsId) {
      const appointmentType = await prisma.appointmentType.findUnique({
        where: { mrsId: slot.appointmentTypeMrsId },
      });
      appointmentTypeId = appointmentType?.id;
    }

    if (existingSlot) {
      // Check if slot was booked externally in MRS
      if (slot.isBooked && !existingSlot.isBooked) {
        console.log(`[Sync] Slot ${slot.mrsId} booked externally in MRS`);
      }

      await prisma.availability.update({
        where: { mrsId: slot.mrsId },
        data: {
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBooked: slot.isBooked,
          mrsExists: true,
          mrsUpdatedAt: new Date(),
          locationId,
          appointmentTypeId,
        },
      });
    } else {
      await prisma.availability.create({
        data: {
          mrsId: slot.mrsId,
          providerId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBooked: slot.isBooked,
          mrsExists: true,
          mrsUpdatedAt: new Date(),
          locationId,
          appointmentTypeId,
        },
      });
    }
  }

  private async markDeletedSlots(seenMrsIds: Set<string>): Promise<void> {
    // Find slots with mrsId that weren't seen in this sync
    const localSlots = await prisma.availability.findMany({
      where: {
        mrsId: { not: null },
        mrsExists: true,
      },
      select: { id: true, mrsId: true, isBooked: true },
    });

    for (const slot of localSlots) {
      if (slot.mrsId && !seenMrsIds.has(slot.mrsId)) {
        await prisma.availability.update({
          where: { id: slot.id },
          data: { mrsExists: false },
        });

        // Log conflict if slot was booked
        if (slot.isBooked) {
          await this.logConflict({
            entityType: 'availability',
            entityId: slot.id,
            mrsId: slot.mrsId,
            conflictType: 'deleted_in_mrs',
            localState: { isBooked: slot.isBooked },
            resolution: 'Marked mrsExists=false, slot preserved locally',
          });
        }
      }
    }
  }

  // ============================================
  // Appointment Sync (from MRS)
  // ============================================

  private async syncAppointmentsFromMRS(): Promise<void> {
    const entityType: EntityType = 'appointments';
    const syncStart = Date.now();

    try {
      await this.updateSyncState(entityType, 'running');

      const dateRange = {
        startDate: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      };

      const mrsAppointments = await this.adapter.getAppointments(dateRange);
      let recordsProcessed = 0;

      for (const appt of mrsAppointments) {
        await this.importAppointment(appt);
        recordsProcessed++;
      }

      // Check for local-only appointments
      await this.checkLocalOnlyAppointments(mrsAppointments);

      await this.completeSyncState(entityType, syncStart, recordsProcessed);
      console.log(`[Sync] Appointments from MRS: ${recordsProcessed} processed`);
    } catch (error) {
      await this.failSyncState(entityType, error);
      throw error;
    }
  }

  private async importAppointment(appt: MRSAppointment): Promise<void> {
    // Find local patient and slot
    const patient = await prisma.patient.findUnique({
      where: { mrsId: appt.patientMrsId },
    });

    // If patient doesn't exist locally, create them
    let patientId: string;
    if (!patient) {
      const mrsPatient = await this.adapter.getPatient(appt.patientMrsId);
      if (mrsPatient) {
        await this.upsertPatient(mrsPatient);
        const newPatient = await prisma.patient.findUnique({
          where: { mrsId: appt.patientMrsId },
        });
        patientId = newPatient!.id;
      } else {
        console.warn(`[Sync] Patient ${appt.patientMrsId} not found in MRS`);
        return;
      }
    } else {
      patientId = patient.id;
    }

    // Find or create slot
    let slot = await prisma.availability.findFirst({
      where: {
        startTime: appt.startTime,
        endTime: appt.endTime,
        provider: { mrsId: appt.providerMrsId },
      },
    });

    if (!slot) {
      const provider = await prisma.provider.findUnique({
        where: { mrsId: appt.providerMrsId },
      });

      if (!provider) {
        console.warn(`[Sync] Provider ${appt.providerMrsId} not found`);
        return;
      }

      slot = await prisma.availability.create({
        data: {
          providerId: provider.id,
          startTime: appt.startTime,
          endTime: appt.endTime,
          isBooked: true,
          mrsExists: true,
          mrsUpdatedAt: new Date(),
        },
      });
    }

    // Check for existing appointment
    const existingAppt = await prisma.appointment.findUnique({
      where: { mrsId: appt.mrsId },
    });

    if (existingAppt) {
      // Check for data divergence
      if (existingAppt.status !== appt.status) {
        await this.logConflict({
          entityType: 'appointment',
          entityId: existingAppt.id,
          mrsId: appt.mrsId,
          conflictType: 'data_diverged',
          localState: { status: existingAppt.status },
          mrsState: { status: appt.status },
          resolution: 'MRS status wins',
        });
      }

      // MRS wins for status
      await prisma.appointment.update({
        where: { mrsId: appt.mrsId },
        data: {
          status: appt.status,
          reason: appt.reason,
          cancelReason: appt.cancelReason,
          mrsUpdatedAt: new Date(),
        },
      });
    } else {
      // Create new appointment from MRS
      await prisma.appointment.create({
        data: {
          mrsId: appt.mrsId,
          patientId,
          slotId: slot.id,
          status: appt.status,
          reason: appt.reason,
          cancelReason: appt.cancelReason,
          bookedVia: 'sync',
          syncedToMrs: true,
          syncedToMrsAt: new Date(),
          mrsUpdatedAt: new Date(),
        },
      });

      // Mark slot as booked
      await prisma.availability.update({
        where: { id: slot.id },
        data: { isBooked: true },
      });
    }
  }

  private async checkLocalOnlyAppointments(mrsAppointments: MRSAppointment[]): Promise<void> {
    const mrsMrsIds = new Set(mrsAppointments.map(a => a.mrsId));

    // Find local appointments with mrsId not in MRS response
    const localAppointments = await prisma.appointment.findMany({
      where: {
        mrsId: { not: null },
        syncedToMrs: true,
      },
      select: { id: true, mrsId: true, status: true },
    });

    for (const local of localAppointments) {
      if (local.mrsId && !mrsMrsIds.has(local.mrsId)) {
        await this.logConflict({
          entityType: 'appointment',
          entityId: local.id,
          mrsId: local.mrsId,
          conflictType: 'local_only',
          localState: { status: local.status },
          resolution: 'Flagged for review - not auto-deleted',
        });
      }
    }
  }

  // ============================================
  // Push to MRS
  // ============================================

  private async pushAppointmentsToMRS(): Promise<void> {
    // Find appointments that need to be pushed
    const unpushed = await prisma.appointment.findMany({
      where: {
        syncedToMrs: false,
        status: { not: 'cancelled' },
      },
      include: {
        patient: true,
        slot: {
          include: { provider: true },
        },
      },
    });

    console.log(`[Sync] Pushing ${unpushed.length} appointments to MRS`);

    for (const appt of unpushed) {
      await this.pushAppointmentToMRS(appt);
    }
  }

  private async pushAppointmentToMRS(appt: {
    id: string;
    patient: { mrsId: string };
    slot: { mrsId: string | null; provider: { mrsId: string } };
    reason: string | null;
    syncAttempts: number;
  }): Promise<void> {
    try {
      if (!appt.slot.mrsId) {
        throw new Error('Cannot push appointment - slot has no MRS ID');
      }

      const created = await this.adapter.createAppointment({
        patientMrsId: appt.patient.mrsId,
        providerMrsId: appt.slot.provider.mrsId,
        slotMrsId: appt.slot.mrsId,
        reason: appt.reason ?? undefined,
      });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: {
          mrsId: created.mrsId,
          syncedToMrs: true,
          syncedToMrsAt: new Date(),
          lastSyncError: null,
          syncAttempts: appt.syncAttempts + 1,
        },
      });

      console.log(`[Sync] Pushed appointment ${appt.id} to MRS`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.appointment.update({
        where: { id: appt.id },
        data: {
          lastSyncError: errorMessage,
          syncAttempts: appt.syncAttempts + 1,
        },
      });

      // Create retry job with exponential backoff
      await this.createRetryJob(appt.id, appt.syncAttempts);

      console.error(`[Sync] Failed to push appointment ${appt.id}:`, errorMessage);
    }
  }

  private async createRetryJob(appointmentId: string, currentAttempts: number): Promise<void> {
    const backoffExponent = currentAttempts + 1;
    const delayMs = BASE_BACKOFF_MS * Math.pow(2, backoffExponent - 1);
    const nextRetryAt = new Date(Date.now() + delayMs);

    await prisma.job.create({
      data: {
        type: 'sync_appointment_push',
        payload: { appointmentId },
        runAt: nextRetryAt,
        backoffExponent,
        nextRetryAt,
      },
    });
  }

  // ============================================
  // Slot Verification (for booking flow)
  // ============================================

  /**
   * Verify a slot is available in MRS before confirming a booking.
   */
  async verifySlotAvailable(slotId: string): Promise<boolean> {
    const slot = await prisma.availability.findUnique({
      where: { id: slotId },
      include: { provider: true },
    });

    if (!slot || !slot.mrsId) {
      return false;
    }

    try {
      const dateRange = {
        start: slot.startTime,
        end: slot.endTime,
      };

      const mrsSlots = await this.adapter.getProviderAvailability(slot.provider.mrsId, dateRange);
      const mrsSlot = mrsSlots.find(s => s.mrsId === slot.mrsId);

      if (!mrsSlot) {
        // Slot deleted from MRS
        await prisma.availability.update({
          where: { id: slotId },
          data: { mrsExists: false },
        });
        return false;
      }

      if (mrsSlot.isBooked) {
        // Slot booked externally
        await prisma.availability.update({
          where: { id: slotId },
          data: { isBooked: true },
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Sync] Failed to verify slot:', error);
      // On error, allow booking (optimistic)
      return true;
    }
  }

  // ============================================
  // Sync State Management
  // ============================================

  private async updateSyncState(entityType: EntityType, status: string): Promise<void> {
    await prisma.syncState.upsert({
      where: { entityType },
      create: {
        entityType,
        syncStatus: status,
        nextSyncAt: new Date(Date.now() + this.intervalMs),
      },
      update: {
        syncStatus: status,
      },
    });
  }

  private async completeSyncState(
    entityType: EntityType,
    startTime: number,
    recordsProcessed: number
  ): Promise<void> {
    const duration = Date.now() - startTime;

    await prisma.syncState.update({
      where: { entityType },
      data: {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
        lastSyncDuration: duration,
        recordsProcessed,
        consecutiveFailures: 0,
        nextSyncAt: new Date(Date.now() + this.intervalMs),
        lastError: null,
      },
    });
  }

  private async failSyncState(entityType: EntityType, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const current = await prisma.syncState.findUnique({
      where: { entityType },
    });

    const consecutiveFailures = (current?.consecutiveFailures ?? 0) + 1;

    if (consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
      console.warn(
        `[Sync] WARNING: ${entityType} sync has failed ${consecutiveFailures} consecutive times`
      );
    }

    await prisma.syncState.update({
      where: { entityType },
      data: {
        syncStatus: 'failed',
        lastError: errorMessage,
        consecutiveFailures,
        nextSyncAt: new Date(Date.now() + this.intervalMs),
      },
    });
  }

  // ============================================
  // Conflict Logging
  // ============================================

  private async logConflict(params: {
    entityType: string;
    entityId: string;
    mrsId: string | null;
    conflictType: string;
    localState: Record<string, unknown>;
    mrsState?: Record<string, unknown>;
    resolution: string;
  }): Promise<void> {
    await prisma.syncConflict.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        mrsId: params.mrsId,
        conflictType: params.conflictType,
        localState: params.localState as object,
        mrsState: params.mrsState ? (params.mrsState as object) : undefined,
        resolution: params.resolution,
      },
    });

    console.log(
      `[Sync] Conflict logged: ${params.conflictType} for ${params.entityType} ${params.entityId}`
    );
  }
}
