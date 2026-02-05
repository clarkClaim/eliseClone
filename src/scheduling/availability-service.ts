// AvailabilityService
// Computes availability from schedule templates and appointments

import { prisma } from '../db/client.js';

// ============================================
// Types
// ============================================

export interface TimeWindow {
  startTime: Date;
  endTime: Date;
  providerId?: string;
  serviceId?: string;
}

export interface AvailabilityOptions {
  providerId?: string;
  serviceId?: string;
  /** Override slot duration in minutes (default: use template's slotDurationMins) */
  slotDuration?: number;
}

export interface ScheduleTemplateData {
  id: string;
  providerId: string;
  serviceId: string | null;
  dayOfWeek: number;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  slotDurationMins: number;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySearchCriteria {
  startDate: Date;
  endDate?: Date;              // If omitted, search until findFirst succeeds or maxDays reached
  daysOfWeek?: number[];       // Filter to specific days (0=Sun, 6=Sat)
  timeOfDay?: TimeOfDay;
  findFirst?: boolean;         // Stop at first day with availability
  maxDays?: number;            // Safety limit (default: 30)
  providerId?: string;
  serviceId?: string;
}

export interface AvailabilitySearchResult {
  /** Availability keyed by ISO date string (e.g., "2026-03-05") */
  availabilityByDate: Map<string, TimeWindow[]>;
  /** For findFirst: true, the first available date */
  firstAvailableDate?: string;
  /** Number of days that were checked */
  daysSearched: number;
}

// ============================================
// Schedule Template Queries
// ============================================

/**
 * Get schedule templates for a provider on a specific date.
 * Returns templates that are effective on the given date.
 */
export async function getScheduleTemplates(
  providerId: string,
  date: Date
): Promise<ScheduleTemplateData[]> {
  const dayOfWeek = date.getDay(); // 0=Sunday through 6=Saturday

  const templates = await prisma.scheduleTemplate.findMany({
    where: {
      providerId,
      dayOfWeek,
      effectiveFrom: { lte: date },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: date } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  return templates.map(t => ({
    id: t.id,
    providerId: t.providerId,
    serviceId: t.serviceId,
    dayOfWeek: t.dayOfWeek,
    startTime: t.startTime,
    endTime: t.endTime,
    slotDurationMins: t.slotDurationMins,
  }));
}

/**
 * Get all schedule templates for a specific day of week.
 * Optionally filter by provider or service.
 */
export async function getScheduleTemplatesForDay(
  date: Date,
  options?: { providerId?: string; serviceId?: string }
): Promise<ScheduleTemplateData[]> {
  const dayOfWeek = date.getDay();

  const templates = await prisma.scheduleTemplate.findMany({
    where: {
      dayOfWeek,
      effectiveFrom: { lte: date },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: date } },
      ],
      ...(options?.providerId ? { providerId: options.providerId } : {}),
      ...(options?.serviceId ? { serviceId: options.serviceId } : {}),
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  return templates.map(t => ({
    id: t.id,
    providerId: t.providerId,
    serviceId: t.serviceId,
    dayOfWeek: t.dayOfWeek,
    startTime: t.startTime,
    endTime: t.endTime,
    slotDurationMins: t.slotDurationMins,
  }));
}

/**
 * Get all schedule templates effective within a date range.
 * Returns templates grouped by day of week for efficient in-memory lookup.
 */
export async function getScheduleTemplatesForRange(
  startDate: Date,
  endDate: Date,
  options?: { providerId?: string; serviceId?: string }
): Promise<Map<number, ScheduleTemplateData[]>> {
  const templates = await prisma.scheduleTemplate.findMany({
    where: {
      effectiveFrom: { lte: endDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: startDate } },
      ],
      ...(options?.providerId ? { providerId: options.providerId } : {}),
      ...(options?.serviceId ? { serviceId: options.serviceId } : {}),
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  // Group by day of week
  const byDayOfWeek = new Map<number, ScheduleTemplateData[]>();
  for (const t of templates) {
    const data: ScheduleTemplateData = {
      id: t.id,
      providerId: t.providerId,
      serviceId: t.serviceId,
      dayOfWeek: t.dayOfWeek,
      startTime: t.startTime,
      endTime: t.endTime,
      slotDurationMins: t.slotDurationMins,
    };
    const existing = byDayOfWeek.get(t.dayOfWeek) || [];
    existing.push(data);
    byDayOfWeek.set(t.dayOfWeek, existing);
  }

  return byDayOfWeek;
}

// ============================================
// Time Window Generation
// ============================================

/**
 * Generate time windows from a schedule template for a specific date.
 * @param template The schedule template
 * @param date The date to generate windows for
 * @param slotDurationOverride Override the template's slot duration
 * @returns Array of time windows
 */
export function generateTimeWindows(
  template: ScheduleTemplateData,
  date: Date,
  slotDurationOverride?: number
): TimeWindow[] {
  const windows: TimeWindow[] = [];
  const slotDuration = slotDurationOverride ?? template.slotDurationMins;

  // Parse template start/end times
  const [startHour, startMin] = template.startTime.split(':').map(Number);
  const [endHour, endMin] = template.endTime.split(':').map(Number);

  // Create start and end Date objects for this date
  const templateStart = new Date(date);
  templateStart.setHours(startHour, startMin, 0, 0);

  const templateEnd = new Date(date);
  templateEnd.setHours(endHour, endMin, 0, 0);

  // Generate windows
  let windowStart = new Date(templateStart);
  while (windowStart < templateEnd) {
    const windowEnd = new Date(windowStart.getTime() + slotDuration * 60 * 1000);

    // Don't create windows that extend past template end
    if (windowEnd <= templateEnd) {
      windows.push({
        startTime: new Date(windowStart),
        endTime: new Date(windowEnd),
        providerId: template.providerId,
        serviceId: template.serviceId ?? undefined,
      });
    }

    windowStart = windowEnd;
  }

  return windows;
}

// ============================================
// Appointment Queries
// ============================================

/**
 * Get appointments for a specific date.
 * Optionally filter by provider.
 */
export async function getAppointmentsForDate(
  date: Date,
  providerId?: string
): Promise<Array<{ startTime: Date; endTime: Date; providerId: string | null }>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: startOfDay, lte: endOfDay },
      status: { notIn: ['cancelled', 'no_show'] },
      ...(providerId ? { providerId } : {}),
    },
    select: {
      startTime: true,
      endTime: true,
      providerId: true,
    },
  });

  return appointments;
}

