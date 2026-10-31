import Link from 'next/link';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

/* AppShell: the authenticated workspace chrome.
   A calm, receding sidebar on desktop with clear human navigation groups,
   a sticky top bar with mobile drawer support, and a 5-slot thumb-zone
   bottom bar on mobile. Server component (no hooks); active state passed
   per page. Uses canonical Jobiest brand tokens from styles/tokens.css. */

type NavItem = { key: string; href: string; label: string; icon: ReactNode };
type NavGroup = { heading: string; items: NavItem[] };

const ic = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
    <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICONS = {
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3zM14 7l3 3',
  user: 'M12 8m-4 0a4 4 0 108 0 4 4 0 10-8 0M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  briefcase: 'M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 7h18v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 12h18',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  settings: 'M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5zm7.4-2.6l1.6-1.2-1.6-2.8-1.9.7a6.9 6.9 0 0 0-1.2-.7L16.1 7h-3.2l-.2 1.9a6.9 6.9 0 0 0-1.2.7l-1.9-.7-1.6 2.8 1.6 1.2a7.3 7.3 0 0 0 0 1.4l-1.6 1.2 1.6 2.8 1.9-.7a6.9 6.9 0 0 0 1.2.7l.2 1.9h3.2l.2-1.9a6.9 6.9 0 0 0 1.2-.7l1.9.7 1.6-2.8-1.6-1.2a7.3 7.3 0 0 0 0-1.4z',
  shield: 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3zM9.5 12l1.8 1.8 3.4-3.6',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Search & Apply',
    items: [
      { key: 'dashboard', href: '/dashboard', label: 'Workspace', icon: ic(ICONS.home) },
      { key: 'applications', href: '/applications', label: 'Applications', icon: ic(ICONS.layers) },
      { key: 'generate', href: '/generate', label: 'Resume Studio', icon: ic(ICONS.edit) },
    ],
  },
  {
    heading: 'Your Foundation',
    items: [
      { key: 'profile', href: '/profile', label: 'Career profile', icon: ic(ICONS.user) },
      { key: 'documents', href: '/documents', label: 'Saved documents', icon: ic(ICONS.file) },
      { key: 'portfolios', href: '/portfolios', label: 'Portfolio', icon: ic(ICONS.briefcase) },
    ],
  },
  {
    heading: 'Account',
    items: [
      { key: 'billing', href: '/billing', label: 'Billing & plan', icon: ic(ICONS.card) },
      { key: 'settings', href: '/settings', label: 'Settings', icon: ic(ICONS.settings) },
    ],
  },
];

const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const BOTTOM: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Workspace', icon: ic(ICONS.home) },
  { key: 'applications', href: '/applications', label: 'Applications', icon: ic(ICONS.layers) },
  { key: 'generate', href: '/generate', label: 'CV Studio', icon: ic(ICONS.edit) },
  { key: 'profile', href: '/profile', label: 'Profile', icon: ic(ICONS.user) },
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
          <label htmlFor="appnav-toggle" className="app-drawer-close" aria-label="Close navigation">
            &#x2715;
          </label>
        </div>
        <nav className="app-nav">
          {NAV_GROUPS.map((group) => (
            <div className="app-nav-group" key={group.heading}>
              <span className="app-nav-heading">{group.heading}</span>
              {group.items.map((n) => (
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
            </div>
          ))}
        </nav>
        <div className="app-side-foot">
          <div className="app-foot-card">
            <span className="app-ico sm">{ic(ICONS.shield)}</span>
            <div>
              <strong>You stay in control</strong>
              <span>Nothing sends without your say-so.</span>
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
          <p className="app-title">{title ?? ALL_NAV.find((n) => n.key === active)?.label ?? 'Workspace'}</p>
          <div className="app-topbar-actions">
            <Link className="app-top-ghost" href="/generate">Resume Studio</Link>
            <Link className="app-top-cta" href="/applications?openTarget=1">New application</Link>
          </div>
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
        <label htmlFor="appnav-toggle" className="app-tab app-tab-more" aria-label="Open full menu">
          <span className="app-ico">{ic(ICONS.menu)}</span>
          <span className="app-lbl">Menu</span>
        </label>
      </nav>
    </div>
  );
}
