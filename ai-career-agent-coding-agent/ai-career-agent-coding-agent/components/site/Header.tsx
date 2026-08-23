'use client';
import { useState } from 'react';
import Link from 'next/link';

const NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="logo" aria-label="ModernJob home" onClick={() => setOpen(false)}>
          <span className="dot" aria-hidden="true">M</span>
          ModernJob
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <div className="links">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </div>
          <div className="actions">
            <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/signup" className="btn btn-sm">Get started</Link>
            <button
              type="button"
              className="menu-btn"
              aria-label="Toggle navigation menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </nav>
      </div>
      {open && (
        <div id="mobile-menu" className="mobile-menu">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
        </div>
      )}
    </header>
  );
}
