// Rate Limiter
// Tracks rate limit consumption and implements backoff logic

import { prisma } from '../db/client.js';
import type { EntityType, RateLimitState } from './types.js';

const BASE_BACKOFF_MS = 60 * 1000;    // 1 minute
const MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes
const LOW_QUOTA_THRESHOLD = 0.2;       // 20% remaining

export interface RateLimiterConfig {
  requestsPerMinute: number | null;
  requestsPerHour: number | null;
  burstLimit: number | null;
}

export class RateLimiter {
  private state: RateLimitState = {
    remainingRequests: null,
    resetAt: null,
    consecutiveFailures: 0,
    backoffUntil: null,
  };
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Get the current rate limit state.
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Check if we should wait before making a request.
   */
  shouldWait(): boolean {
    if (this.state.backoffUntil && new Date() < this.state.backoffUntil) {
      return true;
    }
    return false;
  }

  /**
   * Get the time to wait before the next request (in ms).
   */
  getWaitTimeMs(): number {
    if (!this.state.backoffUntil) {
      return 0;
    }
    const waitTime = this.state.backoffUntil.getTime() - Date.now();
    return Math.max(0, waitTime);
  }

  /**
   * Check if we're running low on quota.
   */
  isLowQuota(): boolean {
    if (this.state.remainingRequests === null || this.config.requestsPerMinute === null) {
      return false;
    }
    return this.state.remainingRequests < this.config.requestsPerMinute * LOW_QUOTA_THRESHOLD;
  }

  /**
   * Update the rate limit state from response headers.
   */
  updateFromResponse(remaining: number | null, resetAt: Date | null): void {
    this.state.remainingRequests = remaining;
    this.state.resetAt = resetAt;

    if (remaining !== null && remaining > 0) {
      this.state.consecutiveFailures = 0;
      this.state.backoffUntil = null;
    }
  }

  /**
   * Record a successful request.
   */
  recordSuccess(): void {
    this.state.consecutiveFailures = 0;
    this.state.backoffUntil = null;

    if (this.state.remainingRequests !== null) {
      this.state.remainingRequests = Math.max(0, this.state.remainingRequests - 1);
    }
  }

  /**
   * Record a rate limit error (429).
   */
  recordRateLimitHit(retryAfterMs?: number): void {
    this.state.consecutiveFailures++;
    this.state.remainingRequests = 0;

    if (retryAfterMs) {
      this.state.backoffUntil = new Date(Date.now() + retryAfterMs);
    } else {
      this.state.backoffUntil = new Date(Date.now() + this.calculateBackoff());
    }
  }

  /**
   * Record a general failure (timeout, server error, etc.).
   */
  recordFailure(): void {
    this.state.consecutiveFailures++;
    this.state.backoffUntil = new Date(Date.now() + this.calculateBackoff());
  }

  /**
   * Reset the state after a rate limit reset period.
   */
  reset(): void {
    if (this.config.requestsPerMinute !== null) {
      this.state.remainingRequests = this.config.requestsPerMinute;
    }
    this.state.resetAt = null;
    this.state.backoffUntil = null;
  }

  /**
   * Calculate exponential backoff time.
   */
  private calculateBackoff(): number {
    const exponent = Math.min(this.state.consecutiveFailures, 10);
    const backoff = BASE_BACKOFF_MS * Math.pow(2, exponent - 1);
    return Math.min(backoff, MAX_BACKOFF_MS);
  }

  /**
   * Persist rate limit state to the database for an entity type.
   */
  async persistState(entityType: EntityType): Promise<void> {
    await prisma.syncState.upsert({
      where: { entityType },
      create: {
        entityType,
        syncStatus: 'idle',
        rateLimitRemaining: this.state.remainingRequests,
        rateLimitResetAt: this.state.resetAt,
        backoffUntil: this.state.backoffUntil,
        consecutiveFailures: this.state.consecutiveFailures,
      },
      update: {
        rateLimitRemaining: this.state.remainingRequests,
        rateLimitResetAt: this.state.resetAt,
        backoffUntil: this.state.backoffUntil,
        consecutiveFailures: this.state.consecutiveFailures,
      },
    });
  }

  /**
   * Load rate limit state from the database for an entity type.
   */
  async loadState(entityType: EntityType): Promise<void> {
    const state = await prisma.syncState.findUnique({
      where: { entityType },
    });

    if (state) {
      this.state = {
        remainingRequests: state.rateLimitRemaining,
        resetAt: state.rateLimitResetAt,
        consecutiveFailures: state.consecutiveFailures,
        backoffUntil: state.backoffUntil,
      };
    }
  }
}

/**
 * Calculate the adjusted sync interval based on rate limit state.
 */
export function calculateAdjustedInterval(
  baseInterval: number,
  rateLimitState: RateLimitState,
  isLowQuota: boolean
): number {
  if (isLowQuota) {
    return baseInterval * 2;
  }

  if (rateLimitState.consecutiveFailures > 0) {
    const multiplier = Math.min(1 + rateLimitState.consecutiveFailures * 0.5, 4);
    return Math.floor(baseInterval * multiplier);
  }

  return baseInterval;
}
