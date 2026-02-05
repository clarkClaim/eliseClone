import { prisma } from '../../db/client.js';
import { parseDate, formatTimeForSpeech, formatDateForSpeech } from '../../utils/date.js';
import {
  computeAvailability,
  searchAvailability,
  type TimeOfDay,
  type TimeWindow,
} from '../../scheduling/index.js';

// ============================================
// Types
// ============================================

export interface GetAvailabilityParams {
  // Option A: Single date (existing)
  date?: string;

  // Option B: Date range
  dateRange?: {
    startDate: string;
    endDate: string;
  };

  // Option C: Search criteria
  search?: {
    daysAhead?: number;
    daysOfWeek?: number[];
    timeOfDay?: TimeOfDay;
    findFirst?: boolean;
  };

  // Filters
  providerId?: string;
  serviceId?: string;
}

export interface AvailabilitySlot {
  date: string;          // ISO date
  dateForSpeech: string; // "Monday, March 5"
  startTime: string;
  endTime: string;
  providerId: string;
  providerName: string;
  /** False if provider name contains "unknown" - bot should skip mentioning provider */
  providerKnown: boolean;
}

export interface GetAvailabilityResult {
  success: boolean;
  // Single date result (backwards compatible)
  date?: string;
  slots?: AvailabilitySlot[];
  // Multi-day result
  availabilityByDate?: Record<string, AvailabilitySlot[]>;
  firstAvailableDate?: string;
  daysSearched?: number;
  // Summary for voice
  summary?: string;
  error?: string;
}

// ============================================
// Slot Curation
// ============================================

const MAX_TOTAL_SLOTS = 8;
const MAX_SLOTS_PER_DAY = 2;
const MAX_SUMMARY_TIMES = 5;

/**
 * Check if a provider name is "known" (not unknown/placeholder).
 * Returns false for names containing "unknown", empty names, or generic placeholders.
 */
function isProviderNameKnown(name: string | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return !lower.includes('unknown') && !lower.includes('placeholder');
}

/**
 * Select a curated subset of slots from multi-day results.
 * Prioritizes variety: different days, different times.
 */
function curateSlots(
  availabilityByDate: Map<string, TimeWindow[]>,
  providerMap: Map<string, string>
): { curated: AvailabilitySlot[]; byDate: Record<string, AvailabilitySlot[]> } {
  const curated: AvailabilitySlot[] = [];
  const byDate: Record<string, AvailabilitySlot[]> = {};

  const sortedDates = [...availabilityByDate.keys()].sort();
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];

  for (const isoDate of sortedDates) {
    // Skip dates in the past entirely
    if (isoDate < todayISO) continue;

    let windows = availabilityByDate.get(isoDate) || [];
    if (windows.length === 0) continue;

    // Filter out times that have already passed today
    if (isoDate === todayISO) {
      windows = windows.filter(w => w.startTime > now);
      if (windows.length === 0) continue;
    }

    const dateObj = new Date(isoDate + 'T00:00:00');
    const dateForSpeech = formatDateForSpeech(dateObj);

    // Select up to MAX_SLOTS_PER_DAY, prioritizing variety (early + late)
    const selected: TimeWindow[] = [];
    if (windows.length <= MAX_SLOTS_PER_DAY) {
      selected.push(...windows);
    } else {
      // Pick first and a later one for variety
      selected.push(windows[0]);
      const laterIndex = Math.min(Math.floor(windows.length / 2), windows.length - 1);
      if (laterIndex !== 0) {
        selected.push(windows[laterIndex]);
      }
    }

    const daySlots: AvailabilitySlot[] = selected.map(w => {
      const rawProviderName = w.providerId ? (providerMap.get(w.providerId) || 'Unknown') : 'Any provider';
      const providerKnown = isProviderNameKnown(rawProviderName);
      return {
        date: isoDate,
        dateForSpeech,
        startTime: formatTimeForSpeech(w.startTime),
        endTime: formatTimeForSpeech(w.endTime),
        providerId: w.providerId || '',
        // Only include provider name if it's known - prevents LLM from saying "unknown provider"
        providerName: providerKnown ? rawProviderName : '',
        providerKnown,
      };
    });

    byDate[isoDate] = daySlots;

    // Add to curated list up to max
    for (const slot of daySlots) {
      if (curated.length >= MAX_TOTAL_SLOTS) break;
      curated.push(slot);
    }

    if (curated.length >= MAX_TOTAL_SLOTS) break;
  }

  return { curated, byDate };
}

