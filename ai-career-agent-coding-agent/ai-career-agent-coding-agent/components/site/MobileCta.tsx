'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * MobileCta, the thumb-zone conversion bar (mobile only).
 * Research-backed: primary actions belong in the bottom-centre natural
 * thumb zone on one-handed phones. Appears after the hero, respects the
 * safe-area inset on notched devices, and never traps scroll.
 */
export function MobileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 761px)').matches) return;
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={`mcta ${show ? 'on' : ''}`} aria-hidden={!show}>
      <div className="mcta-in">
        <span className="mcta-copy"><b>Jobiest</b><span>Free forever · 2 credits/day</span></span>
        <Link className="mk-btn-accent mcta-btn" href="/signup" tabIndex={show ? 0 : -1}>Start free</Link>
      </div>
    </div>
  );
}
