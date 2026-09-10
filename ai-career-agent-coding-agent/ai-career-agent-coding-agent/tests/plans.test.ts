import { describe, it, expect } from 'vitest';
import { PLANS } from '../packages/shared/plans';

describe('plans', () => {
  it('has agreed pricing and quotas (4 tiers, quota model v2)', () => {
    // FREE — free forever: 3 documents TOTAL, 10 tool uses/day, manual only
    expect(PLANS.FREE.priceKobo).toBe(0);
    expect(PLANS.FREE.dailyCredits).toBe(0);
    expect(PLANS.FREE.lifetimeDocs).toBe(3);
    expect(PLANS.FREE.dailyApplications).toBe(0);
    expect(PLANS.FREE.lifetimeApplications).toBeNull();
    expect(PLANS.FREE.dailyTools).toBe(10);

    // BASIC — ₦5,000: 3 docs/day, 2 lifetime auto-apply trial uses, 50 tools/day
    expect(PLANS.BASIC.monthlyNgn).toBe(5000);
    expect(PLANS.BASIC.priceKobo).toBe(500000);
    expect(PLANS.BASIC.dailyCredits).toBe(3);
    expect(PLANS.BASIC.lifetimeDocs).toBeNull();
    expect(PLANS.BASIC.dailyApplications).toBe(0);
    expect(PLANS.BASIC.lifetimeApplications).toBe(2);
    expect(PLANS.BASIC.dailyTools).toBe(50);

    // PREMIUM — ₦10,000: agent mode (10/day) + 10 docs/day, unlimited tools
    expect(PLANS.PREMIUM.monthlyNgn).toBe(10000);
    expect(PLANS.PREMIUM.priceKobo).toBe(1000000);
    expect(PLANS.PREMIUM.dailyCredits).toBe(10);
    expect(PLANS.PREMIUM.dailyApplications).toBe(10);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);

    // MAX — ₦20,000: agent mode (20/day) + 20 docs/day, unlimited tools
    expect(PLANS.MAX.monthlyNgn).toBe(20000);
    expect(PLANS.MAX.priceKobo).toBe(2000000);
    expect(PLANS.MAX.dailyCredits).toBe(20);
    expect(PLANS.MAX.dailyApplications).toBe(20);
    expect(PLANS.MAX.dailyTools).toBe(Infinity);
  });

  it('keeps volume strictly increasing with tier', () => {
    expect(PLANS.BASIC.dailyCredits).toBeGreaterThan(PLANS.FREE.dailyCredits);
    expect(PLANS.PREMIUM.dailyCredits).toBeGreaterThan(PLANS.BASIC.dailyCredits);
    expect(PLANS.MAX.dailyCredits).toBeGreaterThan(PLANS.PREMIUM.dailyCredits);
    expect(PLANS.MAX.dailyApplications).toBeGreaterThan(PLANS.PREMIUM.dailyApplications);
    // Agent mode is Premium/Max daily; Basic trials it twice, lifetime.
    expect(PLANS.FREE.dailyApplications).toBe(0);
    expect(PLANS.BASIC.dailyApplications).toBe(0);
    expect(PLANS.BASIC.lifetimeApplications).toBe(2);
    expect(PLANS.PREMIUM.dailyApplications).toBeGreaterThan(0);
  });

  it('keeps tools free-to-grow on every tier', () => {
    expect(PLANS.FREE.dailyTools).toBe(10);
    expect(PLANS.BASIC.dailyTools).toBe(50);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);
    expect(PLANS.MAX.dailyTools).toBe(Infinity);
  });
});
