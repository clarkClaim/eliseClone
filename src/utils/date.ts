const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const DAYS_OF_WEEK: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Parse date from various formats
 * Supports: ISO, US format, natural language, relative ("tomorrow", "Monday", "next Tuesday")
 */
export function parseDate(input: string): Date | null {
  if (!input) return null;

  const trimmed = input.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Relative dates
  if (trimmed === 'today') {
    return today;
  }

  if (trimmed === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow;
  }

  // Day of week (e.g., "Monday", "next Tuesday")
  const nextMatch = trimmed.match(/^(?:next\s+)?(\w+)$/);
  if (nextMatch) {
    const dayName = nextMatch[1];
    const targetDay = DAYS_OF_WEEK[dayName];
    if (targetDay !== undefined) {
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      // If today or past, go to next week
      if (daysUntil <= 0 || trimmed.startsWith('next')) {
        daysUntil += 7;
      }
      const result = new Date(today);
      result.setDate(today.getDate() + daysUntil);
      return result;
    }
  }

  // "In X days"
  const inDaysMatch = trimmed.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const result = new Date(today);
    result.setDate(today.getDate() + days);
    return result;
  }

  // Try ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try US format: MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try "DayOfWeek, Month Day" format: "Monday, February 9"
  const dayMonthMatch = trimmed.match(/^([a-z]+),?\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (dayMonthMatch) {
    const [, , monthStr, day] = dayMonthMatch;
    const month = MONTHS[monthStr];
    if (month !== undefined) {
      const result = new Date(today.getFullYear(), month, parseInt(day));
      // If date is in the past, use next year
      if (result < today) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }
  }

  // Try natural language: "March 5th", "March 5", "March 5, 2026"
  const naturalMatch = trimmed.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/);
  if (naturalMatch) {
    const [, monthStr, day, year] = naturalMatch;
    const month = MONTHS[monthStr];
    if (month !== undefined) {
      const yearNum = year ? parseInt(year) : today.getFullYear();
      const result = new Date(yearNum, month, parseInt(day));
      // If date is in the past and no year specified, use next year
      if (!year && result < today) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }
  }

  // Try parsing with built-in Date (fallback)
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Parse time from various formats
 * Supports: "10am", "10:30am", "2 PM", "14:30", "10 o'clock"
 */
export function parseTime(input: string): { hours: number; minutes: number } | null {
  if (!input) return null;

  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '');

  // "10am", "10:30am", "2pm", "2:30 pm"
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1]);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0;
    const isPm = ampmMatch[3] === 'pm';

    if (hours === 12) {
      hours = isPm ? 12 : 0;
    } else if (isPm) {
      hours += 12;
    }

    return { hours, minutes };
  }

  // 24-hour format: "14:30"
  const militaryMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (militaryMatch) {
    return {
      hours: parseInt(militaryMatch[1]),
      minutes: parseInt(militaryMatch[2]),
    };
  }

  // "10 o'clock"
  const oclockMatch = trimmed.match(/^(\d{1,2})\s*o'?clock$/);
  if (oclockMatch) {
    const hours = parseInt(oclockMatch[1]);
    return { hours: hours >= 1 && hours <= 6 ? hours + 12 : hours, minutes: 0 };
  }

  return null;
}

/**
 * Format a time for natural speech
 * e.g., "10:00 AM", "2:30 PM"
 */
export function formatTimeForSpeech(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date for natural speech
 * Returns "Today" for today, "Tomorrow" for tomorrow, otherwise "Monday, March 5"
 */
export function formatDateForSpeech(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  }

  if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Compare two dates for equality (date only, ignoring time)
 * Uses UTC to avoid timezone issues with dates stored in database
 */
export function isSameDate(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}
