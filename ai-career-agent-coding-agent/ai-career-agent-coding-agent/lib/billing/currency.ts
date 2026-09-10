/**
 * Local-currency pricing for the marketing pricing page.
 *
 * Jobiest bills in Naira (₦) via its payment provider, but any visitor —
 * from any country — should see plan prices in their own currency as an
 * approximate guide. This module:
 *   1. detects the visitor's country from Vercel's `x-vercel-ip-country`
 *      header (or an explicit `?currency=` override / Accept-Language hint);
 *   2. maps country → currency;
 *   3. converts NGN → that currency using live rates (open.er-api.com, no
 *      key) with an in-memory cache and a static fallback table;
 *   4. formats with Intl.NumberFormat.
 *
 * Failure is graceful: if anything fails we fall back to showing Naira.
 */

export const SUPPORTED_CURRENCIES = [
  'NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD',
  'GHS', 'KES', 'ZAR', 'AED', 'INR', 'CNY',
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO-3166 alpha-2 country → ISO-4217 currency. Curated to the markets
 *  Jobiest serves plus the most common visitors; unknown countries fall back
 *  to USD (then NGN as the final safety net). */
const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN', US: 'USD', GB: 'GBP', UK: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  IE: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', IE2: 'EUR',
  GH: 'GHS', KE: 'KES', ZA: 'ZAR', AE: 'AED', SA: 'SAR', IN: 'INR', CN: 'CNY',
  JP: 'JPY', KR: 'KRW', SG: 'SGD', HK: 'HKD', BR: 'BRL', MX: 'MXN', AR: 'ARS',
  CL: 'CLP', CO: 'COP', PE: 'PEN', EG: 'EGP', MA: 'MAD', TR: 'TRY', PK: 'PKR',
  BD: 'BDT', LK: 'LKR', NP: 'NPR', ID: 'IDR', MY: 'MYR', PH: 'PHP', TH: 'THB',
  VN: 'VND', RU: 'RUB', UA: 'UAH', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CH: 'CHF', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', IL: 'ILS', QA: 'QAR',
  KW: 'KWD', OM: 'OMR', BH: 'BHD', JO: 'JOD', LB: 'LBP', TZ: 'TZS', UG: 'UGX',
  RW: 'RWF', ET: 'ETB', CM: 'XAF', CI: 'XOF', SN: 'XOF', ZM: 'ZMW', BW: 'BWP',
  MW: 'MWK', MZ: 'MZN', NA: 'NAD', BJ: 'XOF', TG: 'XOF', BF: 'XOF', NE: 'XOF',
  ML: 'XOF', GM: 'GMD', SL: 'SLL', LR: 'LRD', GN: 'GNF', CD: 'CDF', AO: 'AOA',
  ZW: 'ZWL', MG: 'MGA', MU: 'MUR', SC: 'SCR',
};

/** Static fallback rates (1 NGN → currency). Used only when the live rates
 *  endpoint is unreachable; refreshed by the live fetch on every successful
 *  call. Approximate, for display only. */
const FALLBACK_RATES: Record<string, number> = {
  NGN: 1, USD: 0.00075, GBP: 0.00055, EUR: 0.00064, CAD: 0.001, AUD: 0.00103,
  GHS: 0.0085, KES: 0.098, ZAR: 0.0119, AED: 0.00277, INR: 0.0706, CNY: 0.0053,
  NZD: 0.0011, JPY: 0.114, KRW: 1.02, SGD: 0.00099, HKD: 0.00586, BRL: 0.0038,
  MXN: 0.0128, EGP: 0.0232, MAD: 0.0075, TRY: 0.0242, PKR: 0.209, BDT: 0.082,
  IDR: 12.1, MYR: 0.00334, PHP: 0.042, THB: 0.0258, VND: 18.7, RUB: 0.067,
  UAH: 0.027, PLN: 0.0029, SEK: 0.0076, NOK: 0.008, DKK: 0.0052, CHF: 0.00064,
  CZK: 0.0172, HUF: 0.272, RON: 0.0032, ILS: 0.0027, SAR: 0.00283, QAR: 0.00274,
  KWD: 0.000231, AED2: 0.00277, TZS: 1.77, UGX: 2.72, ZAR2: 0.0119, XOF: 0.42,
  XAF: 0.42, ZMW: 0.0195, BWP: 0.0102, MZN: 0.0477, NAD: 0.0119, ETB: 0.086,
  RWF: 1.0, MWK: 1.29, CDF: 2.13, AOA: 0.64, GMD: 0.049, SLL: 16.4, LRD: 0.147,
  GNF: 6.5, MGA: 3.4, MUR: 0.035, SCR: 0.011, BGN: 0.00125, JOD: 0.000532,
  OMR: 0.00029, BHD: 0.000283, LBP: 67.5, UAH2: 0.027,
};

