'use client';

/**
 * Homepage header (design: sticky, blurred, mobile menu). React port of the
 * design's menu behaviour: toggle, close on link click, Escape, and outside
 * click.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/home.module.css';
import { Icon } from './Icons';

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#tools', label: 'Free tools' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/blog', label: 'Resources', external: true },
];

export function BrandWordmark() {
  return (
    <Link className={styles.brand} href="/" aria-label="Jobiest home">
      <span className={styles['brand-mark']} aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path d="M11 43 24 24 35 35 53 13" />
          <circle cx="53" cy="13" r="5" />
        </svg>
      </span>
      jobiest<span className={styles['brand-period']}>.</span>
    </Link>
  );
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !toggleRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <header className={styles['site-header']}>
      <div className={`${styles.container} ${styles['header-inner']}`}>
        <BrandWordmark />
        <nav className={styles['desktop-nav']} aria-label="Main navigation">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label} {item.external ? <Icon name="arrow-up" small /> : null}
            </Link>
          ))}
        </nav>
        <div className={styles['header-actions']}>
          <Link className={styles['sign-in']} href="/login">Sign in</Link>
          <Link className={`${styles.button} ${styles['button-navy']} ${styles['button-small']}`} href="/signup">
            Start for free <Icon name="arrow" />
          </Link>
          <button
            ref={toggleRef}
            className={styles['menu-toggle']}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
      <div id="mobile-menu" ref={menuRef} className={styles['mobile-nav']} aria-label="Mobile navigation" hidden={!open}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
        ))}
        <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
      </div>
    </header>
  );
}
