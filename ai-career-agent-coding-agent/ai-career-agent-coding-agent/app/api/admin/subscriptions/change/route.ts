import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { sendPlanChangeEmail } from '@/lib/email/resend';

/**
 * POST /api/admin/subscriptions/change (admin only, spec Part 3-8).
 *
 * Grants/changes a user's subscription server-side:
 *   plan FREE          -> cancel back to free (drops pending scheduled grants)
 *   plan BASIC/PREMIUM/MAX + durationDays + startMode:
 *     IMMEDIATELY     -> applied now (same plan + active = true extension)
 *     AFTER_CURRENT   -> queued to start when the current period ends
 *
 * The DB function admin_change_subscription is the single atomic primitive
 * (subscription row + subscription_history + scheduled queue in one
 * transaction). This route adds the authorization gate (admin_users, checked
 * again inside the RPC), rate limiting, audit logging (audit_logs +
 * admin_actions), and the user notification, which is only created AFTER the
 * database operation succeeds.
 */

const body = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['FREE', 'BASIC', 'PREMIUM', 'MAX']),
  durationDays: z.number().int().min(1).max(3650).optional(),
  startMode: z.enum(['IMMEDIATELY', 'AFTER_CURRENT']).default('IMMEDIATELY'),
  reason: z.string().trim().max(300).optional(),
});

function formatDate(d: unknown): string {
  if (!d) return '';
  return new Date(String(d)).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:subs:change:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser();
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }
    const { userId, plan, durationDays, startMode, reason } = parsed.data;

    if (plan !== 'FREE' && !durationDays) {
      return Response.json({ error: 'DURATION_REQUIRED', message: 'A duration in days is required for paid plans.' }, { status: 400 });
    }

    // Reject unknown targets up front (the RPC would also fail).
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('user_id,email,full_name,account_status')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return Response.json({ error: 'USER_NOT_FOUND' }, { status: 404 });

    const { data: result, error } = await supabaseAdmin.rpc('admin_change_subscription', {
      p_admin_id: admin.id,
      p_target_user_id: userId,
      p_new_plan: plan,
      p_duration_days: durationDays ?? null,
      p_start_mode: startMode,
      p_reason: reason ?? null,
    });
    if (error) {
      const message = String(error.message ?? '');
      if (message.includes('FORBIDDEN')) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
      if (message.includes('INVALID_DURATION')) {
        return Response.json({ error: 'INVALID_DURATION', message: 'Duration must be 1 to 3650 days.' }, { status: 400 });
      }
      throw error;
    }

    // ── Everything below runs only after the DB transaction succeeded. ──

    const r = (result ?? {}) as { mode?: string; oldPlan?: string; newPlan?: string; expiresAt?: string; activateAt?: string; status?: string };

    void auditEvent({
      action: 'ADMIN_SUBSCRIPTION_CHANGE',
      resource: 'subscriptions',
      resourceId: userId,
      userId: admin.id,
      outcome: 'allow',
      meta: {
        targetUserId: userId,
        oldPlan: r.oldPlan ?? null,
        newPlan: r.newPlan ?? plan,
        mode: r.mode ?? startMode,
        durationDays: durationDays ?? null,
        reason: reason ?? null,
        expiresAt: r.expiresAt ?? null,
        activateAt: r.activateAt ?? null,
      },
    });

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: userId,
      action: `SUBSCRIPTION_${plan}_${r.mode === 'scheduled' ? 'SCHEDULED' : 'APPLIED'}`,
    });

    // In-app notification (created only on success; Part 9).
    const planName = plan === 'FREE' ? 'Free' : plan.charAt(0) + plan.slice(1).toLowerCase();
    let title: string;
    let bodyText: string;
    if (plan === 'FREE') {
      title = 'Your Jobiest plan has changed';
      bodyText = 'Your account is now on the Free plan. Your documents and applications stay exactly as they are.';
    } else if (r.mode === 'scheduled') {
      title = `Your ${planName} upgrade is queued`;
      bodyText = `Your Jobiest account will upgrade to ${planName} when your current plan ends${r.activateAt ? ` (from ${formatDate(r.activateAt)})` : ''}. Nothing else you need to do.`;
    } else {
      title = `You are now on ${planName}`;
      bodyText = `Your Jobiest account has been upgraded to ${planName}${r.expiresAt ? `. Your ${planName} access is active until ${formatDate(r.expiresAt)}` : ''}.`;
    }
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({ user_id: userId, title, body: bodyText, deep_link: '/billing', type: plan === 'FREE' ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_UPGRADED' });
    } catch {
      // Part 9: the notification is best-effort and never fails the change.
    }

    // Best-effort email (Part 9: optional; never fails the operation).
    const email = (profile as { email?: string }).email;
    if (email) {
      void sendPlanChangeEmail(email, {
        firstName: (profile as { full_name?: string }).full_name?.split(' ')[0],
        planName,
        mode: plan === 'FREE' ? 'cancelled' : (r.mode === 'scheduled' ? 'scheduled' : 'applied'),
        until: r.expiresAt ? formatDate(r.expiresAt) : r.activateAt ? formatDate(r.activateAt) : null,
      }).catch(() => undefined);
    }

    return Response.json({ ok: true, result: r });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
