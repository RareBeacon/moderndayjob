'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { IconMenu, IconClose } from './Icons';

const LINKS = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Free tools', href: '/tools' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];

/**
 * Marketing navbar. `authenticated` is set server-side (never by the browser):
 * signed-in visitors get one clear home; the dashboard; instead of
 * sign-in prompts, and the brand mark takes them there.
 */
export function JobletNavbar({ authenticated = false }: { authenticated?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const homeHref = authenticated ? '/dashboard' : '/';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav className="jl-nav" aria-label="Primary">
      <div className="jl-shell jl-nav-inner">
        <a className="jl-brand" href={homeHref}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-wordmark-dark.png" alt="Jobiest" width={124} height={34} style={{ display: 'block' }} />
        </a>

        <div className="jl-nav-links">
          {LINKS.map((l) => (
            <a key={l.label} className={isActive(l.href) ? 'active' : undefined} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="jl-nav-actions">
          {authenticated ? (
            <a className="jl-btn-solid" href="/dashboard">Go to Dashboard</a>
          ) : (
            <>
              <a className="jl-btn-ghost" href="/login">Sign In</a>
              <a className="jl-btn-solid" href="/signup">Get Started</a>
            </>
          )}
          <button
            type="button"
            className="jl-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="jl-mobile-menu">
          {LINKS.map((l) => (
            <a
              key={l.label}
              className={isActive(l.href) ? 'active' : undefined}
              href={l.href}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          {authenticated ? (
            <a href="/dashboard" onClick={() => setOpen(false)}>Go to Dashboard</a>
          ) : (
            <>
              <a href="/login" onClick={() => setOpen(false)}>Sign In</a>
              <a href="/signup" onClick={() => setOpen(false)}>Get Started</a>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
