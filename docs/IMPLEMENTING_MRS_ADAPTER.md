# Implementing an MRS Adapter

This guide explains how to implement a new MRS (Medical Record System) adapter for Elise Clone.

## Overview

MRS adapters provide a consistent interface for interacting with different medical record systems. Each adapter translates between the canonical Elise types and the specific API of the target MRS.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Elise Clone                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │   Sync      │   │   Booking   │   │   Agent     │        │
│  │   Service   │   │   Service   │   │   Tools     │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│                    ┌──────┴──────┐                          │
│                    │ MRSAdapter  │  ← Interface             │
│                    └──────┬──────┘                          │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐               │
│         │                 │                 │               │
│  ┌──────┴──────┐   ┌──────┴──────┐   ┌──────┴──────┐        │
│  │ OpenMRS     │   │ OpenEMR    │   │ Your New   │        │
│  │ Adapter     │   │ Adapter    │   │ Adapter    │        │
│  └─────────────┘   └─────────────┘   └─────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Define Capabilities

First, determine what your MRS supports. Create a capabilities file:

```typescript
// src/mrs/adapters/yourmrs/capabilities.ts

import type { MRSCapabilities } from '../../types.js';

export const YOUR_MRS_CAPABILITIES: MRSCapabilities = {
  patientSearch: {
    byPhone: true,        // Can search by phone number?
    byName: true,         // Can search by name?
    byDOB: false,         // Can search by date of birth?
    byIdentifier: true,   // Can search by MRN/identifier?
    globalSearch: true,   // Can search all patients?
  },

  appointments: {
    canCreate: true,              // Can create appointments via API?
    canCancel: true,              // Can cancel appointments?
    canReschedule: false,         // Can reschedule without cancel+create?
    canQueryByDateRange: true,    // Can filter by date range?
    canQueryByPatient: true,      // Can filter by patient?
    supportsStatuses: ['SCHEDULED', 'CANCELLED', 'COMPLETED'],
  },

  scheduling: {
    model: 'appointment_based',   // or 'slot_based'
    supportsScheduleConfig: true, // Can fetch schedule configuration?
    defaultSlotDuration: 30,      // Default appointment duration
    requiresServiceId: true,      // Is serviceId required for booking?
  },

  sync: {
    supportsIncrementalSync: false,  // Has modified-since queries?
    supportsWebhooks: false,         // Has webhook support?
    hasModifiedSinceQuery: false,    // Can query by modification date?
    supportsIdempotencyKeys: false,  // Has native idempotency support?
  },

  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstLimit: 10,
    perEndpointLimits: {},
  },
};
```

## Step 2: Create the Client

Create an HTTP client wrapper for your MRS API:

```typescript
// src/mrs/adapters/yourmrs/client.ts

export interface YourMRSClientConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

export class YourMRSClient {
  private readonly baseUrl: string;
  private authToken?: string;

  constructor(config: YourMRSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    // Initialize auth based on your MRS requirements
  }

  async authenticate(): Promise<void> {
    // Implement authentication
  }

  async get<T>(path: string): Promise<T | null> {
    // Implement GET request with auth headers
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    // Implement POST request
  }

  async validateConnection(): Promise<boolean> {
    // Verify connection is working
  }
}
```

## Step 3: Create Mappers

Map between your MRS data format and canonical Elise types:

```typescript
// src/mrs/adapters/yourmrs/mappers.ts

import type { MRSPatient, MRSAppointment } from '../../types.js';

// Define your MRS response types
export interface YourMRSPatientResponse {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  // ... other fields
}

// Map to canonical type
export function mapPatient(response: YourMRSPatientResponse): MRSPatient {
  return {
    mrsId: response.id,
    name: `${response.firstName} ${response.lastName}`,
    givenName: response.firstName,
    familyName: response.lastName,
    phoneNumbers: response.phone
      ? [{ phone: response.phone, isPrimary: true }]
      : [],
  };
}

// Map appointment status to canonical status
export const STATUS_MAP: Record<string, string> = {
  'SCHEDULED': 'scheduled',
  'CHECKED_IN': 'arrived',
  'COMPLETED': 'completed',
  'CANCELLED': 'cancelled',
  'NO_SHOW': 'no_show',
};
```

## Step 4: Implement the Adapter

Implement the `MRSAdapter` interface:

