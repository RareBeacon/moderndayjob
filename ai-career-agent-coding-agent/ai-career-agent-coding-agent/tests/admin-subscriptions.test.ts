import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin subscription management + checkout quotes (migration 043).
 *  - /api/admin/subscriptions/change: admin gate, RPC contract, audit +
 *    notification ONLY on success (spec Part 7/8/9), friendly failures.
 *  - createCheckoutQuote: coupon errors surface as CouponApplyError; the
 *    quote row is persisted with the server-computed price.
 *  - applyQuotedPayment wrapper: null on missing RPC (legacy fallback),
 *    throw on real errors.
 */

const m = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  rpc: vi.fn(),
  fromInsert: vi.fn(),
  profileSelect: vi.fn(),
  auditEvent: vi.fn(),
  sendPlanChangeEmail: vi.fn(),
  quoteInsert: vi.fn(),
  couponSelect: vi.fn(),
  redemptionCount: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({
  requireAdminUser: m.requireAdminUser,
  adminErrorResponse: (e: unknown) => {
    const message = e instanceof Error ? e.message : 'INTERNAL';
    if (message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    return Response.json({ error: message }, { status: 500 });
  },
}));
vi.mock('@/lib/auth', () => ({ requireUser: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/audit', () => ({ auditEvent: m.auditEvent }));
vi.mock('@/lib/email/resend', () => ({ sendPlanChangeEmail: m.sendPlanChangeEmail }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: m.rpc,
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: m.profileSelect }) }) };
      if (table === 'notifications') return { insert: m.fromInsert };
      if (table === 'admin_actions') return { insert: m.fromInsert };
      if (table === 'payment_quotes') return { insert: m.quoteInsert };
      if (table === 'coupons') return { select: () => ({ eq: () => ({ maybeSingle: m.couponSelect }) }) };
      if (table === 'coupon_redemptions') return { select: () => ({ eq: () => ({ eq: m.redemptionCount }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { POST as changePlan } from '@/app/api/admin/subscriptions/change/route';
import { createCheckoutQuote, applyQuotedPayment, CouponApplyError } from '@/lib/billing/checkout';

function req(body: unknown) {
  return new Request('http://localhost/api/admin/subscriptions/change', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdminUser.mockResolvedValue({ id: 'admin-1', email: 'admin@jobiest.com' });
  m.profileSelect.mockResolvedValue({ data: { user_id: 'u1', email: 'u1@x.co', full_name: 'John Doe', account_status: 'ACTIVE' }, error: null });
  m.fromInsert.mockResolvedValue({ error: null });
  m.auditEvent.mockResolvedValue(undefined);
  m.sendPlanChangeEmail.mockResolvedValue({ ok: true });
});

describe('POST /api/admin/subscriptions/change', () => {
  it('rejects a non-admin with 403 and never calls the RPC', async () => {
    m.requireAdminUser.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', durationDays: 30 }));
    expect(res.status).toBe(403);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it('requires a duration for paid plans', async () => {
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'DURATION_REQUIRED' });
  });

  it('rejects an unknown target user', async () => {
    m.profileSelect.mockResolvedValue({ data: null, error: null });
    const res = await changePlan(req({ userId: '99999999-9999-9999-9999-999999999999', plan: 'PREMIUM', durationDays: 30 }));
    expect(res.status).toBe(404);
  });

  it('applies a grant through the RPC with the exact contract', async () => {
    m.rpc.mockResolvedValue({ data: { mode: 'applied', oldPlan: 'FREE', newPlan: 'PREMIUM', status: 'ACTIVE_PREMIUM', expiresAt: '2026-11-06T00:00:00Z' }, error: null });
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', durationDays: 30, reason: 'Beta promotion' }));
    expect(res.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith('admin_change_subscription', {
      p_admin_id: 'admin-1',
      p_target_user_id: '11111111-1111-1111-1111-111111111111',
      p_new_plan: 'PREMIUM',
      p_duration_days: 30,
      p_start_mode: 'IMMEDIATELY',
      p_reason: 'Beta promotion',
    });
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.result.newPlan).toBe('PREMIUM');
  });

  it('writes the audit trail + admin action + user notification ONLY after success', async () => {
    m.rpc.mockResolvedValue({ data: { mode: 'applied', oldPlan: 'BASIC', newPlan: 'PREMIUM', expiresAt: '2026-11-06T00:00:00Z' }, error: null });
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', durationDays: 30 }));
    expect(res.status).toBe(200);
    expect(m.auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_SUBSCRIPTION_CHANGE', outcome: 'allow' }));
    // notifications + admin_actions both go through from()
    expect(m.fromInsert).toHaveBeenCalled();
    expect(m.sendPlanChangeEmail).toHaveBeenCalledWith('u1@x.co', expect.objectContaining({ planName: 'Premium', mode: 'applied' }));
  });

  it('a failed RPC creates NO success notification and surfaces a safe error', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'INVALID_DURATION' } });
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', durationDays: 30 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INVALID_DURATION' });
    expect(m.fromInsert).not.toHaveBeenCalled();
    expect(m.sendPlanChangeEmail).not.toHaveBeenCalled();
    expect(m.auditEvent).not.toHaveBeenCalled();
  });

  it('FREE cancellation drops the duration requirement', async () => {
    m.rpc.mockResolvedValue({ data: { mode: 'applied', oldPlan: 'PREMIUM', newPlan: 'FREE', status: 'CANCELLED' }, error: null });
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'FREE' }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.result.newPlan).toBe('FREE');
  });

  it('invalid body shapes are rejected by zod', async () => {
    const res = await changePlan(req({ userId: '11111111-1111-1111-1111-111111111111', plan: 'ENTERPRISE', durationDays: 30 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INVALID_BODY' });
  });
});

describe('createCheckoutQuote', () => {
  it('computes and persists a coupon quote with the server price', async () => {
    m.couponSelect.mockResolvedValue({
      data: {
        id: 'c1', code: 'JOBIEST50', discount_type: 'PERCENTAGE', discount_value: 50,
        currency: 'NGN', applicable_plans: ['PREMIUM'], min_purchase_amount: null,
        max_discount_amount: null, usage_limit: 100, usage_count: 0, per_user_limit: 1,
        starts_at: '2026-01-01T00:00:00Z', expires_at: null, is_active: true,
      },
      error: null,
    });
    m.redemptionCount.mockResolvedValue({ count: 0, error: null });
    m.quoteInsert.mockResolvedValue({ error: null });

    const q = await createCheckoutQuote({ reference: 'pstk_u1_1', userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', currency: 'NGN', originalAmount: 10000, couponCode: 'jobiest50' });
    expect(q.finalAmount).toBe(5000);
    expect(q.discountAmount).toBe(5000);
    expect(q.couponCode).toBe('JOBIEST50');
    expect(m.quoteInsert).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'pstk_u1_1', final_amount: 5000, discount_amount: 5000, coupon_code: 'JOBIEST50', status: 'QUOTED',
    }));
  });

  it('a rejected coupon throws CouponApplyError with the user-facing message', async () => {
    m.couponSelect.mockResolvedValue({
      data: {
        id: 'c1', code: 'OLD', discount_type: 'PERCENTAGE', discount_value: 10,
        currency: 'NGN', applicable_plans: ['PREMIUM'], min_purchase_amount: null,
        max_discount_amount: null, usage_limit: 10, usage_count: 10, per_user_limit: 1,
        starts_at: '2026-01-01T00:00:00Z', expires_at: null, is_active: true,
      },
      error: null,
    });
    await expect(
      createCheckoutQuote({ reference: 'pstk_u1_2', userId: '11111111-1111-1111-1111-111111111111', plan: 'PREMIUM', currency: 'NGN', originalAmount: 10000, couponCode: 'OLD' }),
    ).rejects.toMatchObject({ name: 'CouponApplyError', reason: 'USAGE_LIMIT', message: 'This coupon is no longer available.' });
  });

  it('coupon-less checkouts still get a quote (full price)', async () => {
    m.quoteInsert.mockResolvedValue({ error: null });
    const q = await createCheckoutQuote({ reference: 'pstk_u1_3', userId: '11111111-1111-1111-1111-111111111111', plan: 'MAX', currency: 'NGN', originalAmount: 20000 });
    expect(q.finalAmount).toBe(20000);
    expect(q.discountAmount).toBe(0);
    expect(q.couponCode).toBeNull();
  });
});

