import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/applications/target (2026-09-20). With the job listings feature
 * retired, users bring the role they want. This route must save the
 * user-supplied target as a private jobs row (one per user+url) and start the
 * approval workflow through the same prepareApplication path the old match
 * flow used. No public pool is read or exposed.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  upsert: vi.fn(),
  prepareApplication: vi.fn(),
  auditEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: () => '1.2.3.4' }));
vi.mock('@/lib/audit', () => ({ auditEvent: m.auditEvent }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'jobs') throw new Error(`unexpected table ${table}`);
      return {
        upsert: (...args: unknown[]) => {
          m.upsert(...args);
          return { select: () => ({ single: async () => ({ data: { id: 'job-uuid-1' }, error: null }) }) };
        },
      };
    },
  },
}));
const appSvc = vi.hoisted(() => ({
  AppActionError: class extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('@/lib/applications/service', () => ({
  ...appSvc,
  prepareApplication: m.prepareApplication,
}));

import { POST } from '@/app/api/applications/target/route';

const detail = {
  application: { id: 'app-1', status: 'PREPARING', job: { id: 'job-uuid-1' } },
  package: [],
  timeline: [],
  automationEnabled: false,
};

function body(over: Record<string, unknown> = {}) {
  return {
    url: 'https://boards.greenhouse.io/acme/jobs/123',
    title: 'Backend Engineer',
    company: 'Acme',
    ...over,
  };
}

function call(over: Record<string, unknown> = {}) {
  return POST(
    new Request('http://x/api/applications/target', {
      method: 'POST',
      body: JSON.stringify(body(over)),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  m.requireUser.mockResolvedValue({ id: 'u1', email: 'u1@jobiest.com' });
  m.prepareApplication.mockResolvedValue(detail);
});

describe('POST /api/applications/target', () => {
  it('saves the user target and starts the application (201)', async () => {
    const res = await call({ location: 'Lagos', description: 'Node.js role.' });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.application.id).toBe('app-1');

    const [values, opts] = m.upsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(values.source).toBe('MANUAL');
    expect(values.company).toBe('Acme');
    expect(values.title).toBe('Backend Engineer');
    expect(values.url).toBe(body().url);
    expect(values.description).toBe('Node.js role.');
    expect(values.location).toBe('Lagos');
    expect(values.created_at).toBeTruthy();
    expect(opts.onConflict).toBe('source,external_id');
    expect(m.prepareApplication).toHaveBeenCalledWith('u1', 'job-uuid-1', 'u1@jobiest.com');
    expect(m.auditEvent).toHaveBeenCalled();
  });

  it('works without optional location and description', async () => {
    const res = await call({ location: undefined, description: undefined });
    expect(res.status).toBe(201);
    const [values] = m.upsert.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(values.location).toBeNull();
    expect(values.description).toBeNull();
  });

  it('maps prepareApplication EXPIRED_JOB to 409', async () => {
    m.prepareApplication.mockRejectedValue(new appSvc.AppActionError('EXPIRED_JOB'));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EXPIRED_JOB');
  });

  it('maps MFA_REQUIRED to 401', async () => {
    m.requireUser.mockRejectedValue(new Error('MFA_REQUIRED'));
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('MFA_REQUIRED');
  });

  it('returns 500 JOB_TARGET_FAILED when the job save fails', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase');
    (supabaseAdmin as unknown as { from: (t: string) => unknown }).from = () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) }),
    });
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('JOB_TARGET_FAILED');
  });
});
