import type { SVGProps } from 'react';

/** Joblet-style inline icon set for the redesigned homepage.
 *  Every icon is a small stroke SVG using currentColor, no dependencies. */

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: P) =>
  base(p, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ));

export const IconPin = (p: P) =>
  base(p, (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ));

export const IconChevron = (p: P) => base(p, <path d="M6 9l6 6 6-6" />);

export const IconMenu = (p: P) => base(p, (
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>
));

export const IconClose = (p: P) => base(p, (
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </>
));

export const IconBolt = (p: P) => base(p, <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />);

export const IconShield = (p: P) =>
  base(p, (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
      <path d="M9.2 12l2 2 3.6-3.8" />
    </>
  ));

export const IconUsers = (p: P) =>
  base(p, (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.5 14.4c1.7.7 2.9 2.3 3 4.6" />
    </>
  ));

export const IconBriefcase = (p: P) =>
  base(p, (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ));

export const IconChart = (p: P) =>
  base(p, (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16l3.5-4.5L15 14l5-6" />
    </>
  ));

export const IconBuilding = (p: P) =>
  base(p, (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21v-3h4v3" />
    </>
  ));

export const IconGradCap = (p: P) =>
  base(p, (
    <>
      <path d="M2 9l10-5 10 5-10 5L2 9Z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      <path d="M22 9v5" />
    </>
  ));

export const IconStar = (p: P) =>
  base(p, <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />);

export const IconUpload = (p: P) =>
  base(p, (
    <>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M12 16V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
    </>
  ));

export const IconDocument = (p: P) =>
  base(p, (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ));

export const IconArrowRight = (p: P) => base(p, (
  <>
    <path d="M4 12h16" />
    <path d="M14 6l6 6-6 6" />
  </>
));

export const IconCheck = (p: P) => base(p, <path d="M5 12.5 L10 17 L19 7" />);
