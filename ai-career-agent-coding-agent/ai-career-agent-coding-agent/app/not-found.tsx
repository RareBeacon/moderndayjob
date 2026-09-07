import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="jl-page" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <p className="jl-eyebrow" style={{ justifyContent: 'center' }}>404 · Not found</p>
        <h1 style={{ fontSize: 'var(--text-5xl)', color: 'var(--color-primary)', margin: '12px 0' }}>
          This page went somewhere else.
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '12px 0 28px' }}>
          The link may be broken or the page may have moved. Your career data is safe.
        </p>
        <Link className="jl-btn-solid" href="/" style={{ textDecoration: 'none' }}>Back to Jobiest</Link>
      </div>
    </div>
  );
}
