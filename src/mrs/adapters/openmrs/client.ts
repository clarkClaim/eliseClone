// OpenMRS HTTP Client
// Handles authentication, retry logic, timeout configuration, and rate limit tracking

import {
  AuthenticationError,
  MRSError,
  MRSUnavailableError,
  MRSRateLimitError,
  TimeoutError,
} from '../../errors.js';

export interface OpenMRSClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RateLimitState {
  remaining: number | null;
  resetAt: Date | null;
  lastUpdated: Date;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class OpenMRSClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private rateLimitState: RateLimitState = {
    remaining: null,
    resetAt: null,
    lastUpdated: new Date(),
  };

  constructor(config: OpenMRSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Get the current rate limit state.
   */
  getRateLimitState(): RateLimitState {
    return { ...this.rateLimitState };
  }

  /**
   * Make a GET request to the OpenMRS REST API.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * Make a GET request to the OpenMRS FHIR API.
   * FHIR is used for bulk patient listing since REST API doesn't support it.
   */
  async getFhir<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined, true);
  }

  /**
   * Make a POST request to the OpenMRS REST API.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Make a DELETE request to the OpenMRS REST API.
   */
  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path);
  }

  // ============================================
  // Bahmni Appointments API Methods
  // ============================================

  /**
   * Get all appointment services (Bahmni).
   * Returns array of appointment services or null if module not available.
   */
  async getAppointmentServices<T>(): Promise<T | null> {
    return this.get<T>('/appointmentService/all/full');
  }

  /**
   * Search appointments with filters (Bahmni).
   * POST body can include: patientUuid, serviceUuid, startDate, endDate, providerUuid, locationUuid, status
   */
  async searchAppointments<T>(filter: {
    patientUuid?: string;
    serviceUuid?: string;
    startDate?: string;
    endDate?: string;
    providerUuid?: string;
    locationUuid?: string;
    status?: string;
  }): Promise<T | null> {
    return this.post<T>('/appointment/search', filter);
  }

  /**
   * Create an appointment (Bahmni).
   */
  async createBahmniAppointment<T>(appointment: {
    patientUuid: string;
    serviceUuid: string;
    startDateTime: string;
    endDateTime: string;
    appointmentKind: string;
    locationUuid?: string;
    providers?: Array<{ uuid: string }>;
    comments?: string;
  }): Promise<T> {
    return this.post<T>('/appointment', appointment);
  }

  /**
   * Get appointment by UUID (Bahmni).
   */
  async getAppointmentByUuid<T>(uuid: string): Promise<T | null> {
    return this.get<T>(`/appointment?uuid=${uuid}`);
  }

  /**
   * Update an appointment (Bahmni).
   * Used for status changes, cancellation, etc.
   * Bahmni requires certain fields (like appointmentKind, serviceUuid) even for updates.
   */
  async updateBahmniAppointment<T>(uuid: string, updates: {
    status?: string;
    comments?: string;
    appointmentKind?: string;
    serviceUuid?: string;
  }): Promise<T> {
    // Bahmni requires appointmentKind and serviceUuid for all appointment operations
    return this.post<T>('/appointment', { uuid, ...updates });
  }

  /**
   * Validate connection by fetching session info.
   * @throws AuthenticationError if credentials are invalid
   */
  async validateConnection(): Promise<boolean> {
    const response = await this.get<{ authenticated: boolean }>('/session');
    return response?.authenticated ?? false;
  }

  // ============================================
  // Patient API Methods
  // ============================================

  /**
   * Create a new patient in OpenMRS.
   * POST /patient with nested person object.
   */
  async createPatient<T>(payload: {
    person: {
      names: Array<{ givenName: string; familyName: string; preferred: boolean }>;
      gender?: string;
      birthdate: string;
      attributes?: Array<{ attributeType: string; value: string }>;
    };
    identifiers: Array<{
      identifier: string;
      identifierType: string;
      location: string;
    }>;
  }): Promise<T> {
    return this.post<T>('/patient', payload);
  }

  private async request<T>(method: string, path: string, body?: unknown, useFhir = false): Promise<T> {
    const apiPath = useFhir ? '/ws/fhir2/R4' : '/ws/rest/v1';
    const url = `${this.baseUrl}${apiPath}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      try {
        const response = await this.fetchWithTimeout(url, {
          method,
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        this.updateRateLimitState(response.headers);

        if (response.status === 401) {
          throw new AuthenticationError();
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
          throw new MRSRateLimitError(retryAfterMs);
        }

        if (response.status === 404) {
          return null as T;
        }

        if (response.status >= 500) {
          const errorText = await response.text().catch(() => 'Unknown server error');
          throw new MRSUnavailableError(`OpenMRS server error: ${errorText}`, response.status);
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new MRSError(`OpenMRS request failed: ${errorText}`, response.status);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return undefined as T;
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof MRSError && !error.retryable) {
          throw error;
        }

        if (attempt === this.maxRetries) {
          break;
        }

        if (error instanceof TimeoutError || error instanceof MRSUnavailableError || error instanceof MRSRateLimitError) {
          continue;
        }

        if (error instanceof TypeError && error.message.includes('fetch')) {
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new MRSError('Request failed after retries');
  }

  private updateRateLimitState(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (remaining !== null) {
      this.rateLimitState.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.rateLimitState.resetAt = new Date(parseInt(reset, 10) * 1000);
    }
    this.rateLimitState.lastUpdated = new Date();
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(this.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
