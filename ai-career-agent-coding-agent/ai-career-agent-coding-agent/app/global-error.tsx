'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: `global:${String(error?.message ?? 'unknown').slice(0, 400)}`,
          digest: error?.digest,
          path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
        keepalive: true,
      });
    } catch {
      /* monitoring must never break recovery */
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', margin: 0 }}>Something went wrong</p>
          <h1 style={{ fontSize: 32, color: '#0f172a', margin: '12px 0' }}>We hit a snag.</h1>
          <p style={{ color: '#6b7280', margin: '0 0 24px' }}>Nothing you entered was lost. Try again, and if it keeps happening, come back in a minute.</p>
          {error?.digest ? (
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 20px' }}>
              Reference: {String(error.digest).slice(0, 32)}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => reset()} style={{ background: '#d7f94b', color: '#111d35', padding: '10px 18px', borderRadius: 999, border: 0, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
            <a href="/" style={{ display: 'inline-block', border: '1px solid #e5e7eb', padding: '10px 18px', borderRadius: 999, textDecoration: 'none', color: '#374151' }}>Back home</a>
          </div>
        </div>
      </body>
    </html>
  );
}
