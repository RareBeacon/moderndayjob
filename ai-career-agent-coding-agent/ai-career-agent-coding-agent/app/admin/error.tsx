'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/site/Logo';

/**
 * Admin Route Error Boundary.
 * Catches unhandled runtime exceptions in /admin/* route segments, reports them
 * to /api/client-error, and renders a professional admin recovery interface
 * instead of letting Next.js render a blank canvas or generic 500 page.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: String(error?.message ?? 'Admin render exception').slice(0, 500),
          digest: error?.digest,
          path: typeof window !== 'undefined' ? window.location.pathname : '/admin',
        }),
        keepalive: true,
      });
    } catch {}
  }, [error]);

  return (
    <>
      <header className="ad-header">
        <div className="ad-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link href="/"><Logo variant="light" size={28} /></Link>
            <span className="ad-tag">Admin</span>
          </span>
          <Link href="/dashboard" className="ad-back">← Back to app</Link>
        </div>
      </header>
      <main id="main" className="ad-main">
        <div className="ad-forbidden" style={{ maxWidth: 580 }}>
          <span className="mk-kicker" style={{ color: 'var(--danger, #dc2626)' }}>Admin Operation Exception</span>
          <h1 style={{ fontFamily: 'var(--font-display, var(--font-space-grotesk), sans-serif)', fontSize: 26, margin: '12px 0 8px', color: 'var(--brand-ink)' }}>
            Control Centre Encountered an Error
          </h1>
          <p className="muted" style={{ margin: '8px 0 16px', fontSize: 14 }}>
            The admin console encountered an unexpected issue while loading data. No user data, transactions, or system state were altered.
          </p>
          {error?.digest ? (
            <p className="ad-mono" style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', padding: '6px 10px', border: '1px solid var(--line)', marginBottom: 20 }}>
              Error Reference: {String(error.digest).slice(0, 32)}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => reset()}
              style={{ cursor: 'pointer' }}
            >
              Try reloading view
            </button>
            <Link className="btn btn-ghost btn-sm" href="/admin">
              Admin Overview
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
