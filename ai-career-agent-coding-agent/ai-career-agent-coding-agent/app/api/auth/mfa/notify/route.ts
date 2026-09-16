import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { sendMfaSecurityEmail } from '@/lib/email/resend';
import { z } from 'zod';

/**
 * POST /api/auth/mfa/notify · branded security email + audit when MFA is
 * enabled or disabled. The client completes enrollment/unenrollment itself
 * through Supabase (the auth provider is the source of truth); this route
 * only reports the event, and it RE-VERIFIES the factor state server-side
 * via the admin API before sending, so a spoofed request cannot trigger
 * fake security emails. Best-effort: never blocks the client flow.
 */

const body = z.object({ event: z.enum(['enabled', 'disabled']) });

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser({ allowIncompleteMfa: true });
  } catch {
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const rate = await enforceRateLimit(`mfa-notify:${requestIp(req)}:${user.id}`, 10, '1 h');
  if (!rate.allowed) return Response.json({ ok: true, rateLimited: true });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

  // Server-side verification of the actual factor state (admin API).
  let verifiedFactors = 0;
  try {
    const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: user.id });
    verifiedFactors = (data?.factors ?? []).filter((f) => f.status === 'verified').length;
  } catch {
    return Response.json({ ok: true, stateUnknown: true });
  }
  const expected = parsed.data.event === 'enabled' ? 1 : 0;
  if (verifiedFactors < expected) {
    // State does not match the claimed event; do not send a false email.
    return Response.json({ ok: true, skipped: true });
  }

  let fullName: string | null = null;
  try {
    const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle();
    fullName = (data as { full_name: string | null } | null)?.full_name ?? null;
  } catch {
    // name is cosmetic only
  }

  void auditEvent({
    action: parsed.data.event === 'enabled' ? 'MFA_ENABLED' : 'MFA_DISABLED',
    resource: 'auth',
    userId: user.id,
    outcome: 'allow',
  });

  if (user.email) {
    void sendMfaSecurityEmail(user.email, parsed.data.event, fullName ?? undefined).catch(() => {});
  }
  return Response.json({ ok: true });
}
