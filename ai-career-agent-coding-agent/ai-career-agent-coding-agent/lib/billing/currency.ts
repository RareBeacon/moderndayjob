/**
 * Currency display for Jobiest pricing.
 *
 * Jobiest bills exclusively in Naira (₦) via its payment provider. Prices are
 * defined once, in Naira, in lib/billing/pricing.ts and shown everywhere in
 * Naira. Earlier versions of this module converted prices into ~12 visitor
 * currencies using live FX rates with "estimate" labels; that was removed
 * (product-evolution spec, finding V11/V12) because approximate converted
 * prices added confusion next to the single billable currency, and the
 * checkout flow only ever charges Naira.
 *
 * If multi-currency billing is ever added (e.g. Paystack USD verified
 * enabled), reintroduce conversion here so pricing stays single-sourced.
 */

/** The only currency Jobiest bills and displays prices in. */
export const BILLING_CURRENCY = 'NGN' as const;

/**
 * Kept for compatibility with call sites that used to resolve a visitor
 * currency. It now always resolves to NGN: prices are single-currency.
 */
export const SUPPORTED_CURRENCIES = ['NGN'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Always NGN; the signature is kept so callers do not need branching. */
export function resolveCurrency(
  _ipCountry?: string | null,
  _locale?: string | null,
  _override?: string | null,
): SupportedCurrency {
  return 'NGN';
}

/** Format a Naira amount like ₦5,000 (no decimals; Naira has no minor unit in practice). */
export function formatNaira(ngnAmount: number): string {
  return `₦${Math.round(ngnAmount).toLocaleString('en-NG')}`;
}

/** Format a money amount in an arbitrary currency; only NGN is used today. */
export function formatMoney(amount: number, currency: string): string {
  if (currency === 'NGN') return formatNaira(amount);
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
