import { NextResponse } from 'next/server';
import type { GenerateLinkParams } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { sendVerificationEmail } from '@/lib/email/resend';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';

/**
 * POST /api/auth/resend-verification · send a fresh signup-confirmation email.
 *
 * Used by the login page when Supabase reports "email not confirmed". Never
 * reveals whether an account exists: every path returns the same `{ ok: true }`.
 * Rate-limited per IP to prevent it being used as an email-bomb / enumeration
 * tool. Mandatory verification means the account stays locked until confirmed.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`auth:resend-verify:${requestIp(req)}`, 3, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const email = (body.email ?? '').trim().toLowerCase();
  // Malformed input: same neutral response, no admin call.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com';

  let sent = false;
  // GoTrue's admin generateLink accepts type 'signup' WITHOUT a password for an
  // existing unconfirmed user (re-issues the confirmation link) and returns 400
  // with no side effects for unknown emails — verified empirically against the
  // live project. The supabase-js TS type requires `password`, which would
  // CREATE a user for an unknown email, so we deliberately omit it here.
  const params = {
    type: 'signup',
    email,
    options: { redirectTo: `${appUrl}/login` },
  } as unknown as GenerateLinkParams;
  const { data, error } = await supabaseAdmin.auth.admin.generateLink(params);
  if (!error && data?.properties?.action_link) {
    sent = true;
    sendVerificationEmail(email, data.properties.action_link).catch(() => {});
  }

  // Audit without PII: no email address is stored in meta.
  void auditEvent({ action: 'EMAIL_VERIFICATION_RESENT', resource: 'auth', meta: { sent } });

  return NextResponse.json({ ok: true });
}
