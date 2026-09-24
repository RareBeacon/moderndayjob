import { describe, it, expect } from 'vitest';
import {
  resolveCurrency,
  countryFromHeader,
  formatNaira,
  formatUsd,
  formatPlanPrice,
  formatMoney,
  SUPPORTED_CURRENCIES,
  BILLING_CURRENCY,
} from '@/lib/billing/currency';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import { planForAmountIn, PLAN_AMOUNTS_USD } from '@packages/billing/flutterwave';

describe('two-currency pricing display (Nigeria Naira, everywhere else USD)', () => {
  it('bills in Naira at home and supports USD abroad', () => {
    expect(BILLING_CURRENCY).toBe('NGN');
    expect(SUPPORTED_CURRENCIES).toEqual(['NGN', 'USD']);
  });

  it('resolveCurrency: Nigeria gets NGN, everyone else (and unknowns) get USD', () => {
    expect(resolveCurrency('NG')).toBe('NGN');
    expect(resolveCurrency('ng')).toBe('NGN');
    expect(resolveCurrency(' NG ')).toBe('NGN');
    expect(resolveCurrency('US')).toBe('USD');
    expect(resolveCurrency('GB')).toBe('USD');
    expect(resolveCurrency(null)).toBe('USD');
    expect(resolveCurrency(undefined)).toBe('USD');
    expect(resolveCurrency('')).toBe('USD');
  });

  it('countryFromHeader trims and uppercases the Vercel geo header', () => {
    expect(countryFromHeader('ng')).toBe('NG');
    expect(countryFromHeader(' US ')).toBe('US');
    expect(countryFromHeader('')).toBeNull();
    expect(countryFromHeader(null)).toBeNull();
  });

  it('formats whole Naira with the ₦ symbol and USD with two decimals', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(5000)).toBe('₦5,000');
    expect(formatNaira(10000)).toBe('₦10,000');
    expect(formatNaira(20000)).toBe('₦20,000');
    expect(formatUsd(3.99)).toBe('$3.99');
    expect(formatUsd(7.99)).toBe('$7.99');
    expect(formatUsd(14.99)).toBe('$14.99');
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('formatPlanPrice picks the right catalog number per currency', () => {
    expect(formatPlanPrice('NGN', PLANS.BASIC.monthlyNgn, PLANS.BASIC.monthlyUsd)).toBe('₦5,000');
    expect(formatPlanPrice('USD', PLANS.BASIC.monthlyNgn, PLANS.BASIC.monthlyUsd)).toBe('$3.99');
    expect(formatPlanPrice('USD', PLANS.PREMIUM.monthlyNgn, PLANS.PREMIUM.monthlyUsd)).toBe('$7.99');
    expect(formatPlanPrice('USD', PLANS.MAX.monthlyNgn, PLANS.MAX.monthlyUsd)).toBe('$14.99');
  });

  it('formatMoney keeps NGN decimal-free and USD at two decimals', () => {
    expect(formatMoney(5000, 'NGN')).toBe('₦5,000');
    expect(formatMoney(7.99, 'USD')).toBe('$7.99');
  });

  it('every plan has both a Naira and a USD price, consistent per plan', () => {
    for (const code of PLAN_ORDER) {
      const plan = PLANS[code];
      expect(formatNaira(plan.monthlyNgn)).toMatch(/^₦[\d,]+$/);
      expect(formatUsd(plan.monthlyUsd)).toMatch(/^\$\d+\.\d{2}$/);
    }
    expect(formatNaira(PLANS.BASIC.monthlyNgn)).toBe('₦5,000');
    expect(formatNaira(PLANS.PREMIUM.monthlyNgn)).toBe('₦10,000');
    expect(formatNaira(PLANS.MAX.monthlyNgn)).toBe('₦20,000');
    // Paid plans have positive USD prices; FREE is zero in both.
    expect(PLANS.FREE.monthlyUsd).toBe(0);
    for (const code of ['BASIC', 'PREMIUM', 'MAX'] as const) {
      expect(PLANS[code].monthlyUsd).toBeGreaterThan(0);
    }
  });

  it('planForAmountIn maps USD charges to the right plan and rejects junk', () => {
    expect(planForAmountIn('USD', 14.99)).toBe('MAX');
    expect(planForAmountIn('USD', 7.99)).toBe('PREMIUM');
    expect(planForAmountIn('USD', 3.99)).toBe('BASIC');
    expect(planForAmountIn('USD', 3.98)).toBeNull();
    expect(planForAmountIn('USD', 0)).toBeNull();
    // The catalog, the DB list prices and the guard agree.
    expect(PLAN_AMOUNTS_USD.MAX).toBe(14.99);
    expect(PLAN_AMOUNTS_USD.PREMIUM).toBe(7.99);
    expect(PLAN_AMOUNTS_USD.BASIC).toBe(3.99);
  });

  it('planForAmountIn keeps the Naira behavior and rejects unknown currencies', () => {
    expect(planForAmountIn('NGN', 20000)).toBe('MAX');
    expect(planForAmountIn('NGN', 5000)).toBe('BASIC');
    expect(planForAmountIn('NGN', 4999)).toBeNull();
    expect(planForAmountIn('GHS', 5000)).toBeNull();
    expect(planForAmountIn('EUR', 14.99)).toBeNull();
  });
});
