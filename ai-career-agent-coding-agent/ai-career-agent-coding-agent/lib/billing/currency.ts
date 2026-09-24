/**
 * Currency display for Jobiest pricing.
 *
 * Two billing currencies (2026-09-24, Paystack international payments
 * enabled): Nigerian visitors are shown and charged Naira; visitors from
 * anywhere else are shown and charged US dollars. Prices are defined once
 * per currency (lib/billing/pricing.ts, subscription_plans) and resolved
 * from the visitor's country (Vercel geo header on the server, /api/geo in
 * the browser). The charge currency is decided server-side in
 * /api/billing/paystack/create from the same header, so what a visitor sees
 * is what they pay.
 *
 * History: an earlier version converted prices into ~12 visitor currencies
 * with live FX and "estimate" labels; that was removed (product-evolution
 * spec, finding V11/V12) because approximate prices next to a single
 * billable currency added confusion. This is different: USD is now actually
 * charged, not estimated.
 */

export const BILLING_CURRENCY = 'NGN' as const;

export const SUPPORTED_CURRENCIES = ['NGN', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Nigeria sees Naira; everyone else sees (and pays) USD. */
export function resolveCurrency(ipCountry?: string | null): SupportedCurrency {
  return (ipCountry ?? '').trim().toUpperCase() === 'NG' ? 'NGN' : 'USD';
}

/** Extract the visitor country from a Vercel geo request header value. */
export function countryFromHeader(value?: string | null): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v.toUpperCase() : null;
}

/** Format a Naira amount like ₦5,000 (no decimals; Naira has no minor unit in practice). */
export function formatNaira(ngnAmount: number): string {
  return `₦${Math.round(ngnAmount).toLocaleString('en-NG')}`;
}

/** Format a USD amount like $7.99 (always two decimals). */
export function formatUsd(usdAmount: number): string {
  return `$${usdAmount.toFixed(2)}`;
}

/** Format a plan price in the resolved billing currency. */
export function formatPlanPrice(currency: SupportedCurrency, ngnAmount: number, usdAmount: number): string {
  return currency === 'USD' ? formatUsd(usdAmount) : formatNaira(ngnAmount);
}

/** Format a money amount in an arbitrary currency; NGN/USD use the house style. */
export function formatMoney(amount: number, currency: string): string {
  if (currency === 'NGN') return formatNaira(amount);
  if (currency === 'USD') return formatUsd(amount);
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
