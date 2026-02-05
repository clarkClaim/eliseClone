// Schedule Template Sync
// Syncs schedule configuration from MRS to local ScheduleTemplate records

import { prisma } from '../../db/client.js';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { MRSScheduleConfig } from '../../mrs/types.js';

// Default schedule for services without weeklyAvailability
const DEFAULT_SCHEDULE = {
  weekdays: [1, 2, 3, 4, 5], // Monday-Friday
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMins: 30,
};

export interface ScheduleTemplateSyncResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Sync schedule templates from MRS service configuration.
 */
export async function syncScheduleTemplates(
  adapter: MRSAdapter
): Promise<ScheduleTemplateSyncResult> {
  const result: ScheduleTemplateSyncResult = {
    created: 0,
    updated: 0,
    errors: [],
  };

  // Check if adapter supports schedule config
  if (!adapter.getScheduleConfig) {
    console.log('[ScheduleTemplateSync] Adapter does not support getScheduleConfig, skipping');
    return result;
  }

  try {
    const scheduleConfigs = await adapter.getScheduleConfig();

    if (!scheduleConfigs || scheduleConfigs.length === 0) {
      console.log('[ScheduleTemplateSync] No schedule configs returned from MRS');
      return result;
    }

    console.log(`[ScheduleTemplateSync] Processing ${scheduleConfigs.length} service configs`);

    for (const config of scheduleConfigs) {
      try {
        await syncServiceSchedule(config, result);
      } catch (error) {
        const errorMsg = `Failed to sync service ${config.serviceId}: ${error}`;
        console.error(`[ScheduleTemplateSync] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(
      `[ScheduleTemplateSync] Complete: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`
    );

    return result;
  } catch (error) {
    const errorMsg = `Failed to fetch schedule config: ${error}`;
    console.error(`[ScheduleTemplateSync] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Sync schedule for a single service.
 */
async function syncServiceSchedule(
  config: MRSScheduleConfig,
  result: ScheduleTemplateSyncResult
): Promise<void> {
  // Find local service by MRS ID
  const service = await prisma.appointmentType.findUnique({
    where: { mrsId: config.serviceId },
  });

  if (!service) {
    // Service not synced yet, skip
    console.log(`[ScheduleTemplateSync] Service ${config.serviceId} not found locally, skipping`);
    return;
  }

  // Get all providers (schedule templates are per-provider in our model)
  // For Bahmni, services have availability but not specific to providers
  // We'll create templates for all active providers
  const providers = await prisma.provider.findMany();

  if (providers.length === 0) {
    console.log('[ScheduleTemplateSync] No providers found, skipping');
    return;
  }

  // Get weekly availability from config, or use defaults
  const weeklyAvailability = config.weeklyAvailability.length > 0
    ? config.weeklyAvailability
    : DEFAULT_SCHEDULE.weekdays.map(dayOfWeek => ({
        dayOfWeek,
        startTime: DEFAULT_SCHEDULE.startTime,
        endTime: DEFAULT_SCHEDULE.endTime,
      }));

  // Create/update templates for each provider and day
  for (const provider of providers) {
    for (const availability of weeklyAvailability) {
      const templateData = {
        providerId: provider.id,
        serviceId: service.id,
        dayOfWeek: availability.dayOfWeek,
        startTime: availability.startTime,
        endTime: availability.endTime,
        slotDurationMins: config.durationMins || DEFAULT_SCHEDULE.slotDurationMins,
        source: 'mrs_synced' as const,
        mrsServiceId: config.serviceId,
        effectiveFrom: new Date(),
      };

      // Upsert based on unique constraint
      const existing = await prisma.scheduleTemplate.findFirst({
        where: {
          providerId: provider.id,
          serviceId: service.id,
          dayOfWeek: availability.dayOfWeek,
          effectiveTo: null, // Only current templates
        },
      });

      if (existing) {
        // Update if changed
        if (
          existing.startTime !== templateData.startTime ||
          existing.endTime !== templateData.endTime ||
          existing.slotDurationMins !== templateData.slotDurationMins
        ) {
          await prisma.scheduleTemplate.update({
            where: { id: existing.id },
            data: {
              startTime: templateData.startTime,
              endTime: templateData.endTime,
              slotDurationMins: templateData.slotDurationMins,
            },
          });
          result.updated++;
        }
      } else {
        // Create new template
        await prisma.scheduleTemplate.create({
          data: templateData,
        });
        result.created++;
      }
    }
  }
}

/**
 * Create default schedule templates for a provider.
 * Used when MRS doesn't provide schedule configuration.
 */
export async function createDefaultScheduleTemplates(
  providerId: string,
  serviceId?: string
): Promise<number> {
  let created = 0;

  for (const dayOfWeek of DEFAULT_SCHEDULE.weekdays) {
    const existing = await prisma.scheduleTemplate.findFirst({
      where: {
        providerId,
        serviceId: serviceId ?? null,
        dayOfWeek,
        effectiveTo: null,
      },
    });

    if (!existing) {
      await prisma.scheduleTemplate.create({
        data: {
          providerId,
          serviceId,
          dayOfWeek,
          startTime: DEFAULT_SCHEDULE.startTime,
          endTime: DEFAULT_SCHEDULE.endTime,
          slotDurationMins: DEFAULT_SCHEDULE.slotDurationMins,
          source: 'local',
          effectiveFrom: new Date(),
        },
      });
      created++;
    }
  }

  return created;
}
