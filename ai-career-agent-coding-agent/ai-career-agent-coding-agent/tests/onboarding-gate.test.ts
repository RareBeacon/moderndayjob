import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Onboarding gate (Enterprise upgrade Milestone 1).
 *
 * Directive Phase 5: protected product sections require 85% onboarding
 * completion, enforced server-side. Owner decision D6: the gate applies only
 * to accounts created on/after the epoch; existing accounts are never locked
 * out. The gate is armed by ONBOARDING_GATE_ENABLED (call-time read) and
 * stays OFF in production until the wizard's gate-aware UI ships.
 *
 * These tests cover: the weighted completion math, not-applicable sections
 * counting as addressed, cohort selection, the flag, the 403 shape, and the
 * gate wired into a real route (/api/preferences/mode).
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  upsert: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
  profileData: { full_name: 'Philip Opeyemi', target_roles: ['Data Analyst'] } as Record<string, unknown>,
  careerData: {} as Record<string, unknown> | null,
  prefsData: { locations: ['Lagos'], remote_types: [], employment_types: [] } as Record<string, unknown> | null,
  docCount: 3 as number | null,
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const result = (() => {
        if (table === 'profiles') return { data: m.profileData };
        if (table === 'career_profiles') return { data: m.careerData };
        if (table === 'job_preferences') return { data: m.prefsData };
        if (table === 'documents') return { count: m.docCount };
        return {};
      })();
      const promise = Promise.resolve(result);
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: () => promise,
        maybeSingle: () => promise,
        upsert: (...args: unknown[]) => m.upsert(...args),
        then: (resolve: unknown, reject: unknown) => promise.then(resolve as never, reject as never),
      };
      return chain;
    },
  },
}));

import { POST as modePOST } from '@/app/api/preferences/mode/route';
import { ONBOARDING_THRESHOLD, onboardingGate, onboardingGateResponse } from '@/lib/onboarding-gate';

/** A fully filled-in career profile (every section present). */
function completeCareer() {
  return {
    headline: 'Data Analyst',
    summary: 'Five years turning messy data into decisions.',
    skills: ['SQL', 'Python'],
    experience: [{ title: 'Analyst' }],
    education: [{ degree: 'BSc' }],
    projects: [{ name: 'Dashboard' }],
    links: { portfolio: 'https://example.com' },
    not_applicable: [] as string[],
  };
}

function modeReq(body: unknown) {
  return new Request('http://x/api/preferences/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ONBOARDING_GATE_ENABLED;
  delete process.env.ONBOARDING_GATE_EPOCH;
  m.requireUser.mockResolvedValue({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
  m.upsert.mockResolvedValue({ error: null });
  m.profileData = { full_name: 'Philip Opeyemi', target_roles: ['Data Analyst'] };
  m.careerData = completeCareer();
  m.prefsData = { locations: ['Lagos'], remote_types: [], employment_types: [] };
  m.docCount = 3;
});

afterEach(() => {
  delete process.env.ONBOARDING_GATE_ENABLED;
  delete process.env.ONBOARDING_GATE_EPOCH;
});

describe('weighted completion', () => {
  beforeEach(() => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
  });

  it('computes 100% when every section is addressed', async () => {
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.percent).toBe(100);
    expect(gate.next).toEqual([]);
  });

  it('weights are meaningful: a name alone is 5%, not one-ninth', async () => {
    m.profileData = { full_name: 'Philip Opeyemi', target_roles: [] };
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.percent).toBe(5); // name only (5 of 100)
  });

  it('missing only the master CV lands at 90%', async () => {
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.percent).toBe(90);
  });

  it('not-applicable sections count as addressed without invented data', async () => {
    m.careerData = { ...completeCareer(), experience: [], projects: [], not_applicable: ['experience', 'projects'] };
    m.docCount = 0; // CV still missing: 10
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.percent).toBe(90); // experience + projects count as addressed
  });

  it('unknown not_applicable values are ignored (constraint mirrors in app code)', async () => {
    m.careerData = { ...completeCareer(), not_applicable: ['name', 'skills', 'experience'] };
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    // name/skills are present anyway; only 'experience' is a real N/A section; CV missing
    expect(gate.percent).toBe(90);
  });
});

describe('gate cohort and flag', () => {
  it('is inert while ONBOARDING_GATE_ENABLED is explicitly off, even for incomplete new accounts', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'false';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.applied).toBe(false);
    expect(gate.allowed).toBe(true);
  });

  it('never locks out accounts created before the epoch (owner decision D6)', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2020-01-01T00:00:00Z' });
    expect(gate.applied).toBe(false);
    expect(gate.allowed).toBe(true);
  });

  it('blocks a gated-cohort account below the threshold', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.applied).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.percent).toBeLessThan(ONBOARDING_THRESHOLD);
    expect(gate.next.length).toBeGreaterThan(0);
  });

  it('allows a gated-cohort account at or above the threshold', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    const gate = await onboardingGate({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(gate.applied).toBe(true);
    expect(gate.allowed).toBe(true);
  });

  it('403 response carries ONBOARDING_REQUIRED with completeness and next steps', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const res = await onboardingGateResponse({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe('ONBOARDING_REQUIRED');
    expect(typeof body.completeness).toBe('number');
    expect(Array.isArray(body.next)).toBe(true);
  });

  it('returns null (proceed) for an allowed account', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    const res = await onboardingGateResponse({ id: 'user-123', created_at: '2027-01-05T00:00:00Z' });
    expect(res).toBeNull();
  });
});

describe('gate wired into /api/preferences/mode', () => {
  it('blocks a gated, incomplete account with 403 ONBOARDING_REQUIRED', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const res = await modePOST(modeReq({ application_mode: 'auto' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ONBOARDING_REQUIRED');
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('proceeds for the same account when the gate is disarmed by env', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'false';
    m.careerData = null;
    m.prefsData = null;
    m.docCount = 0;
    const res = await modePOST(modeReq({ application_mode: 'auto' }));
    expect(res.status).toBe(200);
    expect(m.upsert).toHaveBeenCalled();
  });

  it('proceeds for a complete gated-cohort account', async () => {
    process.env.ONBOARDING_GATE_ENABLED = 'true';
    const res = await modePOST(modeReq({ application_mode: 'approval' }));
    expect(res.status).toBe(200);
  });
});
