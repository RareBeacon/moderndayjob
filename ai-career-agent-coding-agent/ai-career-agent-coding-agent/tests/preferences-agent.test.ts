import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preferences route owner-scoping (Phase 9). The agent pause/resume toggle is
 * the per-user kill switch; it must be written against the SERVER-derived
 * user id (requireUser), never anything the client sends, and must reject
 * non-boolean bodies before touching the database.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  upsert: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: () => ({ upsert: m.upsert }) } }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));

import { POST } from '@/app/api/preferences/agent/route';

function req(body: unknown) {
  return new Request('http://x/api/preferences/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: 'user-123' });
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
  m.upsert.mockResolvedValue({ error: null });
});

describe('POST /api/preferences/agent', () => {
  it('pauses the agent keyed on the server-derived user id', async () => {
    const res = await POST(req({ active: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: false });
    expect(m.upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', active: false, updated_at: expect.any(String) },
      { onConflict: 'user_id' },
    );
  });

  it('resumes the agent', async () => {
    const res = await POST(req({ active: true }));
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123', active: true }),
      { onConflict: 'user_id' },
    );
  });

  it('rejects a non-boolean active flag with 400 before any write', async () => {
    const res = await POST(req({ active: 'yes' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('never lets the client pick an arbitrary user_id', async () => {
    await POST(req({ active: false, user_id: 'someone-else' }));
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
      expect.anything(),
    );
  });

  it('returns 429 when rate limited, without writing', async () => {
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(req({ active: true }));
    expect(res.status).toBe(429);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('surfaces a database failure as 500', async () => {
    m.upsert.mockResolvedValue({ error: { message: 'boom' } });
    const res = await POST(req({ active: true }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PREFERENCES_UPDATE_FAILED');
  });
});
