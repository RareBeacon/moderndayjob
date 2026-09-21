/**
 * Icon set for the homepage design (ported from the design's SVG symbol
 * library). Stroke-based, 24x24, currentColor. Classes come from the scoped
 * homepage stylesheet (app/home.module.css): `.icon` and `.icon.small`.
 */
import styles from '@/app/home.module.css';
import type { ReactNode } from 'react';

export type IconName =
  | 'arrow' | 'arrow-up' | 'check' | 'shield' | 'spark' | 'file' | 'search'
  | 'location' | 'briefcase' | 'plus' | 'user' | 'message' | 'chart'
  | 'layers' | 'play' | 'menu' | 'close'
  | 'moon' | 'clock' | 'instagram' | 'tiktok' | 'whatsapp' | 'x';

const PATHS: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  'arrow-up': <path d="M7 17 17 7M7 7h10v10" />,
  check: <path d="m5 12 4 4L19 6" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 11 3 3 5-5" />
    </>
  ),
  spark: <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" />,
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a22 22 0 0 0 18 0M10 14h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  message: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  chart: <path d="M3 3v18h18M7 14l4-4 4 3 6-7" />,
  layers: <path d="m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6" />,
  play: <path d="m9 5 11 7-11 7V5Z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M17.2 6.8h.01" strokeWidth="2.6" />
    </>
  ),
  tiktok: <path d="M14 4v9.2a3.8 3.8 0 1 1-3.2-3.75M14 4c.4 2.4 2 4 4.4 4.2" />,
  whatsapp: (
    <>
      <path d="M21 11.7a9 9 0 0 1-13.2 7.9L3.5 20.5l.9-4.3A9 9 0 1 1 21 11.7Z" />
      <path d="M9.2 8.8c0 3.6 2.4 6 6 6l1-1.4 1.9.9" />
    </>
  ),
  x: <path d="M4 4l16 16M20 4 4 20" />,
};

export function Icon({ name, small, className }: { name: IconName; small?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={[className, styles.icon, small ? styles.small : ''].filter(Boolean).join(' ')}
    >
      {PATHS[name]}
    </svg>
  );
}
