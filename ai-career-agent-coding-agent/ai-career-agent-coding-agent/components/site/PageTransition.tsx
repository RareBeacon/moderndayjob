'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Page in/out transition. Every route change remounts this wrapper (keyed by
 * pathname) so the CSS enter animation in styles/motion.css plays once per
 * navigation. Full page loads animate on first paint the same way. Content is
 * never hidden from no-JS visitors: the animation only runs on mount.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
