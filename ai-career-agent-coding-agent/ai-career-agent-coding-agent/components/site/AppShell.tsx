import Link from 'next/link';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

/* AppShell, the authenticated chrome (Phase 2): a receding warm sidebar
   on desktop, a top bar with a CSS-only mobile drawer, and a fixed bottom
   tab bar on mobile. Server component (no hooks); active state passed per
   page. Token-driven; recedes so the work area takes precedence (Linear). */

type NavItem = { key: string; href: string; label: string; icon: ReactNode };

const ic = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
    <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICONS = {
  grid: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  search: 'M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0M20 20l-3.5-3.5',
  target: 'M12 12m-8 0a8 8 0 1016 0 8 8 0 10-16 0M12 12m-3.5 0a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0M12 2v3M12 19v3',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3zM14 7l3 3',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  user: 'M12 8m-4 0a4 4 0 108 0 4 4 0 10-8 0M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5',
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6l1-8z',
  settings: 'M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5zm7.4-2.6l1.6-1.2-1.6-2.8-1.9.7a6.9 6.9 0 0 0-1.2-.7L16.1 7h-3.2l-.2 1.9a6.9 6.9 0 0 0-1.2.7l-1.9-.7-1.6 2.8 1.6 1.2a7.3 7.3 0 0 0 0 1.4l-1.6 1.2 1.6 2.8 1.9-.7a6.9 6.9 0 0 0 1.2.7l.2 1.9h3.2l.2-1.9a6.9 6.9 0 0 0 1.2-.7l1.9.7 1.6-2.8-1.6-1.2a7.3 7.3 0 0 0 0-1.4z',
};

const NAV: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Today', icon: ic(ICONS.home) },
  { key: 'generate', href: '/generate', label: 'Create', icon: ic(ICONS.edit) },
  { key: 'applications', href: '/applications', label: 'Applications', icon: ic(ICONS.layers) },
  { key: 'documents', href: '/documents', label: 'My documents', icon: ic(ICONS.file) },
  { key: 'portfolios', href: '/portfolios', label: 'Portfolio', icon: ic(ICONS.layers) },
  { key: 'billing', href: '/billing', label: 'Billing', icon: ic(ICONS.card) },
  { key: 'profile', href: '/profile', label: 'Career profile', icon: ic(ICONS.user) },
  { key: 'settings', href: '/settings', label: 'Settings', icon: ic(ICONS.settings) },
];

const BOTTOM: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Today', icon: ic(ICONS.home) },
  { key: 'applications', href: '/applications', label: 'Applications', icon: ic(ICONS.layers) },
  { key: 'generate', href: '/generate', label: 'Create', icon: ic(ICONS.edit) },
];


export function AppShell({
  active,
  title,
  children,
}: {
  active: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      {/* CSS-only mobile drawer toggle (no client JS) */}
      <input id="appnav-toggle" type="checkbox" className="app-nav-toggle" aria-hidden="true" />

      <aside className="app-sidebar" aria-label="Primary">
        <div className="app-side-top">
          <Link href="/"><Logo /></Link>
        </div>
        <nav className="app-nav">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className={`app-link${n.key === active ? ' active' : ''}`}
              aria-current={n.key === active ? 'page' : undefined}
            >
              <span className="app-ico">{n.icon}</span>
              <span className="app-lbl">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="app-side-foot">
          <div className="app-foot-card">
            <span className="app-ico sm">{ic(ICONS.bolt)}</span>
            <div>
              <strong>Approval mode</strong>
              <span>Nothing sends without you.</span>
            </div>
          </div>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="app-signout">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <label htmlFor="appnav-toggle" className="app-burger" aria-label="Open navigation">
            <span /><span /><span />
          </label>
          <h1 className="app-title">{title ?? NAV.find((n) => n.key === active)?.label ?? 'Workspace'}</h1>
          <Link className="app-top-cta" href="/applications">Start an application</Link>
        </header>

        <main className="app-content">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="app-bottom" aria-label="Quick navigation">
        {BOTTOM.map((n) => (
          <Link key={n.key} href={n.href} className={`app-tab${n.key === active ? ' active' : ''}`} aria-current={n.key === active ? 'page' : undefined}>
            <span className="app-ico">{n.icon}</span>
            <span className="app-lbl">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
