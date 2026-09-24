import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Homepage routing contract (2026-09-24 production bug): any browser holding
 * a leftover jobiest session cookie (expired, revoked after session rotation,
 * signed-out remnants) that opened https://jobiest.com/ was redirected
 * / -> /dashboard -> /login?next=%2Fdashboard, because the middleware shipped
 * a "fast path" that treated mere cookie PRESENCE as authentication.
 *
 * The contract after the fix:
 * - '/' is a fully public route; the middleware matcher must not include it,
 *   so the homepage cannot inherit any protected-route destination.
 * - No layer may redirect '/' based on session state (valid, stale, or absent).
 * - '/dashboard' remains protected: unauthenticated -> /login?next=%2Fdashboard.
 */
describe('homepage routing contract', () => {
  const middleware = readFileSync('middleware.ts', 'utf8');

  it('the middleware matcher does not include the homepage', () => {
    const matcher = middleware.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const entries = matcher.match(/'[^']*'/g) ?? [];
    expect(entries.some((e) => e === "'/'")).toBe(false);
  });

  it('no cookie-presence fast path redirects the homepage to /dashboard', () => {
    expect(middleware).not.toContain('hasSessionCookie');
    expect(middleware).not.toMatch(/pathname === '\/'\s*&&/);
  });

  it('dashboard and other private pages stay protected', () => {
    const protectedList = middleware.match(/PROTECTED = \[([^\]]*)\]/)?.[1] ?? '';
    for (const route of ["'/dashboard'", "'/profile'", "'/settings'", "'/applications'"]) {
      expect(protectedList).toContain(route);
    }
  });

  it('unauthenticated protected-route redirect still carries the requested path', () => {
    expect(middleware).toContain("redirect.searchParams.set('next', pathname)");
  });
});
