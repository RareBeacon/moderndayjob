'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * CountUp, a number that counts up when it scrolls into view.
 * Reduced motion (or no IntersectionObserver): renders the final value
 * immediately. Duration is short and the easing deliberate; it is a
 * confirmation, not a toy.
 */
export function CountUp({ to, duration = 1400, suffix = '', className }: {
  to: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') { setValue(to); return; }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, { threshold: 0.4 });
      io.observe(el);
      return () => io.disconnect();
    }
    setValue(to);
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}{suffix}
    </span>
  );
}
