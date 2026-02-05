// Availability Cache
// Tracks recently booked/cancelled times to prevent stale availability suggestions

/**
 * Entry in the invalidation cache.
 * Stores time ranges that should be excluded from availability queries.
 */
interface InvalidationEntry {
  startTime: Date;
  endTime: Date;
  providerId?: string;
  invalidatedAt: Date;
  reason: 'booking' | 'cancellation';
}

/**
 * In-memory cache for recently invalidated time ranges.
 * Entries are automatically purged after TTL expires.
 */
class AvailabilityCache {
  private readonly invalidations: InvalidationEntry[] = [];
  private readonly ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) { // 5 minute default TTL
    this.ttlMs = ttlMs;
  }

  /**
   * Invalidate a time range (mark as unavailable).
   * Call this after a successful booking.
   */
  invalidate(startTime: Date, endTime: Date, providerId?: string): void {
    this.purgeExpired();
    this.invalidations.push({
      startTime,
      endTime,
      providerId,
      invalidatedAt: new Date(),
      reason: 'booking',
    });
    console.log(`[AvailabilityCache] Invalidated time: ${startTime.toISOString()} - ${endTime.toISOString()} for provider ${providerId ?? 'all'}`);
  }

  /**
   * Revalidate a time range (mark as available again).
   * Call this after a cancellation.
   */
  revalidate(startTime: Date, endTime: Date, providerId?: string): void {
    // Remove matching invalidations
    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();

    for (let i = this.invalidations.length - 1; i >= 0; i--) {
      const entry = this.invalidations[i];
      if (
        entry.startTime.getTime() === startTimeMs &&
        entry.endTime.getTime() === endTimeMs &&
        (!providerId || entry.providerId === providerId)
      ) {
        this.invalidations.splice(i, 1);
      }
    }
    console.log(`[AvailabilityCache] Revalidated time: ${startTime.toISOString()} - ${endTime.toISOString()} for provider ${providerId ?? 'all'}`);
  }

  /**
   * Check if a time range is invalidated (recently booked).
   */
  isInvalidated(startTime: Date, endTime: Date, providerId?: string): boolean {
    this.purgeExpired();

    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();

    return this.invalidations.some(entry => {
      // Check provider match (if specified)
      if (providerId && entry.providerId && entry.providerId !== providerId) {
        return false;
      }

      // Check time overlap
      return (
        entry.startTime.getTime() < endTimeMs &&
        entry.endTime.getTime() > startTimeMs
      );
    });
  }

  /**
   * Get all active invalidations (for debugging).
   */
  getInvalidations(): InvalidationEntry[] {
    this.purgeExpired();
    return [...this.invalidations];
  }

  /**
   * Clear all invalidations (for testing).
   */
  clear(): void {
    this.invalidations.length = 0;
  }

  /**
   * Purge expired entries.
   */
  private purgeExpired(): void {
    const now = Date.now();
    for (let i = this.invalidations.length - 1; i >= 0; i--) {
      if (now - this.invalidations[i].invalidatedAt.getTime() > this.ttlMs) {
        this.invalidations.splice(i, 1);
      }
    }
  }
}

// Singleton instance
export const availabilityCache = new AvailabilityCache();

/**
 * Invalidate availability cache for a booked time range.
 * Call this after a successful booking to prevent the slot from being offered.
 */
export function invalidateAvailabilityCache(
  startTime: Date,
  endTime: Date,
  providerId?: string
): void {
  availabilityCache.invalidate(startTime, endTime, providerId);
}

/**
 * Revalidate availability cache for a cancelled time range.
 * Call this after a cancellation to allow the slot to be offered again.
 */
export function revalidateAvailabilityCache(
  startTime: Date,
  endTime: Date,
  providerId?: string
): void {
  availabilityCache.revalidate(startTime, endTime, providerId);
}

/**
 * Check if a time range is in the invalidation cache.
 * Used by availability queries to filter out recently booked times.
 */
export function isTimeInvalidated(
  startTime: Date,
  endTime: Date,
  providerId?: string
): boolean {
  return availabilityCache.isInvalidated(startTime, endTime, providerId);
}

/**
 * Clear all invalidations from the cache.
 * Used for testing.
 */
export function clearInvalidationCache(): void {
  availabilityCache.clear();
}
