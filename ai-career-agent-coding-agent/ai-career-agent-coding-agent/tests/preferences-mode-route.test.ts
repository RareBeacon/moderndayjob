import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/preferences/mode · the automatic-submission on/off button.
 * The write must be keyed on the SERVER-derived user id (requireUser),
 * accept only the two toggle values ('auto' | 'approval'), and reject
 * everything else before touching the database. The upsert must send
 * only the mode column so the rest of the user's preferences row keeps
 * its values.
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

import { POST } from '@/app/api/preferences/mode/route';

function req(body: unknown) {
  return new Request('http://x/api/preferences/mode', {
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

describe('POST /api/preferences/mode', () => {
  it('turns automatic submission on, keyed on the server-derived user id', async () => {
    const res = await POST(req({ application_mode: 'auto' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, application_mode: 'auto' });
    expect(m.upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', application_mode: 'auto', updated_at: expect.any(String) },
      { onConflict: 'user_id' },
    );
  });

  it('turns automatic submission back off to the approval default', async () => {
    const res = await POST(req({ application_mode: 'approval' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, application_mode: 'approval' });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123', application_mode: 'approval' }),
      { onConflict: 'user_id' },
    );
  });

  it('writes only the mode column so the rest of the row keeps its values', async () => {
    await POST(req({ application_mode: 'auto' }));
    const [row] = m.upsert.mock.calls[0];
    expect(Object.keys(row).sort()).toEqual(['application_mode', 'updated_at', 'user_id']);
  });

  it('rejects the finer wizard modes and garbage before any write', async () => {
    for (const bad of ['draft', 'assist', 'turbo', '', null, 0, false]) {
      const res = await POST(req({ application_mode: bad }));
      expect(res.status, `mode=${String(bad)}`).toBe(400);
      expect((await res.json()).error).toBe('INVALID_BODY');
    }
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('rejects a missing mode with 400', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('never lets the client pick an arbitrary user_id', async () => {
    await POST(req({ application_mode: 'auto', user_id: 'someone-else' }));
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
      expect.anything(),
    );
  });

  it('returns 401 when unauthenticated, without writing', async () => {
    m.requireUser.mockResolvedValue(null);
    const res = await POST(req({ application_mode: 'auto' }));
    expect(res.status).toBe(401);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited, without writing', async () => {
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(req({ application_mode: 'auto' }));
    expect(res.status).toBe(429);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('surfaces a database failure as 500', async () => {
    m.upsert.mockResolvedValue({ error: { message: 'boom' } });
    const res = await POST(req({ application_mode: 'auto' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PREFERENCES_UPDATE_FAILED');
  });
});
