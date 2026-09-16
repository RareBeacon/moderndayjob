/**
 * Security headers (Master Implementation Package F-002/F-003/F-008).
 *
 * CSP notes:
 *  - `unsafe-eval` removed (2026-09-16): Next.js production bundles do not
 *    require it (dev-only react-refresh); no app code uses eval/new Function.
 *  - `unsafe-inline` retained for now: Next.js inline bootstrap scripts
 *    require it unless a nonce-based CSP is wired through middleware
 *    (backlog B-040, larger change with regression risk).
 *  - connect-src pinned to the Supabase project wildcard (auth + data APIs).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Cross-origin isolation hardening (F-008)
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/** Authenticated and account surfaces must never be cacheable (F-003). */
const noStore = { key: 'Cache-Control', value: 'no-store, max-age=0' };

const noStoreSources = [
  '/login',
  '/signup',
  '/reset-password',
  '/dashboard/:path*',
  '/onboarding/:path*',
  '/profile/:path*',
  '/documents/:path*',
  '/applications/:path*',
  '/billing/:path*',
  '/match/:path*',
  '/generate/:path*',
];

const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      ...noStoreSources.map((source) => ({ source, headers: [noStore] })),
    ];
  },
};
export default nextConfig;
