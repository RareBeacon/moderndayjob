'use client';

import { useEffect } from 'react';

/**
 * Global scroll-entrance animation driver.
 * Watches every element marked with [data-animate] and adds `.is-visible`
 * when it nears the viewport.
 *
 * Reliability rules (content must never stay hidden):
 * - IntersectionObserver reveals elements as they near the viewport.
 * - A passive scroll sweep reveals anything at/above the fold, catching
 *   elements that leap past the viewport on fast flicks.
 * - If IntersectionObserver is unavailable (or reduced motion), everything
 *   is revealed immediately.
 * Stagger with a data-animate-delay attribute (ms).
 */
export function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-animate]'));
    if (els.length === 0) return;

    // Stagger: apply the per-element delay once, before observing.
    for (const el of els) {
      const delay = el.getAttribute('data-animate-delay');
      if (delay) el.style.transitionDelay = `${delay}ms`;
    }

    const reveal = (el: HTMLElement) => el.classList.add('is-visible');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || typeof IntersectionObserver === 'undefined') {
      els.forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        }
      },
      { threshold: 0, rootMargin: '0px 0px 20% 0px' },
    );
    els.forEach((el) => io.observe(el));

    // Catch-all: reveal every element whose top is above the viewport
    // bottom (already visible or scrolled past). Idempotent + cheap.
    const sweep = () => {
      const vh = window.innerHeight;
      for (const el of els) {
        if (el.classList.contains('is-visible')) continue;
        if (el.getBoundingClientRect().top < vh) reveal(el);
      }
    };
    window.addEventListener('scroll', sweep, { passive: true });
    sweep();

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', sweep);
    };
  }, []);

  return null;
}
