'use client';
import { useEffect, useState } from 'react';
import { formatNaira, formatUsd } from '@/lib/billing/currency';

/**
 * GeoPrice: renders the plan price in the visitor's billing currency.
 * Naira is the default (server render, no-JS visitors, crawlers); after
 * mount, /api/geo reports the visitor's country and visitors from outside
 * Nigeria see the USD price they will actually be charged (the checkout
 * decides its currency from the same geo header, server-side).
 */
export function GeoPrice({ ngn, usd }: { ngn: number; usd: number }) {
  const [usdMode, setUsdMode] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/geo')
      .then((r) => r.json())
      .then((j: { country?: string | null }) => {
        if (alive && j?.country && j.country !== 'NG') setUsdMode(true);
      })
      .catch(() => {
        /* stay on Naira: the default is always a real, chargeable price */
      });
    return () => {
      alive = false;
    };
  }, []);
  return <>{usdMode ? formatUsd(usd) : formatNaira(ngn)}</>;
}
