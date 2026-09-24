import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Dashboard resilience (2026-09-24 incident): an iOS Safari user right after
 * Google signup + account completion hit "Something went wrong" on
 * /dashboard ten times (audit_logs, digest 3172225010). Root cause class:
 * a stale/rotated session cookie or a failed display dependency threw inside
 * the server render and landed in the error boundary instead of degrading.
 *
 * These guards keep the fixes in place: authed pages bounce stale sessions
 * to /login, and the dashboard's display data can never hard-crash the page.
 */
describe('authed pages degrade instead of crashing', () => {
  const dashboard = readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8');
  const settings = readFileSync('app/settings/page.tsx', 'utf8');

  it('dashboard redirects a stale session to /login instead of the error boundary', () => {
    expect(dashboard).toContain("error.message === 'UNAUTHENTICATED'");
    expect(dashboard).toContain("redirect('/login?next=%2Fdashboard')");
  });

  it('settings page does the same', () => {
    expect(settings).toContain("error.message === 'UNAUTHENTICATED'");
    expect(settings).toContain("redirect('/login?next=%2Fsettings')");
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
