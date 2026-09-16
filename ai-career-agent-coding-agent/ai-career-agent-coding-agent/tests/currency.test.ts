import { describe, it, expect } from 'vitest';
import {
  resolveCurrency,
  formatNaira,
  formatMoney,
  SUPPORTED_CURRENCIES,
  BILLING_CURRENCY,
} from '@/lib/billing/currency';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';

describe('single-currency pricing display', () => {
  it('bills and displays in Naira only', () => {
    expect(BILLING_CURRENCY).toBe('NGN');
    expect(SUPPORTED_CURRENCIES).toEqual(['NGN']);
  });

  it('resolveCurrency always returns NGN regardless of hints or overrides', () => {
    expect(resolveCurrency('NG', 'en-NG', undefined)).toBe('NGN');
    expect(resolveCurrency('US', 'en-US', undefined)).toBe('NGN');
    expect(resolveCurrency('GB', 'en-GB', 'GBP')).toBe('NGN');
    expect(resolveCurrency(null, null, 'USD')).toBe('NGN');
  });

  it('formats whole Naira with the ₦ symbol and thousands separators', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(5000)).toBe('₦5,000');
    expect(formatNaira(10000)).toBe('₦10,000');
    expect(formatNaira(20000)).toBe('₦20,000');
  });

  it('formatMoney keeps NGN amounts decimal-free', () => {
    expect(formatMoney(5000, 'NGN')).toBe('₦5,000');
  });

  it('every paid plan price formats cleanly in Naira', () => {
    for (const code of PLAN_ORDER) {
      const plan = PLANS[code];
      expect(formatNaira(plan.monthlyNgn)).toMatch(/^₦[\d,]+$/);
    }
    expect(formatNaira(PLANS.BASIC.monthlyNgn)).toBe('₦5,000');
    expect(formatNaira(PLANS.PREMIUM.monthlyNgn)).toBe('₦10,000');
    expect(formatNaira(PLANS.MAX.monthlyNgn)).toBe('₦20,000');
  });
});
