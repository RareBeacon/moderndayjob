'use client';

import { useEffect } from 'react';

/**
 * Global scroll-motion driver (v2).
 *
 * 1. Entrance reveals: elements matching [data-animate] (authored) or
 *    .jl-sec / .ft-sec / .mk-section (auto-tagged) fade/rise in once as
 *    they approach the viewport. Reveal-once: elements never re-hide, so
 *    nothing loops or flickers while scrolling.
 * 2. Live DOM: a MutationObserver picks up elements added by client-side
 *    navigation, so reveals keep working on every page change. (v1 bug:
 *    the element list was captured once at first load and went stale,
 *    leaving sections on later pages permanently hidden.)
 * 3. Auto-tagged sections already above the fold are left untouched, so
 *    first paint never flashes.
 * 4. Parallax: [data-parallax] elements drift on scroll (desktop pointer
 *    devices only, reduced motion respected). Parallax elements must not
 *    also carry data-animate: the entrance transition and the per-frame
 *    transforms fight and smear.
 *
 * Reliability: reduced motion, missing observers, and no-JS all fall back
 * to fully visible, static content (see globals.css and the layout noscript).
 */
export function ScrollReveal() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // CSS already forces everything visible

    const AUTHORED = '[data-animate]';
    const AUTO = ['.jl-sec', '.ft-sec', '.mk-section'];
    const ALL = `${AUTHORED}, ${AUTO.join(', ')}`;

    const seen = new WeakSet<HTMLElement>();
    const reveal = (el: HTMLElement) => el.classList.add('is-visible');

    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll<HTMLElement>(AUTHORED).forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            io.unobserve(entry.target); // reveal once, never re-hide
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px 12% 0px' },
    );

    function prep(el: HTMLElement) {
      if (seen.has(el)) return;
      seen.add(el);
      const isAuto = !el.hasAttribute('data-animate');
      if (isAuto) {
        // Already above the fold? Keep it plainly visible: no flash on load.
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        el.setAttribute('data-animate', 'fade');
      }
      const delay = el.getAttribute('data-animate-delay');
      if (delay) el.style.transitionDelay = `${delay}ms`;
      io.observe(el);
    }

    function scan() {
      document.querySelectorAll<HTMLElement>(ALL).forEach(prep);
    }

    scan();

    // React client-side navigation swaps the DOM; pick up new sections.
    let scanTimer = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scan, 50);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Parallax: desktop pointer devices only, GPU-friendly.
    const pEls = new Set<HTMLElement>();
    let raf = 0;
    let onScroll: (() => void) | null = null;
    if (window.matchMedia('(pointer: fine)').matches && window.innerWidth > 900) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        if (el.hasAttribute('data-animate')) return; // never mix with entrance
        el.style.transition = 'none'; // per-frame transforms must never fight a CSS transition
        pEls.add(el);
      });
      onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const y = window.scrollY;
          for (const el of pEls) {
            const speed = parseFloat(el.getAttribute('data-parallax') || '0.08');
            el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
          }
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      mo.disconnect();
      window.clearTimeout(scanTimer);
      io.disconnect();
      if (onScroll) {
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(raf);
      }
    };
  }, []);

  return null;
}
