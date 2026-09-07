'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="jl-page" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <p className="jl-eyebrow" style={{ justifyContent: 'center' }}>Something went wrong</p>
        <h1 style={{ fontSize: 'var(--text-5xl)', color: 'var(--color-primary)', margin: '12px 0' }}>
          We hit a snag.
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '12px 0 28px' }}>
          Nothing you entered was lost. Try again, and if it keeps happening, come back in a minute.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="jl-btn-solid" onClick={() => reset()} style={{ cursor: 'pointer' }}>Try again</button>
          <a className="jl-btn-ghost" href="/" style={{ textDecoration: 'none' }}>Back home</a>
        </div>
      </div>
    </div>
  );
}