const FX_URL = 'https://open.er-api.com/v6/latest/NGN';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;

export async function getFxRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && now - cachedAt < CACHE_TTL_MS) return cachedRates;
  try {
    const res = await fetch(FX_URL, { next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`FX_HTTP_${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== 'success' || !json.rates) throw new Error('FX_BAD_RESPONSE');
    cachedRates = json.rates;
    cachedAt = now;
    return cachedRates;
  } catch {
    cachedRates = FALLBACK_RATES;
    cachedAt = now;
    return cachedRates;
  }
}

export function currencyForCountry(country: string | null | undefined): string {
  const code = (country ?? '').trim().toUpperCase();
  if (code === 'NG') return 'NGN';
  return COUNTRY_CURRENCY[code] ?? 'USD';
}

export function currencyForLocale(locale: string | null | undefined): string | null {
  // A locale like "en-GB" hints at region but not reliably at currency.
  // We only use it when the IP header is missing entirely.
  const region = (locale ?? '').split('-')[1]?.toUpperCase();
  if (!region) return null;
  return COUNTRY_CURRENCY[region] ?? null;
}

export function resolveCurrency(
  ipCountry: string | null | undefined,
  locale: string | null | undefined,
  override: string | null | undefined,
): string {
  if (override && SUPPORTED_CURRENCIES.includes(override as SupportedCurrency)) {
    return override;
  }
  if (ipCountry) return currencyForCountry(ipCountry);
  return currencyForLocale(locale) ?? 'USD';
}

export function convertNgnTo(ngnAmount: number, currency: string, rates: Record<string, number>): number {
  if (currency === 'NGN') return ngnAmount;
  const rate = rates[currency] ?? rates.USD ?? 0.00075;
  return ngnAmount * rate;
}

export function formatMoney(amount: number, currency: string): string {
  const decimals = currency === 'NGN' || currency === 'JPY' || currency === 'KRW' || currency === 'VND' || currency === 'IDR' ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}

export interface LocalizedPrice {
  currency: string;
  /** Human-readable price, e.g. "$3.77". */
  formatted: string;
  /** Round number for compact display, e.g. "$4". */
  approximate: string;
  isNgn: boolean;
}

export function localizePrice(
  ngnAmount: number,
  currency: string,
  rates: Record<string, number>,
): LocalizedPrice {
  if (currency === 'NGN') {
    const formatted = formatMoney(ngnAmount, 'NGN');
    return { currency, formatted, approximate: formatted, isNgn: true };
  }
  const converted = convertNgnTo(ngnAmount, currency, rates);
  const formatted = formatMoney(converted, currency);
  // Compact "≈" figure without decimals for small currencies, 2dp for majors.
  const approxDecimals = converted >= 100 ? 0 : 2;
  let approxValue = Number(converted.toFixed(approxDecimals));
  // Round to a friendly number (nearest whole or 0.5 for tiny values).
  if (converted < 10 && converted >= 0.5) approxValue = Math.round(converted * 2) / 2;
  const approximate = formatMoney(approxValue, currency);
  return { currency, formatted, approximate, isNgn: false };
}
