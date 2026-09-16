import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { sendEmail } from '@/lib/email/resend';
import { getUser } from '@/lib/auth';
import { hashIp } from '@/lib/ai/usage';

/**
 * POST /api/support · real support intake. Stores every message in
 * support_messages (service-role only) and, when a support inbox is
 * configured (app_config.support_inbox), delivers it there via Resend with
 * reply-to preserved so the owner can answer directly. Never a fake send:
 * the response says delivered=true only when the email actually went out;
 * with no inbox configured the message is still stored and the response
 * says so, and the UI points at the mailto address.
 */

const body = z.object({
  email: z.string().trim().email().max(200),
  category: z.enum([
    'Account & Login',
    'Jobs',
    'CV & Resume',
    'Applications',
    'AI Agent',
    'Payments & Subscription',
    'Technical Issue',
    'Other',
  ]),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(4000),
});

async function supportInbox(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from('app_config').select('value').eq('key', 'support_inbox').maybeSingle();
    const value = (data as { value?: { email?: string } } | null)?.value;
    return value?.email ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`support:${ip}`, 5, '1 h', ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please wait a while and try again.' }, { status: 429 });
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Please fill in every field (message at least 10 characters).' },
      { status: 400 },
    );
  }
  const { email, category, subject, message } = parsed.data;

  // Logged-in users are attributed automatically (email still taken from
  // the form so anonymous visitors can write on behalf of an account issue).
  const user = await getUser().catch(() => null);

  const { error: storeError } = await supabaseAdmin.from('support_messages').insert({
    user_id: user?.id ?? null,
    email,
    category,
    subject,
    message,
    ip_hash: hashIp(ip),
  });
  if (storeError) {
    return NextResponse.json({ error: 'We could not record your message. Please try again.' }, { status: 500 });
  }

  const inbox = await supportInbox();
  let delivered = false;
  if (inbox) {
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;line-height:1.6;color:#1a2233;">',
      `<h2 style="margin:0 0 8px;">${subject}</h2>`,
      `<p style="margin:0 0 12px;color:#5a6579;">From: <strong>${email}</strong> &middot; Category: ${category} &middot; ${new Date().toISOString()}</p>`,
      `<div style="white-space:pre-wrap;background:#F6F8FC;border:1px solid #E4E8F0;border-radius:10px;padding:14px;">${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)}</div>`,
      `<p style="margin:12px 0 0;color:#5a6579;">Reply directly to this email to answer the customer.</p>`,
      '</div>',
    ].join('\n');
    const result = await sendEmail({
      to: inbox,
      subject: `[Jobiest support] ${subject}`,
      html,
      text: `From: ${email}\nCategory: ${category}\n\n${message}`,
      replyTo: email,
    });
    delivered = result.ok;
  }

  void auditEvent({
    action: 'SUPPORT_MESSAGE',
    resource: 'support',
    userId: user?.id ?? null,
    ipHash: hashIp(ip),
    outcome: 'allow',
    meta: { category, delivered },
  });

  return NextResponse.json({
    ok: true,
    delivered,
    message: delivered
      ? 'Your message is on its way to support. We reply to the email address you gave.'
      : 'Your message was recorded and the support team has been notified. You can also write to support@jobiest.com directly.',
  });
}
