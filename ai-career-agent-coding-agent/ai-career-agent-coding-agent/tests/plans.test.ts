import { describe, it, expect } from 'vitest';
import { PLANS, normalizePlanCode } from '../packages/shared/plans';

describe('plans', () => {
  it('has agreed pricing and quotas (4 tiers: FREE, BASIC, PREMIUM, ULTRA)', () => {
    // FREE: free forever, 3 lifetime docs (5 monthly ledger credits), 10 tool uses/day, manual apply
    expect(PLANS.FREE.priceKobo).toBe(0);
    expect(PLANS.FREE.dailyCredits).toBe(0);
    expect(PLANS.FREE.lifetimeDocs).toBe(3);
    expect(PLANS.FREE.monthlySuccessfulApplications).toBe(0);
    expect(PLANS.FREE.unlimitedApplications).toBe(false);
    expect(PLANS.FREE.dailyTools).toBe(10);

    // BASIC: ₦5,000 / $3.99, 30 successful applications/month, 50 tools/day
    expect(PLANS.BASIC.monthlyNgn).toBe(5000);
    expect(PLANS.BASIC.monthlyUsd).toBe(3.99);
    expect(PLANS.BASIC.priceKobo).toBe(500000);
    expect(PLANS.BASIC.dailyCredits).toBe(3);
    expect(PLANS.BASIC.lifetimeDocs).toBeNull();
    expect(PLANS.BASIC.monthlySuccessfulApplications).toBe(30);
    expect(PLANS.BASIC.unlimitedApplications).toBe(false);
    expect(PLANS.BASIC.dailyTools).toBe(50);

    // PREMIUM: ₦10,000 / $7.99, 50 successful applications/month, unlimited tools
    expect(PLANS.PREMIUM.monthlyNgn).toBe(10000);
    expect(PLANS.PREMIUM.monthlyUsd).toBe(7.99);
    expect(PLANS.PREMIUM.priceKobo).toBe(1000000);
    expect(PLANS.PREMIUM.dailyCredits).toBe(10);
    expect(PLANS.PREMIUM.monthlySuccessfulApplications).toBe(50);
    expect(PLANS.PREMIUM.unlimitedApplications).toBe(false);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);

    // ULTRA (renamed from MAX): ₦20,000 / $14.99, Unlimited successful applications/month
    expect(PLANS.ULTRA.monthlyNgn).toBe(20000);
    expect(PLANS.ULTRA.monthlyUsd).toBe(14.99);
    expect(PLANS.ULTRA.priceKobo).toBe(2000000);
    expect(PLANS.ULTRA.dailyCredits).toBe(20);
    expect(PLANS.ULTRA.monthlySuccessfulApplications).toBeNull();
    expect(PLANS.ULTRA.unlimitedApplications).toBe(true);
    expect(PLANS.ULTRA.dailyTools).toBe(Infinity);

    expect(normalizePlanCode('MAX')).toBe('ULTRA');
  });

  it('keeps volume strictly increasing with tier', () => {
    expect(PLANS.BASIC.dailyCredits).toBeGreaterThan(PLANS.FREE.dailyCredits);
    expect(PLANS.PREMIUM.dailyCredits).toBeGreaterThan(PLANS.BASIC.dailyCredits);
    expect(PLANS.ULTRA.dailyCredits).toBeGreaterThan(PLANS.PREMIUM.dailyCredits);
    expect(PLANS.PREMIUM.monthlySuccessfulApplications!).toBeGreaterThan(PLANS.BASIC.monthlySuccessfulApplications!);
    expect(PLANS.ULTRA.unlimitedApplications).toBe(true);
  });

  it('keeps tools free-to-grow on every tier', () => {
    expect(PLANS.FREE.dailyTools).toBe(10);
    expect(PLANS.BASIC.dailyTools).toBe(50);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);
    expect(PLANS.ULTRA.dailyTools).toBe(Infinity);
  });
});
