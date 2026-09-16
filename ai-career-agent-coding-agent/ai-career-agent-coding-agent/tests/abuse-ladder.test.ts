import { describe, expect, it } from 'vitest';

/**
 * Abuse ladder (Phase 2, B-073): multi-signal signup risk and generation
 * budgets. Pure functions only - no DB, no Redis.
 */
import {
  budgetDecision,
  isDisposableEmail,
  looksMachineGenerated,
  signupRisk,
} from '@/lib/security/abuse';

describe('isDisposableEmail', () => {
  it('flags known disposable domains', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('b@YOPMAIL.com')).toBe(true);
  });
  it('passes normal domains', () => {
    expect(isDisposableEmail('user@gmail.com')).toBe(false);
    expect(isDisposableEmail('recruiter@grnhse.co')).toBe(false);
  });
});

describe('looksMachineGenerated', () => {
  it('flags digit soup and consonant soup local parts', () => {
    expect(looksMachineGenerated('xk293847561023@example.com')).toBe(true);
    expect(looksMachineGenerated('qzxwvutsrqp@example.com')).toBe(true);
  });
  it('passes human-looking local parts', () => {
    expect(looksMachineGenerated('ada.obasanjo@gmail.com')).toBe(false);
    expect(looksMachineGenerated('chinedu.okeke1985@yahoo.com')).toBe(false);
    expect(looksMachineGenerated('j.o@example.com')).toBe(false);
  });
  it('treats long digit-suffix local parts as machine-like (signal only, never a block)', () => {
    expect(looksMachineGenerated('live.check.1789545718@gmail.com')).toBe(true);
  });
});

describe('signupRisk', () => {
  it('is low for a clean signup', () => {
    const r = signupRisk('ada.obasanjo@gmail.com', 1);
    expect(r.level).toBe('low');
    expect(r.signals).toEqual([]);
  });
  it('escalates on disposable + velocity', () => {
    const r = signupRisk('farm928174630192@mailinator.com', 6);
    expect(r.level).toBe('high');
    expect(r.signals).toContain('disposable_domain');
    expect(r.signals).toContain('signup_velocity_6_24h');
  });
  it('elevated on a single medium signal', () => {
    expect(signupRisk('xk293847561023@example.com', 0).level).toBe('elevated');
  });
});

describe('budgetDecision', () => {
  it('allows under both budgets', () => {
    expect(budgetDecision({ ipToday: 10, anonymousGlobalToday: 100 }, 60, 2000)).toEqual({ blocked: false });
  });
  it('blocks at the per-IP daily budget with a retry hint', () => {
    const d = budgetDecision({ ipToday: 60, anonymousGlobalToday: 100 }, 60, 2000);
    expect(d.blocked).toBe(true);
    if (d.blocked) {
      expect(d.reason).toBe('IP_DAILY_BUDGET');
      expect(d.retryAfterHours).toBeGreaterThanOrEqual(1);
      expect(d.retryAfterHours).toBeLessThanOrEqual(24);
    }
  });
  it('blocks at the global anonymous budget', () => {
    const d = budgetDecision({ ipToday: 1, anonymousGlobalToday: 2000 }, 60, 2000);
    expect(d.blocked).toBe(true);
    if (d.blocked) expect(d.reason).toBe('GLOBAL_DAILY_BUDGET');
  });
  it('a zero budget disables that rung (reversibility)', () => {
    expect(budgetDecision({ ipToday: 9999, anonymousGlobalToday: 5 }, 0, 2000)).toEqual({ blocked: false });
    expect(budgetDecision({ ipToday: 3, anonymousGlobalToday: 9999 }, 60, 0)).toEqual({ blocked: false });
  });
});
