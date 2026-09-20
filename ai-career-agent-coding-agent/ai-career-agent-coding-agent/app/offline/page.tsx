import Link from 'next/link';

/**
 * Offline fallback served by the service worker when navigation fails.
 * Static, dependency-free, brand-styled.
 */
export const metadata = { title: 'You are offline - Jobiest' };

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#111C35',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            borderRadius: 16,
            background: '#F8D64D',
            display: 'grid',
            placeItems: 'center',
            fontSize: 28,
            fontWeight: 800,
            color: '#111C35',
          }}
        >
          J.
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 10px' }}>You are offline</h1>
        <p style={{ opacity: 0.85, lineHeight: 1.6, margin: '0 0 22px' }}>
          Jobiest needs a connection to load your dashboard and applications. Everything you did is saved. Reconnect and try again.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: '#F8D64D',
            color: '#111C35',
            fontWeight: 700,
            padding: '12px 22px',
            borderRadius: 10,
            textDecoration: 'none',
          }}
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
