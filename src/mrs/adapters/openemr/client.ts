// OpenEMR HTTP Client
// Handles OAuth 2.0 authentication, token refresh, and API requests

import {
  AuthenticationError,
  MRSError,
  MRSUnavailableError,
  MRSRateLimitError,
  TimeoutError,
} from '../../errors.js';

export interface OpenEMRClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface TokenState {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const TOKEN_REFRESH_BUFFER_MS = 60000; // Refresh 1 minute before expiry

export class OpenEMRClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private tokenState: TokenState | null = null;

  constructor(config: OpenEMRClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.username = config.username;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Get the OAuth 2.0 token endpoint URL.
   */
  private get tokenUrl(): string {
    return `${this.baseUrl}/oauth2/default/token`;
  }

  /**
   * Check if we have a valid access token.
   */
  isAuthenticated(): boolean {
    if (!this.tokenState) return false;
    return this.tokenState.expiresAt > new Date();
  }

  /**
   * Acquire access token using OAuth 2.0 password grant.
   * @throws AuthenticationError if credentials are invalid
   */
  async authenticate(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username: this.username,
      password: this.password,
      scope: 'openid api:oemr user/patient.crus user/appointment.cruds',
    });

    const response = await this.fetchWithTimeout(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      if (response.status === 401 || response.status === 400) {
        throw new AuthenticationError(`OpenEMR authentication failed: ${errorText}`);
      }
      throw new MRSError(`OAuth token request failed: ${errorText}`, response.status);
    }

    const tokenResponse = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.tokenState = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
    };
  }

  /**
   * Refresh the access token using the refresh token.
   * Falls back to password grant if no refresh token available.
   */
  async refreshToken(): Promise<void> {
    if (!this.tokenState?.refreshToken) {
      // No refresh token, re-authenticate with password grant
      await this.authenticate();
      return;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokenState.refreshToken,
    });

    try {
      const response = await this.fetchWithTimeout(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        // Refresh failed, try password grant
        await this.authenticate();
        return;
      }

      const tokenResponse = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      this.tokenState = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? this.tokenState.refreshToken,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      };
    } catch {
      // Refresh failed, try password grant
      await this.authenticate();
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if needed.
   */
  private async ensureAuthenticated(): Promise<string> {
    if (!this.tokenState) {
      throw new AuthenticationError('Not authenticated. Call authenticate() first.');
    }

    // Check if token is expiring soon
    const expiresIn = this.tokenState.expiresAt.getTime() - Date.now();
    if (expiresIn < TOKEN_REFRESH_BUFFER_MS) {
      await this.refreshToken();
    }

    return this.tokenState!.accessToken;
  }

  /**
   * Clear authentication state.
   */
  clearAuth(): void {
    this.tokenState = null;
  }

  /**
   * Make a GET request to the OpenEMR standard API.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * Make a GET request to the OpenEMR FHIR API.
   */
  async getFhir<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined, true);
  }

  /**
   * Make a POST request to the OpenEMR standard API.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Make a DELETE request to the OpenEMR standard API.
   */
  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path);
  }

  /**
   * Validate connection by making a test API call.
   * @throws AuthenticationError if not authenticated or token invalid
   */
  async validateConnection(): Promise<boolean> {
    try {
      // Try to fetch the patient list endpoint with limit=1
      await this.get<unknown>('/patient?_count=1');
      return true;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return false;
      }
      throw error;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, useFhir = false): Promise<T> {
    const apiPath = useFhir ? '/apis/default/fhir' : '/apis/default/api';
    const url = `${this.baseUrl}${apiPath}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      try {
        const accessToken = await this.ensureAuthenticated();

        const response = await this.fetchWithTimeout(url, {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (response.status === 401) {
          // Token may have been invalidated, try refreshing
          if (attempt < this.maxRetries) {
            await this.refreshToken();
            continue;
          }
          throw new AuthenticationError('OpenEMR authentication failed after token refresh');
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
          throw new MRSUnavailableError(`OpenEMR server error: ${errorText}`, response.status);
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new MRSError(`OpenEMR request failed: ${errorText}`, response.status);
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
