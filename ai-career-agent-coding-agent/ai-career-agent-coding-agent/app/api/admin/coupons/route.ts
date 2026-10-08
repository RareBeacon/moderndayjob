import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { isCouponsNotMigrated, normalizeCouponCode } from '@/lib/billing/coupons';

/**
 * GET  /api/admin/coupons: list coupons with usage (newest first).
 * POST /api/admin/coupons: create a coupon (admin only, spec Part 13).
 *
 * Codes are normalized to uppercase; duplicate codes are rejected by the
 * unique constraint. All discount math is validated server-side here and
 * re-enforced by DB check constraints.
 */

const createBody = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Letters, numbers, dashes and underscores only'),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.number().positive(),
  currency: z.enum(['NGN', 'USD']).default('NGN'),
  applicablePlans: z.array(z.enum(['BASIC', 'PREMIUM', 'MAX'])).min(1),
  minimumPurchase: z.number().positive().optional(),
  maximumDiscount: z.number().positive().optional(),
  usageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().min(1).max(1000).default(1),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdminUser();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      if (isCouponsNotMigrated(error)) {
        return Response.json({ error: 'COUPONS_NOT_CONFIGURED', message: 'Run migration 043 to activate coupons.' }, { status: 503 });
      }
      throw error;
    }
    return Response.json({ coupons: data ?? [] });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:coupons:create:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser();
    const parsed = createBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }
    const b = parsed.data;
    const code = normalizeCouponCode(b.code);

    if (b.discountType === 'PERCENTAGE' && b.discountValue > 100) {
      return Response.json({ error: 'INVALID_DISCOUNT', message: 'A percentage discount cannot exceed 100.' }, { status: 400 });
    }
    if (b.startsAt && b.expiresAt && new Date(b.expiresAt) <= new Date(b.startsAt)) {
      return Response.json({ error: 'INVALID_WINDOW', message: 'Expiration must be after the start date.' }, { status: 400 });
    }

    const { data: created, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code,
        description: b.description ?? null,
        discount_type: b.discountType,
        discount_value: b.discountValue,
        currency: b.currency,
        applicable_plans: b.applicablePlans,
        min_purchase_amount: b.minimumPurchase ?? null,
        max_discount_amount: b.maximumDiscount ?? null,
        usage_limit: b.usageLimit ?? null,
        per_user_limit: b.perUserLimit,
        starts_at: b.startsAt ?? new Date().toISOString(),
        expires_at: b.expiresAt ?? null,
        is_active: true,
        created_by: admin.id,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'DUPLICATE_CODE', message: `Coupon code ${code} already exists.` }, { status: 409 });
      }
      if (isCouponsNotMigrated(error)) {
        return Response.json({ error: 'COUPONS_NOT_CONFIGURED', message: 'Run migration 043 to activate coupons.' }, { status: 503 });
      }
      throw error;
    }

    void auditEvent({
      action: 'ADMIN_COUPON_CREATED',
      resource: 'coupons',
      resourceId: (created as { id?: string }).id,
      userId: admin.id,
      outcome: 'allow',
      meta: { code, discountType: b.discountType, discountValue: b.discountValue, applicablePlans: b.applicablePlans, usageLimit: b.usageLimit ?? null },
    });

    return Response.json({ coupon: created }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
