import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUT /api/profile · not_applicable persistence (Milestone 1).
 * The wizard sends the sections a user marked as not applicable; the route
 * must whitelist them (schema) and persist them on career_profiles, so the
 * onboarding gate can count them as addressed without invented data.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === 'profiles'
        ? { update: (...args: unknown[]) => ({ eq: () => m.update(...args) }) }
        : { upsert: m.upsert },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));

import { PUT } from '@/app/api/profile/route';

function req(body: unknown) {
  return new Request('http://x/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  full_name: 'Ada Lovelace',
  target_roles: ['Backend Engineer'],
  headline: 'Engineer',
  summary: 'Building reliable systems.',
  skills: ['Go'],
  experience: [],
  education: [],
  not_applicable: ['experience', 'education'],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: 'user-123' });
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
  m.update.mockResolvedValue({ error: null });
  m.upsert.mockResolvedValue({ error: null });
});

describe('PUT /api/profile · not_applicable', () => {
  it('persists the marked sections on career_profiles', async () => {
    const res = await PUT(req(validBody));
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ not_applicable: ['experience', 'education'] }),
      { onConflict: 'user_id' },
    );
  });

  it('rejects a section outside the allowed three', async () => {
    const res = await PUT(req({ ...validBody, not_applicable: ['headline'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('defaults to an empty list when the field is absent', async () => {
    const { not_applicable, ...without } = validBody;
    const res = await PUT(req(without));
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ not_applicable: [] }),
      { onConflict: 'user_id' },
    );
  });
});
