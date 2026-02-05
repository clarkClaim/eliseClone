import { prisma } from '../../db/client.js';
import { formatDateForSpeech, formatTimeForSpeech } from '../../utils/date.js';
import { formatProviderNameForSpeech } from '../../utils/provider.js';
import { searchAvailability } from '../../scheduling/index.js';
import { isTimeInvalidated } from '../../scheduling/availability-cache.js';

export interface SuggestedSlot {
  dateForSpeech: string;
  timeForSpeech: string;
  providerName: string;
}

export interface SuggestedAvailability {
  slots: SuggestedSlot[];
  summary: string;
}

/**
 * Get a few suggested availability slots.
 * This allows the assistant to offer scheduling without a separate get_availability call.
 */
export async function getSuggestedAvailability(): Promise<SuggestedAvailability> {
  const result = await searchAvailability({
    startDate: new Date(),
    maxDays: 14,
    findFirst: false,
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

  // Take first 3 slots across different days for variety
  // Filter out any slots that were recently booked (in invalidation cache)
  const slots: SuggestedSlot[] = [];
  const seenDates = new Set<string>();

  for (const [isoDate, windows] of [...result.availabilityByDate.entries()].sort()) {
    if (slots.length >= 3) break;
    if (seenDates.has(isoDate)) continue;

    // Find first window that is not invalidated
    const availableWindow = windows.find(w =>
      !isTimeInvalidated(w.startTime, w.endTime, w.providerId)
    );
    const firstWindow = availableWindow;
    if (!firstWindow) continue;

    const rawName = firstWindow.providerId ? providerMap.get(firstWindow.providerId) : undefined;

    slots.push({
      dateForSpeech: formatDateForSpeech(firstWindow.startTime),
      timeForSpeech: formatTimeForSpeech(firstWindow.startTime),
      providerName: formatProviderNameForSpeech(rawName),
    });
    seenDates.add(isoDate);
  }

  if (slots.length === 0) {
    return { slots: [], summary: 'No appointments are currently available. Please check back later.' };
  }

  const slotDescriptions = slots.map(s => `${s.dateForSpeech} at ${s.timeForSpeech}`);
  const summary = slots.length === 1
    ? `The next available appointment is ${slotDescriptions[0]}.`
    : `I have openings on ${slotDescriptions.slice(0, -1).join(', ')} or ${slotDescriptions[slotDescriptions.length - 1]}.`;

  return { slots, summary };
}
