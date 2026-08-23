import type { SVGProps, ReactNode } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P & { children: ReactNode }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

export function IconProfile(p: P) {
  return <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M5 21c0-3.9 3.1-6 7-6s7 2.1 7 6" /></Svg>;
}
export function IconDiscover(p: P) {
  return <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
}
export function IconMatch(p: P) {
  return <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" /></Svg>;
}
export function IconTruth(p: P) {
  return <Svg {...p}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>;
}
export function IconTrack(p: P) {
  return <Svg {...p}><path d="m4 7 8-3 8 3-8 3z" /><path d="M4 12l8 3 8-3" /><path d="M4 17l8 3 8-3" /></Svg>;
}
export function IconShield(p: P) {
  return <Svg {...p}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /></Svg>;
}
