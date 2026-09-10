import { describe, expect, it } from 'vitest';
import { hashSignal, issueDeviceId } from '@/lib/security/device';
import { classifyRegistrationRisk, isRegistrationBlocked } from '@/lib/security/risk';

describe('device identity', () => {
  it('issues unique, non-trivial device ids', () => {
    const a = issueDeviceId();
    const b = issueDeviceId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });

  it('hashes signals deterministically and one-way', () => {
    expect(hashSignal('1.2.3.4')).toBe(hashSignal('1.2.3.4'));
    expect(hashSignal('1.2.3.4')).not.toBe('1.2.3.4');
    expect(hashSignal('1.2.3.4')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('registration risk classification', () => {
  it('classifies low velocity as LOW', () => {
    expect(classifyRegistrationRisk({ signupsFromIp: 1, signupsFromDevice: 1 })).toBe('LOW');
  });

  it('flags elevated velocity but does not block shared-device levels', () => {
    expect(classifyRegistrationRisk({ signupsFromIp: 3, signupsFromDevice: 2 })).toBe('MEDIUM');
    expect(classifyRegistrationRisk({ signupsFromIp: 13, signupsFromDevice: 3 })).toBe('HIGH');
    expect(isRegistrationBlocked('HIGH')).toBe(false);
  });

  it('blocks only at EXTREME velocity', () => {
    expect(classifyRegistrationRisk({ signupsFromIp: 30, signupsFromDevice: 1 })).toBe('EXTREME');
    expect(classifyRegistrationRisk({ signupsFromIp: 1, signupsFromDevice: 15 })).toBe('EXTREME');
    expect(isRegistrationBlocked('EXTREME')).toBe(true);
  });
});
