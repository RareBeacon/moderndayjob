import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/site/Logo';

/**
 * Admin Route Loading Skeleton.
 * Provides immediate visual feedback when navigating to /admin surfaces,
 * preventing white flashes or blank unpainted frames during SSR data fetching.
 */
export default function AdminLoading() {
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
        <div className="ad-sub">
          <nav className="ad-subnav" aria-label="Admin loading">
            <span style={{ padding: '12px 14px', fontSize: 13.5, color: 'var(--muted)' }}>
              Loading navigation...
            </span>
          </nav>
        </div>
      </header>
      <main id="main" className="ad-main" aria-busy="true" aria-live="polite">
        <div style={{ maxWidth: 720, marginBottom: 28 }}>
          <div style={{ height: 16, width: 180, background: 'var(--line)', borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 32, width: 340, background: 'var(--line)', borderRadius: 6, marginBottom: 12 }} />
          <div style={{ height: 16, width: '90%', background: 'var(--line)', borderRadius: 4 }} />
        </div>

        <div className="grid grid-4" style={{ gap: 12, marginBottom: 28 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="panel" style={{ padding: 18, minHeight: 110 }}>
              <div style={{ height: 12, width: '60%', background: 'var(--line)', borderRadius: 4, marginBottom: 12 }} />
              <div style={{ height: 28, width: '40%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 12, width: '80%', background: 'var(--line)', borderRadius: 4 }} />
            </div>
          ))}
        </div>

        <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Loading Jobiest Control Centre operations telemetry...
          </p>
        </div>
      </main>
    </>
  );
}
