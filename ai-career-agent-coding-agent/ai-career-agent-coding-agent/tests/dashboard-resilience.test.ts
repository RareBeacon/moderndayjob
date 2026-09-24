import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Dashboard resilience (2026-09-24 incident, two rounds): an iOS Safari user
 * right after Google signup + account completion hit "Something went wrong"
 * on /dashboard repeatedly. Round 1 added the UNAUTHENTICATED redirect; the
 * user still crashed at 16:19Z on the fixed code, proving other auth
 * failures (MFA_REQUIRED, ACCOUNT_*, auth-service throws) reached the
 * boundary too.
 *
 * Round 2 architecture:
 * - lib/auth.ts fails soft on auth acquisition (a throwing auth call reads as
 *   anonymous, never a render crash) and exposes requireUserOrRedirect,
 *   which triages every requireUser outcome into a redirect.
 * - The middleware treats a throwing auth call as anonymous.
 * - Dashboard/settings use requireUserOrRedirect; the dashboard additionally
 *   records the real server-side error (SERVER_RENDER_ERROR) before the
 *   boundary renders, because the client reporter only sees a redacted
 *   message.
 * - Display data (entitlement, completeness, credits) falls back, never
 *   throws (round 1, kept).
 */
describe('authed pages degrade instead of crashing', () => {
  const dashboard = readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8');
  const settings = readFileSync('app/settings/page.tsx', 'utf8');
  const auth = readFileSync('lib/auth.ts', 'utf8');
  const middleware = readFileSync('middleware.ts', 'utf8');

  it('dashboard and settings gate through requireUserOrRedirect', () => {
    expect(dashboard).toContain("requireUserOrRedirect('/dashboard')");
    expect(settings).toContain("requireUserOrRedirect('/settings')");
  });

  it('requireUserOrRedirect triages every auth outcome into a redirect', () => {
    expect(auth).toContain('export async function requireUserOrRedirect');
    expect(auth).toContain("error.message === 'UNAUTHENTICATED'");
    expect(auth).toContain("error.message === 'MFA_REQUIRED'");
    expect(auth).toContain("error.message.startsWith('ACCOUNT_')");
    expect(auth).toContain("redirect(`/login?next=${encodeURIComponent(nextPath)}`)");
  });

  it('a throwing auth call reads as anonymous, never a render crash', () => {
    // both cookie-path acquisitions are wrapped fail-soft
    const wrapped = auth.match(/\(\{ data: \{ user \} \} = await supabase\.auth\.getUser\(\)\);/g) ?? [];
    const caught = auth.match(/user = null;\s*\n\s*}/g) ?? [];
    expect(wrapped.length).toBeGreaterThanOrEqual(2);
    expect(caught.length).toBeGreaterThanOrEqual(2);
    // bearer path fails closed too
    expect(auth).toContain('return { user: null, needsMfa: false };');
  });

  it('middleware treats a throwing auth call as anonymous', () => {
    expect(middleware).toContain('await supabase.auth.getUser()');
    expect(middleware).toMatch(/catch \{\s*\n\s*user = null;\s*\n\s*\}/);
  });

  it('dashboard records the real server-side error before the boundary', () => {
    expect(dashboard).toContain("'SERVER_RENDER_ERROR'");
    expect(dashboard).toContain('DashboardBody');
  });

  it('pipeline tally iterates the DATA of the select, never the response object (M7 bug)', () => {
    // 2026-09-24 root cause: `pipelineCounts,` in the Promise.all destructure
    // bound the full PostgREST response object; for-of over it threw
    // "(B ?? []) is not iterable" and crashed every authenticated load.
    expect(dashboard).toContain('{ data: pipelineCounts }');
    expect(dashboard).not.toContain('as unknown as { status: string }[]');
  });

  it('dashboard entitlement and completeness failures fall back, never throw', () => {
    expect(dashboard).toContain('getEntitlement(user.id).catch(');
    expect(dashboard).toContain('getProfileCompleteness(user.id).catch(');
  });

  it('board link lists survive wrong-typed rows (string/object in a text[] column)', () => {
    const boardlinks = readFileSync('lib/boardlinks.ts', 'utf8');
    expect(boardlinks).toContain("typeof v === 'string'");
    expect(boardlinks).toContain('Array.isArray(values)');
  });
});
