// Change Detection Tests
import { describe, it, expect } from 'vitest';
import {
  detectChanges,
  patientHasChanged,
  providerHasChanged,
  availabilityHasChanged,
  isExternalBookingConflict,
} from '../src/sync/change-detection.js';

describe('detectChanges', () => {
  it('should detect created records', () => {
    const mrsData = [
      { mrsId: '1', name: 'John' },
      { mrsId: '2', name: 'Jane' },
    ];
    const localData: { id: string; mrsId: string; name: string }[] = [];

    const changes = detectChanges({
      entityType: 'patients',
      mrsData,
      localData,
      getMrsId: (r) => r.mrsId,
      getLocalMrsId: (r) => r.mrsId,
      getLocalId: (r) => r.id,
      hasChanged: (local, mrs) => local.name !== mrs.name,
    });

    expect(changes.created).toHaveLength(2);
    expect(changes.updated).toHaveLength(0);
    expect(changes.deleted).toHaveLength(0);
  });

  it('should detect updated records', () => {
    const mrsData = [{ mrsId: '1', name: 'John Updated' }];
    const localData = [{ id: 'local-1', mrsId: '1', name: 'John' }];

    const changes = detectChanges({
      entityType: 'patients',
      mrsData,
      localData,
      getMrsId: (r) => r.mrsId,
      getLocalMrsId: (r) => r.mrsId,
      getLocalId: (r) => r.id,
      hasChanged: (local, mrs) => local.name !== mrs.name,
    });

    expect(changes.created).toHaveLength(0);
    expect(changes.updated).toHaveLength(1);
    expect(changes.updated[0].local.name).toBe('John');
    expect(changes.updated[0].mrs.name).toBe('John Updated');
    expect(changes.deleted).toHaveLength(0);
  });

  it('should detect deleted records', () => {
    const mrsData: { mrsId: string; name: string }[] = [];
    const localData = [{ id: 'local-1', mrsId: '1', name: 'John' }];

    const changes = detectChanges({
      entityType: 'patients',
      mrsData,
      localData,
      getMrsId: (r) => r.mrsId,
      getLocalMrsId: (r) => r.mrsId,
      getLocalId: (r) => r.id,
      hasChanged: (local, mrs) => local.name !== mrs.name,
    });

    expect(changes.created).toHaveLength(0);
    expect(changes.updated).toHaveLength(0);
    expect(changes.deleted).toHaveLength(1);
  });

  it('should detect conflicts when isConflict function provided', () => {
    const mrsData = [{ mrsId: '1', name: 'John', isBooked: true }];
    const localData = [{ id: 'local-1', mrsId: '1', name: 'John', isBooked: false }];

    const changes = detectChanges({
      entityType: 'availability',
      mrsData,
      localData,
      getMrsId: (r) => r.mrsId,
      getLocalMrsId: (r) => r.mrsId,
      getLocalId: (r) => r.id,
      hasChanged: (local, mrs) => local.isBooked !== mrs.isBooked,
      isConflict: (local, mrs) => mrs.isBooked && !local.isBooked,
    });

    expect(changes.conflicts).toHaveLength(1);
    expect(changes.conflicts[0].conflictType).toBe('data_diverged');
  });
});

describe('patientHasChanged', () => {
  it('should detect name change', () => {
    const local = { name: 'John Doe', givenName: 'John', familyName: 'Doe', dob: null, gender: 'M' };
    const mrs = { name: 'John Smith', givenName: 'John', familyName: 'Smith', dateOfBirth: undefined, gender: 'M' };

    expect(patientHasChanged(local, mrs)).toBe(true);
  });

  it('should return false when no changes', () => {
    const local = { name: 'John Doe', givenName: 'John', familyName: 'Doe', dob: null, gender: 'M' };
    const mrs = { name: 'John Doe', givenName: 'John', familyName: 'Doe', dateOfBirth: undefined, gender: 'M' };

    expect(patientHasChanged(local, mrs)).toBe(false);
  });
});

describe('providerHasChanged', () => {
  it('should detect name change', () => {
    const local = { name: 'Dr. Smith', specialty: 'Cardiology' };
    const mrs = { name: 'Dr. Johnson', specialty: 'Cardiology' };

    expect(providerHasChanged(local, mrs)).toBe(true);
  });

  it('should detect specialty change', () => {
    const local = { name: 'Dr. Smith', specialty: 'Cardiology' };
    const mrs = { name: 'Dr. Smith', specialty: 'Neurology' };

    expect(providerHasChanged(local, mrs)).toBe(true);
  });
});

describe('availabilityHasChanged', () => {
  const baseTime = new Date('2024-01-15T10:00:00Z');
  const endTime = new Date('2024-01-15T10:30:00Z');

  it('should detect time change', () => {
    const local = { startTime: baseTime, endTime: endTime, isBooked: false };
    const mrs = { startTime: new Date('2024-01-15T11:00:00Z'), endTime: endTime, isBooked: false };

    expect(availabilityHasChanged(local, mrs)).toBe(true);
  });

  it('should detect booking change', () => {
    const local = { startTime: baseTime, endTime: endTime, isBooked: false };
    const mrs = { startTime: baseTime, endTime: endTime, isBooked: true };

    expect(availabilityHasChanged(local, mrs)).toBe(true);
  });
});

describe('isExternalBookingConflict', () => {
  it('should detect external booking', () => {
    expect(isExternalBookingConflict({ isBooked: false }, { isBooked: true })).toBe(true);
  });

  it('should not flag when local is already booked', () => {
    expect(isExternalBookingConflict({ isBooked: true }, { isBooked: true })).toBe(false);
  });
});
