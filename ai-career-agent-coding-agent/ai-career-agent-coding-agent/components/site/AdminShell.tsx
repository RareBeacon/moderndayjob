import Link from 'next/link';
import type { ReactNode } from 'react';

/* AdminShell — internal chrome for /admin surfaces.
   Denser than the user app: ruled data tables, tracked uppercase
   overlines, no marketing ornament. §6.10 of the UI/UX plan. */

function Logo() {
  return (
    <span className="mk-logo">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="5" r="2.1" fill="currentColor" />
        </svg>
      </span>
      ModernJob
    </span>
  );
}

const NAV = [
  { href: '/admin/users', key: 'users', label: 'Users' },
  { href: '/admin/credentials', key: 'credentials', label: 'AI credentials' },
  { href: '/admin/security', key: 'security', label: 'Security' },
] as const;

export function AdminShell({ active, children }: { active: (typeof NAV)[number]['key']; children: ReactNode }) {
  return (
    <>
      <header className="ad-header">
        <div className="ad-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link href="/"><Logo /></Link>
            <span className="ad-tag">Admin</span>
          </span>
          <Link href="/dashboard" className="ad-back">← Back to app</Link>
        </div>
        <div className="ad-sub">
          <nav className="ad-subnav" aria-label="Admin">
            {NAV.map((n) => (
              <Link key={n.key} href={n.href} className={n.key === active ? 'on' : ''}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="ad-main">
        {children}
      </main>
    </>
  );
}

/** Rendered when a signed-in user is not in admin_users. */
export function AdminForbidden() {
  return (
    <main id="main" className="ad-main">
      <div className="ad-forbidden">
        <span className="mk-kicker">Restricted</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: '10px 0 6px' }}>Admin access required</h1>
        <p className="muted">Your account is not an administrator. This attempt is recorded.</p>
        <p style={{ marginTop: 16 }}><Link className="inline-link" href="/dashboard">← Back to your dashboard</Link></p>
      </div>
    </main>
  );
}
