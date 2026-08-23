'use client';
import { useEffect } from 'react';

/**
 * Mounts once. Enables the `.reveal-ready` initial-hidden state, then reveals
 * every `[data-reveal]` as it scrolls into view. Without JS, content stays
 * visible (progressive enhancement) — good for SEO and no-JS fallbacks.
 */
export function ScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.add('reveal-ready');

    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (prefersReduced) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
