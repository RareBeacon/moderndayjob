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

/** Best-effort password-reset email. Never throws. No em/en dashes. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<SendEmailResult> {
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e;line-height:1.6">',
    '<h2 style="margin:0 0 12px">Reset your Jobiest password</h2>',
    '<p style="margin:0 0 16px">We received a request to reset the password for your Jobiest account.</p>',
    `<p style="margin:0 0 16px"><a href="${escapeHtml(resetUrl)}" style="background:#2b6cb0;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>`,
    '<p style="margin:0 0 8px">This link expires shortly. If you did not request a reset, you can safely ignore this email.</p>',
    `<p style="margin:0;color:#64748b">Or paste this link in your browser: ${escapeHtml(resetUrl)}</p>`,
    '</div>',
  ].join('\n');
  const text = `Reset your Jobiest password: ${resetUrl} (this link expires shortly; ignore this email if you did not request it).`;
  return sendEmail({ to, subject: 'Reset your Jobiest password', html, text });
}

/** Best-effort email-verification email. Never throws. No em/en dashes. */
export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<SendEmailResult> {
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a2e;line-height:1.6">',
    '<h2 style="margin:0 0 12px">Verify your Jobiest email</h2>',
    '<p style="margin:0 0 16px">Please confirm your email address to finish setting up your Jobiest account.</p>',
    `<p style="margin:0 0 16px"><a href="${escapeHtml(verifyUrl)}" style="background:#2b6cb0;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify email</a></p>`,
    '<p style="margin:0;color:#64748b">This link expires shortly. If you did not create a Jobiest account, you can safely ignore this email.</p>',
    '</div>',
  ].join('\n');
  const text = `Verify your Jobiest email address: ${verifyUrl} (expires shortly; ignore if you did not sign up).`;
  return sendEmail({ to, subject: 'Verify your Jobiest email', html, text });
}
