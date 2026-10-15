'use client';

import { useEffect } from 'react';

/**
 * Global scroll-motion driver (v3).
 *
 * 1. Entrance reveals: elements matching [data-animate] (authored) or
 *    .jl-sec / .ft-sec / .mk-section (auto-tagged) fade/rise in as they
 *    approach the viewport. Default is reveal-once: content pages never
 *    re-hide, so nothing flickers while reading.
 * 2. Repeat mode (new): elements with data-animate-repeat re-hide once they
 *    have FULLY left the viewport and animate in again on every re-entry,
 *    so sections respond while scrolling both up and down. Used on the
 *    homepage sections.
 * 3. Stagger (new): containers with data-stagger turn their direct children
 *    into fade targets with a sequential delay, so cards and list lines
 *    arrive one after another. Children repeat too when the container also
 *    has data-animate-repeat.
 * 4. Live DOM: a MutationObserver picks up elements added by client-side
 *    navigation, so reveals keep working on every page change. (v1 bug:
 *    the element list was captured once at first load and went stale,
 *    leaving sections on later pages permanently hidden.)
 * 5. Auto-tagged or staggered elements already above the fold are left
 *    untouched, so first paint never flashes.
 * 6. Parallax: [data-parallax] elements drift on scroll (desktop pointer
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
    const staggeredHosts = new WeakSet<HTMLElement>();
    const repeating = new WeakSet<HTMLElement>();
    const reveal = (el: HTMLElement) => el.classList.add('is-visible');
    const hide = (el: HTMLElement) => el.classList.remove('is-visible');

    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll<HTMLElement>(AUTHORED).forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            reveal(el);
            if (!repeating.has(el)) io.unobserve(el); // reveal once, never re-hide
          } else if (repeating.has(el)) {
            // Only re-arm animation once the element is fully out of view,
            // in either direction, so on-screen content never disappears.
            const r = el.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= window.innerHeight) hide(el);
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
      if (el.hasAttribute('data-animate-repeat')) repeating.add(el);
      const delay = el.getAttribute('data-animate-delay');
      if (delay && !el.style.transitionDelay) el.style.transitionDelay = `${delay}ms`;
      io.observe(el);
    }

    /** data-stagger containers: children become staggered fade targets. */
    function prepStagger(host: HTMLElement) {
      if (staggeredHosts.has(host)) return;
      staggeredHosts.add(host);
      const repeat = host.hasAttribute('data-animate-repeat');
      const children = Array.from(host.children).slice(0, 12) as HTMLElement[];
      children.forEach((child, i) => {
        if (!child.hasAttribute('data-animate')) {
          // Above the fold at tagging time? Leave it plainly visible.
          if (child.getBoundingClientRect().top < window.innerHeight) return;
          child.setAttribute('data-animate', 'fade');
        }
        if (repeat) child.setAttribute('data-animate-repeat', '');
        if (!child.style.transitionDelay && !child.hasAttribute('data-animate-delay')) {
          child.style.transitionDelay = `${i * 90}ms`;
        }
      });
    }

    function scan() {
      document.querySelectorAll<HTMLElement>('[data-stagger]').forEach(prepStagger);
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
