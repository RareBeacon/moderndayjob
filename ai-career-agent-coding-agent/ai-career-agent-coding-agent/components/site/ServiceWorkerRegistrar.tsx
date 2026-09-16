'use client';

import { useEffect } from 'react';

/** Register the PWA service worker (offline fallback + static asset cache).
 *  Ignored where unsupported; never blocks rendering. Client component so the
 *  server-rendered root layout stays free of hooks. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const t = setTimeout(() => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
