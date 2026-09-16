import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuditEvent } from '@/lib/audit';
import { verifyRevealToken } from '@/lib/security/reveal';

/**
 * GET /api/admin/users/[id] - support investigation view (B-063).
 * Admin-gated. Returns account, plan, quota, recent generation usage,
 * applications, audit and security history for one user - WITHOUT PII by
 * default. The email is included only when a valid, unexpired reveal token
 * for THIS admin is presented, and every such read is audit-logged
 * fail-closed: if the audit write fails, the email is not returned.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser();
    const { id } = await params;
    const revealToken = new URL(req.url).searchParams.get('reveal') ?? '';
    const revealValid = revealToken ? verifyRevealToken(revealToken, admin.id) : false;

    const [profile, subscription, lifetime, usage, apps, audit, security] = await Promise.all([
      supabaseAdmin.from('profiles').select('user_id,email,full_name,account_status,created_at').eq('user_id', id).maybeSingle(),
      supabaseAdmin.from('subscriptions').select('plan,status,created_at').eq('user_id', id).maybeSingle(),
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
      await requireAuditEvent({
        action: 'ADMIN_USER_PII_READ',
        resource: 'user',
        resourceId: id,
        userId: admin.id,
        outcome: 'allow',
        meta: { target: id },
      });
      email = profile.data.email;
    }

    return Response.json({
      user: {
        id,
        email, // null unless reveal was valid + audited
        emailDomain: String(profile.data.email ?? '').split('@')[1] ?? null,
        fullName: profile.data.full_name,
        accountStatus: profile.data.account_status,
        createdAt: profile.data.created_at,
      },
      subscription: subscription.data ?? null,
      usageLifetime: lifetime.data ?? null,
      recentUsage: usage.data ?? [],
      applications: apps.data ?? [],
      recentAudit: audit.data ?? [],
      recentSecurity: security.data ?? [],
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
