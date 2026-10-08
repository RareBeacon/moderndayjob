import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { isCouponsNotMigrated } from '@/lib/billing/coupons';

/**
 * GET   /api/admin/coupons/[id]: coupon detail + redemptions + totals (Part 19).
 * PATCH /api/admin/coupons/[id]: SAFE edits only: activate/deactivate,
 *        description, expiry, usage limit, per-user limit. The code, discount
 *        type/value, currency and applicable plans are immutable after
 *        creation (redemptions already reference the original terms).
 *
 * Deactivation requires the Part 26 confirmation on the client; the audit log
 * records every change either way.
 */

const patchBody = z.object({
  isActive: z.boolean().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().min(1).max(1000).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await params;

    const { data: coupon, error } = await supabaseAdmin.from('coupons').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isCouponsNotMigrated(error)) return Response.json({ error: 'COUPONS_NOT_CONFIGURED' }, { status: 503 });
      throw error;
    }
    if (!coupon) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

    const { data: redemptions, error: rError } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id,user_id,plan,currency,original_amount,discount_amount,final_amount,redeemed_at')
      .eq('coupon_id', id)
      .order('redeemed_at', { ascending: false })
      .limit(100);
    if (rError && !isCouponsNotMigrated(rError)) throw rError;

    const rows = (redemptions ?? []) as Array<{ discount_amount: string | number; final_amount: string | number }>;
    const totalDiscount = rows.reduce((sum, r) => sum + Number(r.discount_amount ?? 0), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.final_amount ?? 0), 0);

    return Response.json({
      coupon,
      redemptions: redemptions ?? [],
      analytics: {
        totalRedemptions: rows.length,
        totalDiscountGiven: Math.round(totalDiscount * 100) / 100,
        totalRevenueGenerated: Math.round(totalRevenue * 100) / 100,
      },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`admin:coupons:patch:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser();
    const { id } = await params;
    const parsed = patchBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }
    const b = parsed.data;
    if (Object.keys(b).length === 0) return Response.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.isActive !== undefined) update.is_active = b.isActive;
    if (b.description !== undefined) update.description = b.description;
    if (b.expiresAt !== undefined) update.expires_at = b.expiresAt;
    if (b.usageLimit !== undefined) update.usage_limit = b.usageLimit;
    if (b.perUserLimit !== undefined) update.per_user_limit = b.perUserLimit;

    const { data: updated, error } = await supabaseAdmin
      .from('coupons')
      .update(update)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      if (isCouponsNotMigrated(error)) return Response.json({ error: 'COUPONS_NOT_CONFIGURED' }, { status: 503 });
      throw error;
    }
    if (!updated) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

    void auditEvent({
      action: b.isActive === false ? 'ADMIN_COUPON_DEACTIVATED' : 'ADMIN_COUPON_UPDATED',
      resource: 'coupons',
      resourceId: id,
      userId: admin.id,
      outcome: 'allow',
      meta: { changes: b },
    });

    return Response.json({ coupon: updated });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
