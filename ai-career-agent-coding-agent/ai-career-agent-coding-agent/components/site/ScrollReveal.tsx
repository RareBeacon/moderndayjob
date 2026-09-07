'use client';

import { useEffect } from 'react';

/**
 * Global scroll-entrance animation driver.
 * Watches every element marked with [data-animate] and adds `.is-visible`
 * when it enters the viewport (IntersectionObserver, no libraries).
 * Stagger with a data-animate-delay attribute (ms). Respects reduced motion:
 * when the user prefers it, elements are revealed immediately.
 *
 * Mounted once in the root layout so the behaviour is available on every
 * page; pages that never use [data-animate] are unaffected (zero overhead
 * beyond this tiny hook).
 */
export function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-animate]'));

    // Stagger: apply the per-element delay once, before observing.
    for (const el of els) {
      const delay = el.getAttribute('data-animate-delay');
      if (delay) el.style.transitionDelay = `${delay}ms`;
    }

    if (reduce) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