/**
 * Get appointments for a date range.
 * Returns appointments grouped by ISO date string for efficient in-memory lookup.
 */
export async function getAppointmentsForRange(
  startDate: Date,
  endDate: Date,
  providerId?: string
): Promise<Map<string, Array<{ startTime: Date; endTime: Date; providerId: string | null }>>> {
  const startOfRange = new Date(startDate);
  startOfRange.setHours(0, 0, 0, 0);

  const endOfRange = new Date(endDate);
  endOfRange.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: startOfRange, lte: endOfRange },
      status: { notIn: ['cancelled', 'no_show'] },
      ...(providerId ? { providerId } : {}),
    },
    select: {
      startTime: true,
      endTime: true,
      providerId: true,
    },
  });

  // Group by ISO date
  const byDate = new Map<string, Array<{ startTime: Date; endTime: Date; providerId: string | null }>>();
  for (const apt of appointments) {
    const isoDate = apt.startTime.toISOString().split('T')[0];
    const existing = byDate.get(isoDate) || [];
    existing.push(apt);
    byDate.set(isoDate, existing);
  }

  return byDate;
}

// ============================================
// Availability Computation
// ============================================

/**
 * Check if two time ranges overlap.
 */
function rangesOverlap(
  start1: Date, end1: Date,
  start2: Date, end2: Date
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Compute available time windows for a date.
 * Availability = Schedule Templates - Booked Appointments
 */
export async function computeAvailability(
  date: Date,
  options?: AvailabilityOptions
): Promise<TimeWindow[]> {
  // Get schedule templates for the day
  const templates = await getScheduleTemplatesForDay(date, {
    providerId: options?.providerId,
    serviceId: options?.serviceId,
  });

  if (templates.length === 0) {
    return [];
  }

  // Generate all possible time windows from templates
  const allWindows: TimeWindow[] = [];
  for (const template of templates) {
    const windows = generateTimeWindows(template, date, options?.slotDuration);
    allWindows.push(...windows);
  }

  // Get appointments for the day
  const appointments = await getAppointmentsForDate(date, options?.providerId);

  // Filter out windows that overlap with appointments
  let availableWindows = allWindows.filter(window => {
    // Check if this window overlaps with any appointment
    const hasConflict = appointments.some(apt => {
      // If filtering by provider, only check appointments for that provider
      if (options?.providerId && apt.providerId !== options.providerId) {
        return false;
      }

      return rangesOverlap(
        window.startTime, window.endTime,
        apt.startTime, apt.endTime
      );
    });

    return !hasConflict;
  });

  // Filter out times that don't meet minimum lead time (2 hours)
  const now = new Date();
  const minLeadTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
  const todayISO = now.toISOString().split('T')[0];
  const dateISO = date.toISOString().split('T')[0];
  if (dateISO === todayISO) {
    availableWindows = availableWindows.filter(w => w.startTime >= minLeadTime);
  }

  // Sort by start time
  availableWindows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return availableWindows
}

/**
 * Check if a specific time range is available.
 * Returns true if no conflicting appointments exist.
 */
export async function isTimeAvailable(
  startTime: Date,
  endTime: Date,
  providerId?: string
): Promise<boolean> {
  // Query for overlapping appointments
  const conflicting = await prisma.appointment.findFirst({
    where: {
      status: { notIn: ['cancelled', 'no_show'] },
      ...(providerId ? { providerId } : {}),
      // Overlap condition: starts before end AND ends after start
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  return conflicting === null;
}

/**
 * Check if a time falls within a provider's schedule.
 * Returns true if the time is within the provider's working hours.
 */
export async function isWithinSchedule(
  startTime: Date,
  endTime: Date,
  providerId: string
): Promise<boolean> {
  const templates = await getScheduleTemplates(providerId, startTime);

  if (templates.length === 0) {
    return false;
  }

  // Check if the requested time falls within any template's hours
  const startHour = startTime.getHours();
  const startMin = startTime.getMinutes();
  const endHour = endTime.getHours();
  const endMin = endTime.getMinutes();

  const requestedStartMins = startHour * 60 + startMin;
  const requestedEndMins = endHour * 60 + endMin;

  for (const template of templates) {
    const [tStartHour, tStartMin] = template.startTime.split(':').map(Number);
    const [tEndHour, tEndMin] = template.endTime.split(':').map(Number);

    const templateStartMins = tStartHour * 60 + tStartMin;
    const templateEndMins = tEndHour * 60 + tEndMin;

    if (requestedStartMins >= templateStartMins && requestedEndMins <= templateEndMins) {
      return true;
    }
  }

  return false;
}

// ============================================
// Time of Day Filtering
// ============================================

const TIME_OF_DAY_RANGES: Record<TimeOfDay, { startHour: number; endHour: number }> = {
  morning: { startHour: 6, endHour: 12 },    // 6:00 - 11:59
  afternoon: { startHour: 12, endHour: 17 }, // 12:00 - 16:59
  evening: { startHour: 17, endHour: 21 },   // 17:00 - 20:59
};

/**
 * Filter time windows by time of day.
 */
function filterByTimeOfDay(windows: TimeWindow[], timeOfDay: TimeOfDay): TimeWindow[] {
  const range = TIME_OF_DAY_RANGES[timeOfDay];
  return windows.filter(w => {
    const hour = w.startTime.getHours();
    return hour >= range.startHour && hour < range.endHour;
  });
}

// ============================================
// Availability Search (Multi-Day)
// ============================================

const DEFAULT_MAX_DAYS = 30;

/**
 * Search for availability across multiple days.
 * Efficiently batch-queries templates and appointments, then computes in-memory.
 */
export async function searchAvailability(
  criteria: AvailabilitySearchCriteria
): Promise<AvailabilitySearchResult> {
  const {
    startDate,
    endDate,
    daysOfWeek,
    timeOfDay,
    findFirst = false,
    maxDays = DEFAULT_MAX_DAYS,
    providerId,
    serviceId,
  } = criteria;

  // Calculate effective end date
  const effectiveEndDate = endDate ?? new Date(startDate.getTime() + maxDays * 24 * 60 * 60 * 1000);

  // Batch query: get all templates for the range
  const templatesByDay = await getScheduleTemplatesForRange(startDate, effectiveEndDate, {
    providerId,
    serviceId,
  });

  // Determine which days of week have templates (skip days with no schedules)
  const daysWithTemplates = new Set(templatesByDay.keys());

  // If filtering by daysOfWeek, intersect with days that have templates
  const effectiveDaysOfWeek = daysOfWeek
    ? daysOfWeek.filter(d => daysWithTemplates.has(d))
    : [...daysWithTemplates];

  if (effectiveDaysOfWeek.length === 0) {
    // No days match criteria
    return {
      availabilityByDate: new Map(),
      daysSearched: 0,
    };
  }

  // Batch query: get all appointments for the range
  const appointmentsByDate = await getAppointmentsForRange(startDate, effectiveEndDate, providerId);

  // Iterate through dates
  const availabilityByDate = new Map<string, TimeWindow[]>();
  let daysSearched = 0;
  let firstAvailableDate: string | undefined;

  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= effectiveEndDate && daysSearched < maxDays) {
    const dayOfWeek = currentDate.getDay();

    // Skip if day of week doesn't match filter
    if (!effectiveDaysOfWeek.includes(dayOfWeek)) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    daysSearched++;
    const isoDate = currentDate.toISOString().split('T')[0];

    // Get templates for this day of week
    const templates = templatesByDay.get(dayOfWeek) || [];

    // Generate time windows from templates
    let windows: TimeWindow[] = [];
    for (const template of templates) {
      const templateWindows = generateTimeWindows(template, new Date(currentDate));
      windows.push(...templateWindows);
    }

    // Filter by time of day if specified
    if (timeOfDay && windows.length > 0) {
      windows = filterByTimeOfDay(windows, timeOfDay);
    }

    // Filter out windows that conflict with appointments
    const dayAppointments = appointmentsByDate.get(isoDate) || [];
    windows = windows.filter(window => {
      const hasConflict = dayAppointments.some(apt => {
        if (providerId && apt.providerId !== providerId) {
          return false;
        }
        return rangesOverlap(
          window.startTime, window.endTime,
          apt.startTime, apt.endTime
        );
      });
      return !hasConflict;
    });

    // Filter out times that don't meet minimum lead time (2 hours)
    const now = new Date();
    const minLeadTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    const todayISO = now.toISOString().split('T')[0];
    if (isoDate === todayISO) {
      windows = windows.filter(w => w.startTime >= minLeadTime);
    }

    // Sort by start time
    windows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    if (windows.length > 0) {
      availabilityByDate.set(isoDate, windows);

      if (findFirst && !firstAvailableDate) {
        firstAvailableDate = isoDate;
        // Stop searching - we found the first available day
        break;
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    availabilityByDate,
    firstAvailableDate,
    daysSearched,
  };
}
