'use client';

import { useEffect } from 'react';

function reportError(error: Error & { digest?: string }) {
  try {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `dashboard:${String(error?.message ?? 'unknown').slice(0, 400)}`,
        digest: error?.digest,
        path: '/dashboard',
      }),
      keepalive: true,
    });
  } catch {}
}

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  const isSession = /SESSION_|UNAUTHENTICATED|NO_APP_SESSION/i.test(error.message ?? '');
  const isTransient = /network|timeout|fetch|load failed/i.test(error.message ?? '');
  const showDetails = process.env.NODE_ENV !== 'production' || true; // temporary diagnostic: always show

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <p style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', margin: 0 }}>Dashboard</p>
        <h1 style={{ fontSize: 28, color: '#0f172a', margin: '12px 0 8px' }}>{isSession ? 'Please sign in again' : 'We could not load your dashboard'}</h1>
        <p style={{ color: '#6b7280', lineHeight: 1.6, margin: '0 0 24px' }}>
          {isSession
            ? 'Your session expired or is no longer valid. Sign in again to continue. Nothing you created was lost.'
            : isTransient
              ? 'A temporary connection problem prevented your dashboard from loading. Try again.'
              : 'Something went wrong loading your dashboard. Your data is safe. Try again.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSession ? (
            <a href="/login?next=%2Fdashboard" style={{ display: 'inline-block', background: '#d7f94b', color: '#111d35', padding: '10px 18px', borderRadius: 999, textDecoration: 'none', fontWeight: 600 }}>Sign in</a>
          ) : (
            <button onClick={() => reset()} style={{ background: '#d7f94b', color: '#111d35', padding: '10px 18px', borderRadius: 999, border: 0, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          )}
          <a href="/" style={{ display: 'inline-block', border: '1px solid #e5e7eb', padding: '10px 18px', borderRadius: 999, textDecoration: 'none', color: '#374151' }}>Back home</a>
          <a href="/support" style={{ display: 'inline-block', color: '#6b7280', padding: '10px 18px', textDecoration: 'underline' }}>Contact support</a>
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16 }}>If this keeps happening, contact support with the time and what you clicked.</p>
        {showDetails && (
          <details style={{ marginTop: 16, textAlign: 'left', background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 12, color: '#374151', wordBreak: 'break-word' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Technical details (for support)</summary>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{String(error.message).slice(0, 800) || 'No message'}{error.digest ? `\nDigest: ${error.digest}` : ''}</div>
          </details>
        )}
      </div>
    </div>
  );
}
