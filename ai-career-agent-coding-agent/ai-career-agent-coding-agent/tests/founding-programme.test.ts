import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMMEDIATE_PRIORITY_ROLES,
  PARTNER_CATEGORIES,
  PROGRAMME_DEPARTMENTS,
  PROGRAMME_TRACKS,
  PUBLIC_ANNOUNCEMENT_TEXT,
  WORKING_ARRANGEMENTS,
} from '@/lib/programme/catalog';

const mockInsertSingle = vi.fn();
const mockInsertEvent = vi.fn();
const mockMaybeSingle = vi.fn();
const mockUpdateSingle = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true, remaining: 7 })),
  requestIp: vi.fn(() => '203.0.113.10'),
}));

vi.mock('@/lib/auth', () => ({
  getOptionalUser: vi.fn(async () => null),
  requireUser: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000001', email: 'owner@jobiest.com' })),
}));

vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'admin_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  user_id: '00000000-0000-4000-8000-000000000001',
                  role: 'OWNER',
                  is_owner: true,
                  is_active: true,
                  require_mfa: true,
                  permissions: {},
                },
              }),
            }),
          }),
        };
      }
      if (table === 'programme_applications') {
        return {
          insert: (payload: unknown) => ({
            select: () => ({
              single: () => mockInsertSingle(payload),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: () => mockMaybeSingle(),
            }),
          }),
          update: (payload: unknown) => ({
            eq: () => ({
              select: () => ({
                single: () => mockUpdateSingle(payload),
              }),
            }),
          }),
        };
      }
      if (table === 'programme_application_events' || table === 'admin_audit_logs') {
        return {
          insert: (payload: unknown) => mockInsertEvent(payload),
        };
      }
      return {};
    }),
  },
}));

describe('Founding Team & Strategic Partnerships Programme (/apply + /admin/programme)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes all 3 entry tracks, 6 departments, Top-10 priority roles, and 6 working arrangements', () => {
    expect(PROGRAMME_TRACKS.map((t) => t.code)).toEqual(['JOIN_TEAM', 'PARTNER', 'COLLABORATOR']);
    expect(PROGRAMME_DEPARTMENTS).toHaveLength(6);
    expect(PROGRAMME_DEPARTMENTS.map((d) => d.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(IMMEDIATE_PRIORITY_ROLES).toHaveLength(10);
    expect(IMMEDIATE_PRIORITY_ROLES.filter((r) => r.immediateWave)).toHaveLength(5);
    expect(WORKING_ARRANGEMENTS).toHaveLength(6);
    expect(PARTNER_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    expect(PUBLIC_ANNOUNCEMENT_TEXT).toContain('https://jobiest.com/apply');
  });

  it('POST /api/founding-programme/apply auto-prioritizes Top-5 roles and returns a JBP reference code', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        reference_code: 'JBP-2026-ABCDEF',
        created_at: '2026-11-01T12:00:00.000Z',
      },
      error: null,
    });
    mockInsertEvent.mockResolvedValue({ error: null });

    const { POST } = await import('@/app/api/founding-programme/apply/route');
    const req = new Request('https://jobiest.com/api/founding-programme/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        track: 'JOIN_TEAM',
        department: 'SALES_BD',
        roleTitle: 'B2B Outreach Associate',
        arrangement: 'PART_TIME',
        applicantName: 'Chidi Nwosu',
        applicantEmail: 'chidi@example.com',
        country: 'Nigeria',
        experienceSummary: '3 years leading outbound B2B lead generation for SaaS teams across US and UK.',
        motivationStatement: 'Deliver 200 researched accounts and 15 qualified discovery calls in my first 60 days.',
        termsAcknowledged: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.referenceCode).toBe('JBP-2026-ABCDEF');
    expect(body.priorityBand).toBe('TOP_PRIORITY');

    const insertedPayload = mockInsertSingle.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedPayload.priority_rank).toBe(4);
    expect(insertedPayload.priority_band).toBe('TOP_PRIORITY');
  });

  it('enforces Business Rule #1 in PATCH /api/admin/programme/[id]: never marks partnership verified without documented basis', async () => {
    const appId = '22222222-2222-4222-8222-222222222222';
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: appId,
        track: 'PARTNER',
        status: 'UNDER_REVIEW',
        partnership_verified: false,
        decision_maker_contact: 'Alex Carter <alex@uscompany.com>',
      },
    });

    const { PATCH } = await import('@/app/api/admin/programme/[id]/route');

    // Attempt to mark partnershipVerified=true WITHOUT verificationBasis -> must fail 400!
    const badReq = new Request(`https://jobiest.com/api/admin/programme/${appId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partnershipVerified: true }),
    });
    const badRes = await PATCH(badReq, { params: Promise.resolve({ id: appId }) });
    expect(badRes.status).toBe(400);
    const badJson = await badRes.json();
    expect(badJson.error).toBe('PARTNERSHIP_VERIFICATION_BASIS_REQUIRED');

    // Now supply documented verificationBasis + decision-maker contact -> succeeds!
    mockUpdateSingle.mockResolvedValueOnce({
      data: {
        id: appId,
        track: 'PARTNER',
        status: 'PARTNERSHIP_ACTIVE',
        priority_band: 'HIGH',
        partnership_verified: true,
      },
      error: null,
    });
    const okReq = new Request(`https://jobiest.com/api/admin/programme/${appId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnershipVerified: true,
        verificationBasis: 'ACTIVE_VACANCY_SHARED',
        decisionMakerContact: 'Alex Carter <alex@uscompany.com>',
      }),
    });
    const okRes = await PATCH(okReq, { params: Promise.resolve({ id: appId }) });
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.ok).toBe(true);
    expect(okJson.record.partnership_verified).toBe(true);
  });
});
