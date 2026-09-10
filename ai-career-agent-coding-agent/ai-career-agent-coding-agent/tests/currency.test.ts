import { describe, it, expect } from 'vitest';
import {
  resolveCurrency,
  currencyForCountry,
  convertNgnTo,
  formatMoney,
  localizePrice,
  SUPPORTED_CURRENCIES,
} from '@/lib/billing/currency';
import { PLANS } from '@/lib/billing/pricing';

const rates = {
  NGN: 1,
  USD: 0.00075,
  GBP: 0.00055,
  EUR: 0.00064,
  CAD: 0.001,
  GHS: 0.0085,
  KES: 0.098,
  ZAR: 0.0119,
  AED: 0.00277,
  INR: 0.0706,
  CNY: 0.0053,
  AUD: 0.00103,
};

describe('currency detection', () => {
  it('maps Nigeria to NGN', () => {
    expect(currencyForCountry('NG')).toBe('NGN');
  });
  it('maps major markets to their currency', () => {
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('GH')).toBe('GHS');
    expect(currencyForCountry('KE')).toBe('KES');
    expect(currencyForCountry('ZA')).toBe('ZAR');
    expect(currencyForCountry('AE')).toBe('AED');
    expect(currencyForCountry('IN')).toBe('INR');
  });
  it('falls back to USD for unknown countries', () => {
    expect(currencyForCountry('XX')).toBe('USD');
  });
  it('honours an explicit ?currency= override', () => {
    expect(resolveCurrency('NG', 'en-NG', 'EUR')).toBe('EUR');
  });
  it('prefers the IP country over the locale, ignores invalid override', () => {
    expect(resolveCurrency('GB', 'en-US', undefined)).toBe('GBP');
    expect(resolveCurrency('NG', 'en-US', 'XXX')).toBe('NGN');
  });
});

describe('conversion and formatting', () => {
  it('converts NGN to foreign currency using rates', () => {
    expect(convertNgnTo(5000, 'USD', rates)).toBeCloseTo(3.75, 2);
    expect(convertNgnTo(10000, 'EUR', rates)).toBeCloseTo(6.4, 2);
  });
  it('returns NGN unchanged for NGN', () => {
    expect(convertNgnTo(5000, 'NGN', rates)).toBe(5000);
  });
  it('formats whole Naira without decimals', () => {
    expect(formatMoney(5000, 'NGN')).toMatch(/5,000/);
  });
  it('localizes a plan price', () => {
    const l = localizePrice(PLANS.BASIC.monthlyNgn, 'USD', rates);
    expect(l.isNgn).toBe(false);
    expect(l.currency).toBe('USD');
    expect(l.formatted).toMatch(/\$/);
  });
  it('keeps NGN localization in Naira', () => {
    const l = localizePrice(PLANS.PREMIUM.monthlyNgn, 'NGN', rates);
    expect(l.isNgn).toBe(true);
    expect(l.formatted).toMatch(/10,000/);
  });
  it('exposes a supported-currency list for the picker', () => {
    expect(SUPPORTED_CURRENCIES).toContain('NGN');
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(8);
  });
});