describe('applyQuotedPayment wrapper', () => {
  it('returns the granted plan from the RPC', async () => {
    m.rpc.mockResolvedValue({ data: 'PREMIUM', error: null });
    const plan = await applyQuotedPayment({ reference: 'pstk_u1_1', provider: 'paystack', verifiedAmountMajor: 5000, verifiedCurrency: 'NGN', verifiedEmail: 'u1@x.co' });
    expect(plan).toBe('PREMIUM');
    expect(m.rpc).toHaveBeenCalledWith('apply_quoted_payment', expect.objectContaining({ p_reference: 'pstk_u1_1', p_verified_amount: 5000 }));
  });

  it('returns null (legacy fallback) when no quote exists', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    const plan = await applyQuotedPayment({ reference: 'legacy', provider: 'paystack', verifiedAmountMajor: 10000, verifiedCurrency: 'NGN', verifiedEmail: 'u1@x.co' });
    expect(plan).toBeNull();
  });

  it('returns null when the RPC does not exist yet (migration pending)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.apply_quoted_payment' } });
    const plan = await applyQuotedPayment({ reference: 'x', provider: 'paystack', verifiedAmountMajor: 1, verifiedCurrency: 'NGN', verifiedEmail: 'u1@x.co' });
    expect(plan).toBeNull();
  });

  it('throws on real quote errors (amount mismatch etc.)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'QUOTE_AMOUNT_MISMATCH' } });
    await expect(
      applyQuotedPayment({ reference: 'x', provider: 'paystack', verifiedAmountMajor: 1, verifiedCurrency: 'NGN', verifiedEmail: 'u1@x.co' }),
    ).rejects.toThrow('QUOTE_AMOUNT_MISMATCH');
  });
});

describe('CouponApplyError shape', () => {
  it('carries a machine reason and a human message', () => {
    const e = new CouponApplyError('EXPIRED', 'This coupon has expired.');
    expect(e.reason).toBe('EXPIRED');
    expect(e.message).toBe('This coupon has expired.');
    expect(e).toBeInstanceOf(Error);
  });
});