```typescript
// src/mrs/adapters/yourmrs/adapter.ts

import type { MRSAdapter } from '../../adapter.js';
import type {
  MRSCapabilities,
  MRSSystemType,
  MRSPatient,
  MRSAppointment,
  CreateAppointmentRequest,
  ConflictCheckRequest,
  ConflictCheckResult,
  // ... other types
} from '../../types.js';
import { YOUR_MRS_CAPABILITIES } from './capabilities.js';
import { YourMRSClient } from './client.js';
import { mapPatient, mapAppointment } from './mappers.js';

export class YourMRSAdapter implements MRSAdapter {
  readonly systemType: MRSSystemType = 'yourmrs';
  readonly capabilities: MRSCapabilities = YOUR_MRS_CAPABILITIES;

  private readonly client: YourMRSClient;

  constructor(config: YourMRSAdapterConfig) {
    this.client = new YourMRSClient(config);
  }

  // Factory method for environment-based configuration
  static fromEnv(): YourMRSAdapter {
    const url = process.env.YOUR_MRS_URL;
    // ... validate required env vars
    return new YourMRSAdapter({ url, /* ... */ });
  }

  // Connection Management
  async connect(): Promise<void> {
    await this.client.authenticate();
    const valid = await this.client.validateConnection();
    if (!valid) throw new Error('Connection validation failed');
  }

  async disconnect(): Promise<void> {
    // Clean up resources
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    const healthy = await this.client.validateConnection();
    return { healthy, latencyMs: Date.now() - start };
  }

  // Patient Operations
  async getPatient(mrsId: string): Promise<MRSPatient | null> {
    const response = await this.client.get(`/patients/${mrsId}`);
    return response ? mapPatient(response) : null;
  }

  // ... implement all other interface methods

  // Conflict Detection (important for booking)
  async checkConflicts(request: ConflictCheckRequest): Promise<ConflictCheckResult> {
    // Query existing appointments in the time range
    const appointments = await this.getAppointments({
      startDate: request.startDateTime,
      endDate: request.endDateTime,
      providerMrsId: request.providerId,
    });

    // Filter to active appointments that overlap
    const conflicting = appointments.filter(apt => {
      if (apt.status === 'cancelled') return false;
      return this.timesOverlap(request, apt);
    });

    return {
      hasConflict: conflicting.length > 0,
      conflictingAppointments: conflicting,
    };
  }

  // Create appointment with duplicate detection
  async createAppointment(request: CreateAppointmentRequest): Promise<MRSAppointment> {
    // If idempotency key provided and MRS doesn't support native idempotency,
    // implement duplicate detection by checking for existing appointments
    if (request.idempotencyKey && !this.capabilities.sync.supportsIdempotencyKeys) {
      const existing = await this.findDuplicateAppointment(request);
      if (existing) {
        console.log(`Duplicate detected, returning existing: ${existing.mrsId}`);
        return existing;
      }
    }

    // Create the appointment
    const response = await this.client.post('/appointments', {
      // Map to your MRS format
    });

    return mapAppointment(response);
  }
}
```

## Step 5: Export and Register

Add exports and register your adapter:

```typescript
// src/mrs/adapters/yourmrs/index.ts
export { YourMRSAdapter, type YourMRSAdapterConfig } from './adapter.js';
export { YOUR_MRS_CAPABILITIES } from './capabilities.js';

// src/mrs/adapters/index.ts
export * from './yourmrs/index.js';
```

## Step 6: Add Tests

Create tests for your adapter:

```typescript
// test/yourmrs-adapter.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { YourMRSAdapter } from '../src/mrs/adapters/yourmrs/index.js';

describe('YourMRSAdapter', () => {
  let adapter: YourMRSAdapter;

  beforeEach(() => {
    adapter = new YourMRSAdapter({
      url: 'http://localhost:8080',
      // ... test config
    });
  });

  it('should connect successfully', async () => {
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it('should search patients by name', async () => {
    const results = await adapter.searchPatients({ name: 'John' });
    expect(Array.isArray(results)).toBe(true);
  });

  // ... more tests
});
```

## Key Implementation Notes

### 1. Idempotency Keys

If your MRS doesn't support native idempotency keys, implement duplicate detection:

```typescript
private async findDuplicateAppointment(
  request: CreateAppointmentRequest
): Promise<MRSAppointment | null> {
  const appointments = await this.getAppointments({
    patientMrsId: request.patientMrsId,
    startDate: request.startDateTime,
    endDate: request.endDateTime,
  });

  return appointments.find(apt =>
    apt.patientMrsId === request.patientMrsId &&
    apt.appointmentTypeMrsId === request.serviceId &&
    apt.startTime.getTime() === request.startDateTime.getTime() &&
    apt.status !== 'cancelled'
  ) ?? null;
}
```

### 2. Status Mapping

Always map between MRS-specific status values and canonical statuses:

```typescript
const CANONICAL_STATUSES = [
  'scheduled',
  'confirmed',
  'arrived',
  'in_service',
  'completed',
  'cancelled',
  'no_show'
];
```

### 3. Error Handling

Use the standard error types:

```typescript
import {
  MRSAuthenticationError,
  MRSUnavailableError,
  MRSValidationError,
  SlotConflictError,
  NotFoundError,
} from '../../errors.js';
```

### 4. Rate Limiting

Respect rate limits in your client:

```typescript
private async throttledRequest<T>(fn: () => Promise<T>): Promise<T> {
  // Implement rate limiting based on capabilities.rateLimits
}
```

## Checklist

Before submitting your adapter:

- [ ] All `MRSAdapter` interface methods implemented
- [ ] Capabilities accurately reflect MRS support
- [ ] Error handling uses standard error types
- [ ] Mappers convert all required fields
- [ ] Idempotency/duplicate detection implemented
- [ ] Tests cover happy path and error cases
- [ ] `fromEnv()` factory method works
- [ ] Documentation updated
