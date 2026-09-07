'use client';

import { useState } from 'react';
import { IconSearch, IconMenu, IconClose } from './Icons';

const LINKS = [
  { label: 'Home', href: '/', active: true },
  { label: 'Jobs', href: '/jobs', active: false },
  { label: 'Employers', href: '/#employers', active: false },
  { label: 'Resources', href: '/#tools', active: false },
  { label: 'About', href: '/#about', active: false },
];

/** Jobiest wordmark + yellow ascent mark (the same mark geometry as Logo.tsx). */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="5" r="2.3" fill="currentColor" />
    </svg>
  );
}

export function JobletNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="jl-nav" aria-label="Primary">
      <div className="jl-shell jl-nav-inner">
        <a className="jl-brand" href="/">
          <span className="jl-brand-mark">
            <BrandMark />
          </span>
          Jobiest
        </a>

        <div className="jl-nav-links">
          {LINKS.map((l) => (
            <a key={l.label} className={l.active ? 'active' : undefined} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="jl-nav-actions">
          <a className="jl-nav-search" href="/jobs" aria-label="Search jobs">
            <IconSearch size={20} />
          </a>
          <a className="jl-btn-ghost" href="/login">Sign In</a>
          <a className="jl-btn-solid" href="/signup">Get Started</a>
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
              className={l.active ? 'active' : undefined}
              href={l.href}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a href="/login" onClick={() => setOpen(false)}>Sign In</a>
          <a href="/signup" onClick={() => setOpen(false)}>Get Started</a>
        </div>
      )}
    </nav>
  );
}
