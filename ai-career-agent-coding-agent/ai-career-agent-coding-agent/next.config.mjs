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
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.supabase.co https://accounts.google.com https://www.linkedin.com",
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
const noIndex = { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' };

const noStoreSources = [
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/mfa-verify',
  '/complete-account',
  '/dashboard/:path*',
  '/opportunities/:path*',
  '/onboarding/:path*',
  '/profile/:path*',
  '/settings/:path*',
  '/documents/:path*',
  '/applications/:path*',
  '/billing/:path*',
  '/match/:path*',
  '/generate/:path*',
  '/auto-apply/:path*',
  '/talent-pool/:path*',
  '/employer/:path*',
  '/admin/:path*',
  '/api/admin/:path*',
  '/api/credentials',
  '/api/profile',
  '/api/documents/:path*',
  '/api/talent-pool/:path*',
  '/api/employer/:path*',
  '/api/radar/:path*',
];

const noIndexSources = [
  '/admin/:path*',
  '/dashboard/:path*',
  '/opportunities/:path*',
  '/onboarding/:path*',
  '/profile/:path*',
  '/settings/:path*',
  '/documents/:path*',
  '/applications/:path*',
  '/billing/:path*',
  '/talent-pool/:path*',
  '/employer/:path*',
  '/api/:path*',
];

const interviewMediaPermissions = {
  key: 'Permissions-Policy',
  value: 'camera=(self), microphone=(self), geolocation=(), payment=()',
};

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@playwright/**/*',
      'node_modules/playwright/**/*',
      'node_modules/playwright-core/**/*',
      'node_modules/typescript/**/*',
      'node_modules/@types/**/*',
      'node_modules/vitest/**/*',
      'node_modules/@esbuild/**/*',
      'node_modules/tsx/**/*',
      'node_modules/caniuse-lite/**/*',
      'docs/**/*',
      'tests/**/*',
      'qa/**/*',
      'reports/**/*',
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@supabase/supabase-js',
      'docx',
      'pdf-lib',
      'zod',
    ],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/talent-pool/interview/:path*', headers: [interviewMediaPermissions] },
      ...noStoreSources.map((source) => ({ source, headers: [noStore] })),
      ...noIndexSources.map((source) => ({ source, headers: [noIndex] })),
    ];
  },
};
export default nextConfig;
