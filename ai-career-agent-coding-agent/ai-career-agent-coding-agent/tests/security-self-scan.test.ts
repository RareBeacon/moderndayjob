import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Self security scan (weekly /api/cron/security-scan). The runner takes an
 * injectable fetch, so the tests feed it a fake internet: one healthy run
 * (zero findings) and one breached gate (must surface as a finding).
 */

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: [] } })),
        updateUserById: vi.fn(async () => ({ data: { user: { id: 'u' } }, error: null })),
        createUser: vi.fn(async () => ({ data: { user: { id: 'scanner-user' } }, error: null })),
      },
    },
  },
}));

import { runSelfScan } from '@/lib/security/self-scan';

process.env.CRON_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sb.example.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

function b64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const TOKEN = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url('{"sub":"scanner","role":"authenticated"}')}.sig`;

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function healthyInternet(breach?: 'admin-open'): typeof fetch {
  let tokenCalls = 0;
  const homeHeaders: Record<string, string> = {
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const auth = (init?.headers as Record<string, string>)?.Authorization ?? '';
    if (u.origin === 'http://jobiest.com') return res(308);
    if (u.pathname === '/') return res(200, {}, homeHeaders);
    if (u.hostname === 'sb.example.co') {
      if (u.pathname.startsWith('/auth/v1/token')) {
        tokenCalls += 1;
        // First grant fails (no account yet), succeeds after createUser ran.
        return tokenCalls === 1 ? res(400, { error: 'invalid_credentials' }) : res(200, { access_token: TOKEN });
      }
      return res(200, []);
    }
    if (u.pathname === '/api/profile') {
      if (!auth) return res(401, { error: 'UNAUTHENTICATED' });
      if (auth === `Bearer ${TOKEN}`) return res(200, { profile: {} });
      return res(401, { error: 'UNAUTHENTICATED' });
    }
    if (u.pathname === '/api/admin/users' || u.pathname === '/api/admin/credentials') {
      if (init?.method === 'POST' && auth === `Bearer ${TOKEN}`) {
        if (breach === 'admin-open' && u.pathname === '/api/admin/users') {
          return res(200, { users: [{ email: 'owner@jobiest.com' }] });
        }
        return res(403, { error: 'FORBIDDEN' });
      }
      return res(401, { error: 'UNAUTHENTICATED' });
    }
    if (u.pathname === '/api/documents' || u.pathname.startsWith('/api/cron/')) {
      return res(401, { error: 'UNAUTHENTICATED' });
    }
    if (u.pathname.startsWith('/api/documents/') || u.pathname.startsWith('/api/applications/')) {
      return res(404, { error: 'NOT_FOUND' });
    }
    if (u.pathname === '/api/entitlements') return res(200, { plan: 'FREE' });
    if (u.pathname === '/api/jobs') return res(200, { jobs: [] });
    return res(200, {});
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runSelfScan', () => {
  it('reports zero findings against a healthy site', async () => {
    const report = await runSelfScan('https://jobiest.com', healthyInternet());
    expect(report.findings).toEqual([]);
    expect(report.scannerAccount).toBe('CREATED');
    const names = report.checks.map((c) => c.name);
    expect(names).toContain('JWT: tampered user id rejected');
    expect(names).toContain('mass assignment ignored');
    expect(names).toContain('anon RLS: profiles leaks nothing');
  });

  it('surfaces a breached admin gate as a finding', async () => {
    const report = await runSelfScan('https://jobiest.com', healthyInternet('admin-open'));
    expect(report.findings.length).toBe(1);
    expect(report.findings[0].name).toBe('admin blocked: /api/admin/users');
  });
});
