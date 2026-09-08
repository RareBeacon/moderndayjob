'use client';

import { useEffect } from 'react';

/**
 * Global scroll-motion driver.
 *
 * 1. Entrance reveals — every element marked [data-animate] gets .is-visible
 *    as it nears the viewport (IntersectionObserver). A passive scroll sweep
 *    also reveals anything at/above the fold, so nothing can stay hidden.
 * 2. Parallax — elements marked [data-parallax="0.08"] drift slightly on
 *    scroll (desktop only, disabled under reduced motion).
 *
 * Reliability: no-observer / reduced-motion / no-JS all fall back to fully
 * visible, static content.
 */
export function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-animate]'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Stagger delays, applied once before observing.
    for (const el of els) {
      const delay = el.getAttribute('data-animate-delay');
      if (delay) el.style.transitionDelay = `${delay}ms`;
    }

    const reveal = (el: HTMLElement) => el.classList.add('is-visible');

    let io: IntersectionObserver | null = null;
    if (!reduce && typeof IntersectionObserver !== 'undefined' && els.length > 0) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) reveal(entry.target as HTMLElement);
          }
        },
        { threshold: 0, rootMargin: '0px 0px 18% 0px' },
      );
      els.forEach((el) => observer.observe(el));
      io = observer;
    } else {
      els.forEach(reveal);
    }

    const sweep = () => {
      const vh = window.innerHeight;
      for (const el of els) {
        if (el.classList.contains('is-visible')) continue;
        if (el.getBoundingClientRect().top < vh) reveal(el);
      }
    };
    window.addEventListener('scroll', sweep, { passive: true });
    sweep();

    // Parallax: desktop only, subtle, GPU-friendly.
    const pEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    let raf = 0;
    let onParallax: (() => void) | null = null;
    if (!reduce && pEls.length > 0 && window.innerWidth > 900) {
      onParallax = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const y = window.scrollY;
          for (const el of pEls) {
            const speed = parseFloat(el.getAttribute('data-parallax') || '0.08');
            el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
          }
          raf = 0;
        });
      };
      window.addEventListener('scroll', onParallax, { passive: true });
    }

    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', sweep);
      if (onParallax) {
        window.removeEventListener('scroll', onParallax);
        cancelAnimationFrame(raf);
      }
    };
  }, []);

  return null;
}
