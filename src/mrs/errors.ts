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
