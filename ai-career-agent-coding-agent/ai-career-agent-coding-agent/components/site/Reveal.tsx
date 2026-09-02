'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Reveal-on-scroll wrapper (IntersectionObserver, no libraries).
 * - Adds `.in` when the element enters the viewport; CSS handles the motion.
 * - Stagger via the `delay` prop (ms).
 * - Reduced motion: CSS in globals.css makes `.reveal` a no-op, content is
 *   always fully visible (we also skip observing when the user prefers
 *   reduced motion, so nothing ever depends on the animation to appear).
 */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'figure';
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { el.classList.add('in'); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { el.classList.add('in'); io.disconnect(); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
