import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';

/* AdminShell, internal chrome for /admin surfaces.
   Denser than the user app: ruled data tables, tracked uppercase
   overlines, no marketing ornament. §6.10 of the UI/UX plan. */

const NAV = [
  { href: '/admin', key: 'overview', label: 'Control Centre' },
  { href: '/admin/users', key: 'users', label: 'Users' },
  { href: '/admin/programme', key: 'programme', label: 'Founding & Partners CRM' },
  { href: '/admin/team', key: 'team', label: 'Admin Team & RBAC' },
  { href: '/admin/email', key: 'email', label: 'Email Infra' },
  { href: '/admin/talent-pool', key: 'talent-pool', label: 'Talent Pool' },
  { href: '/admin/employers', key: 'employers', label: 'Employers' },
  { href: '/admin/radar', key: 'radar', label: 'Opportunity Radar' },
  { href: '/admin/coupons', key: 'coupons', label: 'Coupons' },
  { href: '/admin/credentials', key: 'credentials', label: 'AI credentials' },
  { href: '/admin/security', key: 'security', label: 'Security' },
  { href: '/admin/usage', key: 'usage', label: 'AI usage' },
  { href: '/admin/applications', key: 'applications', label: 'Auto-apply' },
  { href: '/admin/seo', key: 'seo', label: 'SEO Mission Control' },
  { href: '/admin/support', key: 'support', label: 'Support' },
] as const;

export function AdminShell({ active, children }: { active: (typeof NAV)[number]['key']; children: ReactNode }) {
  return (
    <>
      <header className="ad-header">
        <div className="ad-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" aria-label="Jobiest Home">
              <Logo variant="light" size={28} />
            </Link>
            <span className="ad-tag">Admin</span>
          </span>
          <Link href="/dashboard" className="ad-back">← Back to app</Link>
        </div>
        <div className="ad-sub">
          <nav className="ad-subnav" aria-label="Admin navigation">
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
    <>
      <header className="ad-header">
        <div className="ad-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" aria-label="Jobiest Home">
              <Logo variant="light" size={28} />
            </Link>
            <span className="ad-tag">Admin</span>
          </span>
          <Link href="/dashboard" className="ad-back">← Back to app</Link>
        </div>
      </header>
      <main id="main" className="ad-main">
        <div className="ad-forbidden">
          <span className="mk-kicker">Restricted Access</span>
          <h1 style={{ fontFamily: 'var(--font-display, var(--font-space-grotesk), sans-serif)', fontSize: 28, margin: '12px 0 8px', color: 'var(--brand-ink)' }}>
            Admin Access Required
          </h1>
          <p className="muted" style={{ margin: '8px 0 20px', fontSize: 14 }}>
            Your account is authenticated, but does not have administrator privileges on this platform.
            This access attempt has been logged for system security.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link className="btn btn-primary btn-sm" href="/dashboard">
              ← Return to your Workspace
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

/** Fallback view rendered inside AdminShell when an unexpected error occurs during data loading. */
export function AdminFallbackView({ error }: { error?: string }) {
  return (
    <AdminShell active="overview">
      <div className="panel" style={{ padding: 24, maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <span className="mk-kicker" style={{ color: 'var(--danger, #dc2626)' }}>Diagnostic Mode</span>
        <h2 style={{ fontSize: 22, margin: '12px 0 8px' }}>Control Centre Live Data Unavailable</h2>
        <p className="muted" style={{ fontSize: 14, margin: '8px 0 20px' }}>
          A database query or network response did not complete as expected. You can retry loading the overview or browse individual sections.
        </p>
        {error && (
          <p className="ad-mono" style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', padding: '8px 12px', border: '1px solid var(--line)', marginBottom: 20 }}>
            {error.slice(0, 180)}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-sm" href="/admin">
            Retry Control Centre
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/radar">
            Opportunity Radar
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/dashboard">
            Back to app
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
