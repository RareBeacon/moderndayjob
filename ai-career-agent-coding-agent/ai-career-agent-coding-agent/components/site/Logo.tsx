/**
 * Logo, the single source of truth for the Jobiest mark.
 * A career in ascent: a rising line that peaks at a dot (the goal),
 * drawn with the same geometry everywhere. Every surface links the
 * same mark: marketing header, app shell, admin, free tools, auth
 * pages, and the favicon set generated from this shape.
 */

export function LogoMark({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="5" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className = 'mk-logo', size }: { className?: string; size?: number }) {
  return (
    <span className={className}>
      <span className="mark" aria-hidden="true">
        <LogoMark size={size} />
      </span>
      Jobiest
    </span>
  );
}