// ============================================
// Summary Generation
// ============================================

function generateMultiDaySummary(
  curated: AvailabilitySlot[],
  findFirst: boolean,
  daysSearched: number
): string {
  if (curated.length === 0) {
    return `I'm sorry, there are no available appointments in the next ${daysSearched} days. Would you like me to check a different timeframe?`;
  }

  if (findFirst) {
    const first = curated[0];
    return `The next available appointment is ${first.dateForSpeech} at ${first.startTime}. Would you like to book that?`;
  }

  // Group by date for natural summary
  const byDate = new Map<string, AvailabilitySlot[]>();
  for (const slot of curated) {
    const existing = byDate.get(slot.dateForSpeech) || [];
    existing.push(slot);
    byDate.set(slot.dateForSpeech, existing);
  }

  const parts: string[] = [];
  let timeCount = 0;

  for (const [dateStr, slots] of byDate) {
    if (timeCount >= MAX_SUMMARY_TIMES) break;

    const times = slots
      .slice(0, MAX_SUMMARY_TIMES - timeCount)
      .map(s => s.startTime);
    timeCount += times.length;

    if (times.length === 1) {
      parts.push(`${dateStr} at ${times[0]}`);
    } else {
      parts.push(`${dateStr} at ${times.join(' or ')}`);
    }
  }

  const optionsList = parts.length === 1
    ? parts[0]
    : parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1];

  return `I have openings on ${optionsList}. Which works best for you?`;
}

// ============================================
// Main Function
// ============================================

// Business hours: 7 AM to 6 PM
const BUSINESS_HOURS_START = 7;
const BUSINESS_HOURS_END = 18;
const DEFAULT_MAX_DAYS = 90; // 3 months

