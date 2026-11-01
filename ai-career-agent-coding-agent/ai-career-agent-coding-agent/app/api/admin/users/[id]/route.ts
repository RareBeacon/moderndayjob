import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuditEvent } from '@/lib/audit';
import { verifyRevealToken } from '@/lib/security/reveal';
import { maskEmailsInStructure } from '@/lib/security/safe-url';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * GET /api/admin/users/[id] - support investigation view (B-063).
 * Admin-gated. Returns account, plan, quota, recent generation usage,
 * applications, audit and security history for one user - WITHOUT PII by
 * default. The email is included only when a valid, unexpired reveal token
 * for THIS admin is presented (`x-admin-reveal-token` header or `?reveal=`),
 * and every such read is audit-logged fail-closed: if the audit write fails,
 * `503 AUDIT_UNAVAILABLE` is returned and the email is never disclosed.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`admin:users:id:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const { id } = await params;
    if (!z.guid().safeParse(id).success) {
      return Response.json({ error: 'INVALID_USER_ID' }, { status: 400 });
    }

    const headerToken = req.headers.get('x-admin-reveal-token') ?? '';
    const queryToken = new URL(req.url).searchParams.get('reveal') ?? '';
    const revealToken = headerToken || queryToken;
    const revealValid = revealToken ? verifyRevealToken(revealToken, admin.id) : false;

    const [profile, subscription, lifetime, usage, apps, audit, security] = await Promise.all([
      supabaseAdmin.from('profiles').select('user_id,email,full_name,account_status,created_at').eq('user_id', id).maybeSingle(),
      supabaseAdmin.from('subscriptions').select('plan,status,provider,current_period_end,created_at').eq('user_id', id).maybeSingle(),
      supabaseAdmin.from('usage_lifetime').select('docs_used,tools_used').eq('user_id', id).maybeSingle(),
      supabaseAdmin.from('ai_usage').select('created_at,feature,provider,status,latency_ms').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('applications').select('id,status,created_at,submitted_at,jobs(company,title)').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('audit_logs').select('action,resource,resource_id,outcome,created_at,meta').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('security_events').select('event_type,severity,created_at,metadata').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
    ]);

    if (!profile.data) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

    // PII gate (B-063): email only with a valid reveal token + fail-closed audit.
    let email: string | null = null;
    if (revealValid && profile.data.email) {
      try {
        await requireAuditEvent({
          action: 'ADMIN_USER_PII_READ',
          resource: 'user',
          resourceId: id,
          userId: admin.id,
          outcome: 'allow',
          meta: { target: id },
        });
        email = profile.data.email;
      } catch {
        return Response.json({ error: 'AUDIT_UNAVAILABLE' }, { status: 503 });
      }
    }

    const emailDomain = String(profile.data.email ?? '').split('@')[1] ?? null;

    return Response.json({
      user: {
        id,
        email, // null unless reveal was valid + audited
        emailDomain,
        email_domain: emailDomain,
        fullName: profile.data.full_name,
        accountStatus: profile.data.account_status,
        createdAt: profile.data.created_at,
      },
      subscription: subscription.data ?? null,
      usageLifetime: lifetime.data ?? null,
      recentUsage: usage.data ?? [],
      applications: apps.data ?? [],
      recentAudit: revealValid ? (audit.data ?? []) : maskEmailsInStructure(audit.data ?? []),
      recentSecurity: revealValid ? (security.data ?? []) : maskEmailsInStructure(security.data ?? []),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
