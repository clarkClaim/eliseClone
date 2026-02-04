// Conflict Resolution Tests
import { describe, it, expect } from 'vitest';
import {
  getResolutionRule,
  getResolutionAction,
  needsManualReview,
  RESOLUTION_RULES,
} from '../src/sync/conflict-resolution.js';

describe('Resolution Rules', () => {
  it('should have rules for all common conflict scenarios', () => {
    expect(RESOLUTION_RULES.length).toBeGreaterThan(0);

    const patientRule = RESOLUTION_RULES.find(
      r => r.entityType === 'patients' && r.conflictType === 'data_diverged'
    );
    expect(patientRule).toBeDefined();
    expect(patientRule?.action).toBe('mrs_wins');
  });

  it('should flag appointment deletions for review', () => {
    const rule = getResolutionRule('deleted_in_mrs', 'appointments');
    expect(rule).toBeDefined();
    expect(rule?.action).toBe('flag_for_review');
  });

  it('should let MRS win for patient data conflicts', () => {
    const action = getResolutionAction('data_diverged', 'patients');
    expect(action).toBe('mrs_wins');
  });

  it('should let MRS win for external bookings', () => {
    const action = getResolutionAction('external_booking', 'availability');
    expect(action).toBe('mrs_wins');
  });
});

describe('getResolutionRule', () => {
  it('should return undefined for unknown conflict types', () => {
    const rule = getResolutionRule('unknown_type' as 'data_diverged', 'patients');
    expect(rule).toBeUndefined();
  });

  it('should return the correct rule for known conflicts', () => {
    const rule = getResolutionRule('local_only', 'appointments');
    expect(rule).toBeDefined();
    expect(rule?.action).toBe('flag_for_review');
  });
});

describe('getResolutionAction', () => {
  it('should default to flag_for_review for unknown conflicts', () => {
    const action = getResolutionAction('unknown_type' as 'data_diverged', 'patients');
    expect(action).toBe('flag_for_review');
  });
});

describe('needsManualReview', () => {
  it('should return true for appointment conflicts', () => {
    expect(needsManualReview('local_only', 'appointments')).toBe(true);
    expect(needsManualReview('deleted_in_mrs', 'appointments')).toBe(true);
  });

  it('should return false when MRS wins', () => {
    expect(needsManualReview('data_diverged', 'patients')).toBe(false);
    expect(needsManualReview('external_booking', 'availability')).toBe(false);
  });
});
