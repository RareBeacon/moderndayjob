import { describe, it, expect } from 'vitest';
import { PLANS } from '../packages/shared/plans';

describe('plans', () => {
  it('has agreed pricing and quotas (4 tiers)', () => {
    // FREE — free forever, 3 documents + 10 tool uses a day, manual apply only
    expect(PLANS.FREE.priceKobo).toBe(0);
    expect(PLANS.FREE.dailyCredits).toBe(3);
    expect(PLANS.FREE.dailyApplications).toBe(0);
    expect(PLANS.FREE.dailyTools).toBe(10);

    // BASIC — ₦5,000
    expect(PLANS.BASIC.monthlyNgn).toBe(5000);
    expect(PLANS.BASIC.priceKobo).toBe(500000);
    expect(PLANS.BASIC.dailyCredits).toBe(10);
    expect(PLANS.BASIC.dailyApplications).toBe(10);
    expect(PLANS.BASIC.dailyTools).toBe(50);

    // PREMIUM — ₦10,000
    expect(PLANS.PREMIUM.monthlyNgn).toBe(10000);
    expect(PLANS.PREMIUM.priceKobo).toBe(1000000);
    expect(PLANS.PREMIUM.dailyCredits).toBe(20);
    expect(PLANS.PREMIUM.dailyApplications).toBe(20);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);

    // MAX — ₦20,000
    expect(PLANS.MAX.monthlyNgn).toBe(20000);
    expect(PLANS.MAX.priceKobo).toBe(2000000);
    expect(PLANS.MAX.dailyCredits).toBe(40);
    expect(PLANS.MAX.dailyApplications).toBe(40);
    expect(PLANS.MAX.dailyTools).toBe(Infinity);
  });

  it('keeps each paid tier a clean doubling from a profitable base', () => {
    expect(PLANS.BASIC.dailyCredits).toBeGreaterThan(PLANS.FREE.dailyCredits); // 3 → 10 jump unlocks automation
    expect(PLANS.PREMIUM.dailyCredits).toBe(PLANS.BASIC.dailyCredits * 2);
    expect(PLANS.MAX.dailyCredits).toBe(PLANS.PREMIUM.dailyCredits * 2);
    expect(PLANS.PREMIUM.dailyApplications).toBe(PLANS.BASIC.dailyApplications * 2);
    expect(PLANS.MAX.dailyApplications).toBe(PLANS.PREMIUM.dailyApplications * 2);
    // Only FREE lacks automation; every paid tier includes it.
    expect(PLANS.FREE.dailyApplications).toBe(0);
    expect(PLANS.BASIC.dailyApplications).toBeGreaterThan(0);
  });

  it('keeps tools free-to-grow on every tier', () => {
    expect(PLANS.FREE.dailyTools).toBe(10);
    expect(PLANS.BASIC.dailyTools).toBe(50);
    expect(PLANS.PREMIUM.dailyTools).toBe(Infinity);
    expect(PLANS.MAX.dailyTools).toBe(Infinity);
  });
});
