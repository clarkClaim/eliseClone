// OpenMRS HTTP Client
// Handles authentication, retry logic, and timeout configuration

import {
  AuthenticationError,
  MRSError,
  MRSUnavailableError,
  TimeoutError,
} from '../errors.js';

export interface OpenMRSClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class OpenMRSClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: OpenMRSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Make a GET request to the OpenMRS REST API.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
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

  /**
   * Validate connection by fetching session info.
   * @throws AuthenticationError if credentials are invalid
   */
  async validateConnection(): Promise<boolean> {
    const response = await this.get<{ authenticated: boolean }>('/session');
    return response?.authenticated ?? false;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/ws/rest/v1${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff
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

        // Handle specific status codes
        if (response.status === 401) {
          throw new AuthenticationError();
        }

        if (response.status === 404) {
          return null as T; // Let caller handle not found
        }

        if (response.status >= 500) {
          const errorText = await response.text().catch(() => 'Unknown server error');
          throw new MRSUnavailableError(`OpenMRS server error: ${errorText}`, response.status);
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new MRSError(`OpenMRS request failed: ${errorText}`, response.status);
        }

        // Empty response (e.g., DELETE)
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return undefined as T;
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors
        if (error instanceof MRSError && !error.retryable) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt === this.maxRetries) {
          break;
        }

        // Only retry on retryable errors
        if (error instanceof TimeoutError || error instanceof MRSUnavailableError) {
          continue;
        }

        // Network errors are retryable
        if (error instanceof TypeError && error.message.includes('fetch')) {
          continue;
        }

        // Unknown errors are not retried
        throw error;
      }
    }

    throw lastError ?? new MRSError('Request failed after retries');
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
