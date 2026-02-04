// MRS-specific error classes

/**
 * Base error class for all MRS-related errors.
 */
export class MRSError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode?: number, retryable = false) {
    super(message);
    this.name = 'MRSError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Thrown when authentication with the MRS fails.
 * Credentials may be invalid, expired, or missing.
 */
export class AuthenticationError extends MRSError {
  constructor(message = 'Authentication failed. Check MRS credentials.') {
    super(message, 401, false);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a requested resource is not found in the MRS.
 */
export class NotFoundError extends MRSError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, 404, false);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Thrown when an MRS request times out.
 */
export class TimeoutError extends MRSError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, undefined, true);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when the MRS is temporarily unavailable or returns a server error.
 * These errors are generally retryable.
 */
export class MRSUnavailableError extends MRSError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode, true);
    this.name = 'MRSUnavailableError';
  }
}

/**
 * Thrown when the MRS rejects a request due to invalid data or business rules.
 * For example, trying to book an already-booked slot.
 */
export class MRSValidationError extends MRSError {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, false);
    this.name = 'MRSValidationError';
    this.details = details;
  }
}

/**
 * Thrown when rate limits are exceeded.
 */
export class MRSRateLimitError extends MRSError {
  readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super(
      retryAfterMs
        ? `Rate limit exceeded. Retry after ${retryAfterMs}ms`
        : 'Rate limit exceeded',
      429,
      true
    );
    this.name = 'MRSRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Thrown when attempting to book a slot that is no longer available.
 */
export class SlotConflictError extends MRSError {
  readonly slotId: string;

  constructor(slotId: string) {
    super(`Slot ${slotId} is no longer available`, 409, false);
    this.name = 'SlotConflictError';
    this.slotId = slotId;
  }
}

/**
 * Thrown when a time slot cannot be found.
 */
export class SlotNotFoundError extends MRSError {
  readonly slotId: string;

  constructor(slotId: string) {
    super(`Time slot not found: ${slotId}`, 404, false);
    this.name = 'SlotNotFoundError';
    this.slotId = slotId;
  }
}

// Re-export with canonical names for consistency with design doc
export { AuthenticationError as MRSAuthenticationError };
export { TimeoutError as MRSTimeoutError };