export async function getAvailability(
  params: GetAvailabilityParams
): Promise<GetAvailabilityResult> {
  const { date, dateRange, search, providerId, serviceId } = params;

  const now = new Date();
  const currentHour = now.getHours();

  // Start from tomorrow if outside business hours
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOutsideBusinessHours = currentHour < BUSINESS_HOURS_START || currentHour >= BUSINESS_HOURS_END;

  const effectiveStartDate = new Date(today);
  if (isOutsideBusinessHours) {
    effectiveStartDate.setDate(effectiveStartDate.getDate() + 1);
  }

  // Determine query mode: search > dateRange > date
  const useSearch = search && (search.daysAhead || search.daysOfWeek || search.findFirst);
  const useDateRange = dateRange && dateRange.startDate && dateRange.endDate;

  // ----------------------------------------
  // Mode: Search (multi-day with criteria)
  // ----------------------------------------
  if (useSearch) {
    const startDate = effectiveStartDate;
    const maxDays = search.daysAhead || DEFAULT_MAX_DAYS;

    const result = await searchAvailability({
      startDate,
      maxDays,
      daysOfWeek: search.daysOfWeek,
      timeOfDay: search.timeOfDay,
      findFirst: search.findFirst,
      providerId,
      serviceId,
    });

    // Get provider names
    const providerIds = new Set<string>();
    for (const windows of result.availabilityByDate.values()) {
      for (const w of windows) {
        if (w.providerId) providerIds.add(w.providerId);
      }
    }
    const providers = await prisma.provider.findMany({
      where: { id: { in: [...providerIds] } },
      select: { id: true, name: true },
    });
    const providerMap = new Map(providers.map(p => [p.id, p.name]));

    const { curated, byDate } = curateSlots(result.availabilityByDate, providerMap);
    const summary = generateMultiDaySummary(curated, search.findFirst || false, result.daysSearched);

    return {
      success: true,
      slots: curated,
      availabilityByDate: byDate,
      firstAvailableDate: result.firstAvailableDate,
      daysSearched: result.daysSearched,
      summary,
    };
  }

  // ----------------------------------------
  // Mode: Date Range
  // ----------------------------------------
  if (useDateRange) {
    let startDate = parseDate(dateRange.startDate);
    let endDate = parseDate(dateRange.endDate);

    if (!startDate || !endDate) {
      return {
        success: false,
        error: 'Could not understand the date range. Please try specific dates like "March 1" and "March 7".',
      };
    }

    // If the entire range is in the past, assume they meant a future year
    // e.g., "December" in February 2026 should mean December 2026, not December 2025
    if (endDate < effectiveStartDate) {
      const yearDiff = effectiveStartDate.getFullYear() - endDate.getFullYear();
      const yearsToAdd = yearDiff + (endDate.getMonth() < effectiveStartDate.getMonth() ? 1 : 0);
      startDate.setFullYear(startDate.getFullYear() + yearsToAdd);
      endDate.setFullYear(endDate.getFullYear() + yearsToAdd);
    }

    if (startDate < effectiveStartDate) {
      startDate.setTime(effectiveStartDate.getTime());
    }

    const result = await searchAvailability({
      startDate,
      endDate,
      providerId,
      serviceId,
    });

    // Get provider names
    const providerIds = new Set<string>();
    for (const windows of result.availabilityByDate.values()) {
      for (const w of windows) {
        if (w.providerId) providerIds.add(w.providerId);
      }
    }
    const providers = await prisma.provider.findMany({
      where: { id: { in: [...providerIds] } },
      select: { id: true, name: true },
    });
    const providerMap = new Map(providers.map(p => [p.id, p.name]));

    const { curated, byDate } = curateSlots(result.availabilityByDate, providerMap);
    const summary = generateMultiDaySummary(curated, false, result.daysSearched);

    return {
      success: true,
      slots: curated,
      availabilityByDate: byDate,
      daysSearched: result.daysSearched,
      summary,
    };
  }

  // ----------------------------------------
  // Mode: Single Date (backwards compatible)
  // ----------------------------------------
  if (!date) {
    return {
      success: false,
      error: 'Please specify a date, date range, or search criteria.',
    };
  }

  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      success: false,
      error: 'Could not understand that date. Please try something like "tomorrow", "Monday", or "March 5th".',
    };
  }

  if (parsedDate < effectiveStartDate) {
    return {
      success: false,
      error: 'That date is in the past. Please choose a future date.',
    };
  }

  const timeWindows = await computeAvailability(parsedDate, {
    providerId,
    serviceId,
  });

  const dateStr = formatDateForSpeech(parsedDate);
  const isoDate = parsedDate.toISOString().split('T')[0];

  if (timeWindows.length === 0) {
    return {
      success: true,
      date: dateStr,
      slots: [],
      summary: `Sorry, there are no available appointments on ${dateStr}. Would you like to try a different day?`,
    };
  }

  // Get provider names
  const providerIds = [...new Set(timeWindows.map(w => w.providerId).filter(Boolean))] as string[];
  const providers = await prisma.provider.findMany({
    where: { id: { in: providerIds } },
    select: { id: true, name: true },
  });
  const providerMap = new Map(providers.map(p => [p.id, p.name]));

  // Format slots
  const slots: AvailabilitySlot[] = timeWindows.slice(0, 10).map(window => {
    const rawProviderName = window.providerId ? (providerMap.get(window.providerId) || 'Unknown') : 'Any provider';
    const providerKnown = isProviderNameKnown(rawProviderName);
    return {
      date: isoDate,
      dateForSpeech: dateStr,
      startTime: formatTimeForSpeech(window.startTime),
      endTime: formatTimeForSpeech(window.endTime),
      providerId: window.providerId || '',
      // Only include provider name if it's known - prevents LLM from saying "unknown provider"
      providerName: providerKnown ? rawProviderName : '',
      providerKnown,
    };
  });

  // Generate summary - only mention providers if they're known
  const knownProviders = [...new Set(slots.filter(s => s.providerKnown).map(s => s.providerName))];
  const firstSlot = slots[0];
  const lastSlot = slots[slots.length - 1];

  let summary: string;
  if (timeWindows.length <= 3) {
    const slotList = slots.map(s => s.startTime).join(', ');
    summary = `On ${dateStr}, I have appointments available at ${slotList}. Which time works for you?`;
  } else {
    summary = `On ${dateStr}, I have ${timeWindows.length} appointments available from ${firstSlot.startTime} to ${lastSlot.startTime}`;
    // Only mention providers if we have known ones
    if (knownProviders.length > 0) {
      summary += ` with ${knownProviders.join(' and ')}`;
    }
    summary += '. What time would you prefer?';
  }

  return {
    success: true,
    date: dateStr,
    slots,
    summary,
  };
}
