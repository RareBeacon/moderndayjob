/**
 * Logo, the single source of truth for the Jobiest mark (2026 refresh).
 * The wordmark and icon are served as images from /public/images so every
 * surface (marketing header, app shell, admin, free tools, auth pages,
 * favicons) shows the same mark geometry.
 */

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/images/logo-mark.png" alt="" width={size} height={size} aria-hidden="true" style={{ display: 'block' }} />
  );
}

export function Logo({ className = 'mk-logo', size }: { className?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/logo-wordmark-light.png"
      alt="Jobiest"
      className={className}
      width={size ? size * 2.6 : 130}
      height={size ?? 50}
      style={{ width: size ? size * 2.6 : undefined, height: size ?? undefined, display: 'inline-block' }}
    />
  );
}
