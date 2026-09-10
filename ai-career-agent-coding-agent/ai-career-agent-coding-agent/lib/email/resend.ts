import { env } from '@/lib/env';

/** Minimal transactional email client over the Resend REST API. */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY_NOT_CONFIGURED' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok ? { ok: true, id: json.id } : { ok: false, error: json.message ?? `RESEND_${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'RESEND_ERROR' };
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com';

/** Best-effort welcome email. Never throws; callers ignore failures. */
export async function sendWelcomeEmail(to: string, firstName?: string): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e;line-height:1.6">',
    '<h2 style="margin:0 0 12px">Welcome to Jobiest</h2>',
    `<p style="margin:0 0 16px">Hi ${escapeHtml(name)}, your Jobiest account is ready.</p>`,
    '<p style="margin:0 0 16px">Three quick first steps:</p>',
    '<ol style="margin:0 0 16px;padding-left:20px">',
    '<li>Complete your profile so the AI can personalize your career tools.</li>',
    '<li>Build or import a resume and run the free ATS scanner.</li>',
    '<li>Match your profile against live job listings.</li>',
    '</ol>',
    `<p style="margin:0"><a href="${APP_URL}/dashboard" style="color:#2b6cb0">Open your dashboard</a></p>`,
    '</div>',
  ].join('\n');
  const text = `Welcome to Jobiest, ${name}. Your account is ready. Complete your profile, build a resume and run the free ATS scanner, then match your profile against live jobs. Dashboard: ${APP_URL}/dashboard`;
  return sendEmail({ to, subject: `Welcome to Jobiest, ${name}`, html, text });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
