import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/saved-jobs (2026-10-05 sweep fix): a well-formed UUID for a job
 * that no longer exists must answer a clean 404 JOB_NOT_FOUND (never a 500
 * with the raw foreign-key error text), and the FK race between the
 * existence check and the upsert must resolve the same way.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
  from: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from } }));

import { POST } from '@/app/api/saved-jobs/route';

const JOB_ID = '11111111-2222-4333-8444-555555555555';

function jobsTable() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  m.requireUser.mockResolvedValue({ id: 'user-1' });
});

describe('POST /api/saved-jobs', () => {
  it('returns 401 when logged out', async () => {
    m.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await POST(new Request('http://x/api/saved-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: JOB_ID }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 404 JOB_NOT_FOUND (no SQL details) for a nonexistent job id', async () => {
    m.from.mockImplementation((table: string) =>
      table === 'jobs' ? jobsTable() : {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });
    const res = await POST(new Request('http://x/api/saved-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: JOB_ID }),
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('JOB_NOT_FOUND');
    expect(JSON.stringify(body)).not.toContain('foreign key');
  });

  it('maps an FK race on upsert to 404 as well', async () => {
    m.from.mockImplementation((table: string) =>
      table === 'jobs'
        ? {
            ...jobsTable(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: JOB_ID }, error: null }),
          }
        : {
            upsert: vi.fn().mockResolvedValue({
              error: { code: '23503', message: 'insert or update on table "saved_jobs" violates foreign key' },
            }),
          });
    const res = await POST(new Request('http://x/api/saved-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: JOB_ID }),
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('JOB_NOT_FOUND');
    expect(body.details).toBeUndefined();
  });

  it('saves and returns success when the job exists', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    m.from.mockImplementation((table: string) =>
      table === 'jobs'
        ? {
            ...jobsTable(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: JOB_ID }, error: null }),
          }
        : { upsert });
    const res = await POST(new Request('http://x/api/saved-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: JOB_ID }),
    }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', job_id: JOB_ID },
      { onConflict: 'user_id,job_id' },
    );
  });

  it('rejects a malformed job id with 400 before any DB call', async () => {
    const res = await POST(new Request('http://x/api/saved-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: 'not-a-uuid' }),
    }));
    expect(res.status).toBe(400);
    expect(m.from).not.toHaveBeenCalled();
  });
});
