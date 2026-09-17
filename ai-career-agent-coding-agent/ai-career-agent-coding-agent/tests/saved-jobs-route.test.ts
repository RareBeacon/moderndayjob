import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Saved-jobs route: auth-gated, idempotent save/unsave, validated job
 * references, honest error codes.
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
const eq = vi.fn();
const upsert = vi.fn();
const del = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn();

vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: table === 'saved_jobs' ? select : vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      upsert,
      delete: del,
    }),
  },
}));

import { GET, PUT, DELETE } from '@/app/api/saved-jobs/route';

const user = { id: 'u1', email: 'ada@example.com' };
const req = (body?: unknown, method = 'PUT') =>
  new Request('http://localhost/api/saved-jobs', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(user);
  enforceRateLimit.mockResolvedValue({ allowed: true });
  maybeSingle.mockResolvedValue({ data: { id: '00000000-0000-4000-8000-000000000001' } });
  upsert.mockResolvedValue({ error: null });
  // route chain: .delete().eq().eq() -> awaited
  del.mockReturnValue({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) });
});

describe('GET /api/saved-jobs', () => {
  it('returns saved jobs flattened with saved_at', async () => {
    select.mockReturnValue({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({
            data: [{ created_at: '2026-01-01', jobs: { id: 'j1', title: 'Engineer' } }],
            error: null,
          })),
        })),
      })),
    });
    const res = await GET(req(undefined, 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([{ id: 'j1', title: 'Engineer', saved_at: '2026-01-01' }]);
  });

  it('requires auth', async () => {
    requireUser.mockResolvedValue(null);
    expect((await GET(req(undefined, 'GET'))).status).toBe(401);
  });
});

describe('PUT /api/saved-jobs', () => {
  it('saves a valid job idempotently', async () => {
    const res = await PUT(req({ jobId: '00000000-0000-4000-8000-000000000001' }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', job_id: '00000000-0000-4000-8000-000000000001' },
      { onConflict: 'user_id,job_id', ignoreDuplicates: true },
    );
  });

  it('404s for a job that does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    expect((await PUT(req({ jobId: '00000000-0000-4000-8000-000000000001' }))).status).toBe(404);
  });

  it('rejects malformed bodies', async () => {
    expect((await PUT(req({ jobId: 'not-a-uuid' }))).status).toBe(400);
  });

  it('rate limits', async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false });
    expect((await PUT(req({ jobId: '00000000-0000-4000-8000-000000000001' }))).status).toBe(429);
  });
});

describe('DELETE /api/saved-jobs', () => {
  it('removes a saved job', async () => {
    const res = await DELETE(req({ jobId: '00000000-0000-4000-8000-000000000001' }, 'DELETE'));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalled();
  });
});
