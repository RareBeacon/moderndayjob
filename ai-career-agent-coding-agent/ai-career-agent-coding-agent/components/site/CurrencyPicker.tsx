'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const LABELS: Record<string, string> = {
  NGN: '₦ Naira (NGN)',
  USD: '$ US Dollar (USD)',
  GBP: '£ British Pound (GBP)',
  EUR: '€ Euro (EUR)',
  CAD: 'C$ Canadian Dollar (CAD)',
  AUD: 'A$ Australian Dollar (AUD)',
  GHS: 'GH₵ Ghana Cedi (GHS)',
  KES: 'KSh Kenyan Shilling (KES)',
  ZAR: 'R South African Rand (ZAR)',
  AED: 'د.إ UAE Dirham (AED)',
  INR: '₹ Indian Rupee (INR)',
  CNY: '¥ Chinese Yuan (CNY)',
};

export function CurrencyPicker({ current, currencies }: { current: string; currencies: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(value: string) {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (value === 'NGN') next.delete('currency');
    else next.set('currency', value);
    const qs = next.toString();
    router.push(qs ? `/pricing?${qs}` : '/pricing', { scroll: false });
  }

  return (
    <div className="jl-currency">
      <label htmlFor="currency-picker">Show prices in</label>
      <select id="currency-picker" value={current} onChange={(e) => onChange(e.target.value)}>
        {currencies.map((c) => (
          <option key={c} value={c}>
            {LABELS[c] ?? c}
          </option>
        ))}
      </select>
    </div>
  );
}
