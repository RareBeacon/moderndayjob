import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin users-list route (Phase 9). Listing users through the admin overview
 * view must be admin-only: a non-admin gets 403 (not a 500), and the data
 * comes straight from the RLS-gated admin_user_overview view.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: m.maybeSingle }),
        order: m.order,
      }),
    }),
  },
}));

import { GET } from '@/app/api/admin/users/route';

beforeEach(() => {
  vi.clearAllMocks();
  m.order.mockResolvedValue({ data: [{ id: 'u1' }], error: null });
});

describe('GET /api/admin/users', () => {
  it('returns 403 for a non-admin', async () => {
    m.requireUser.mockResolvedValue({ id: 'not-admin' });
    m.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('returns the overview list for an admin', async () => {
    m.requireUser.mockResolvedValue({ id: 'admin-1' });
    m.maybeSingle.mockResolvedValue({ data: { user_id: 'admin-1' }, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'u1' }]);
  });

  it('returns an empty list when the view is empty', async () => {
    m.requireUser.mockResolvedValue({ id: 'admin-1' });
    m.maybeSingle.mockResolvedValue({ data: { user_id: 'admin-1' }, error: null });
    m.order.mockResolvedValue({ data: [], error: null });
    const res = await GET();
    expect(await res.json()).toEqual([]);
  });
});
