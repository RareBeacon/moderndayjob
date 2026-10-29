import { sendEmail as sendViaResend } from '@/lib/email/resend';
import { sendViaSmtp, isSmtpConfigured } from '@/lib/email/smtp';
type SendArgs = { to: string; subject: string; html: string; text?: string; from?: string; replyTo?: string };
export async function sendEmailUnified(input: SendArgs): Promise<{ ok: boolean; id?: string; error?: string; via: 'smtp'|'resend' }> {
  const strategy = (process.env.TRANSACTIONAL_STRATEGY ?? 'auto').toLowerCase();
  if (strategy === 'resend') {
    const r = await sendViaResend(input);
    return { ...r, via: 'resend' as const };
  }
  if (strategy === 'selfhost' && isSmtpConfigured()) {
    const s = await sendViaSmtp(input);
    if (s.ok) return { ...s, via: 'smtp' as const };
    if (process.env.SMTP_FALLBACK !== 'resend') return { ...s, via: 'smtp' as const };
  }
  if (isSmtpConfigured()) {
    const s = await sendViaSmtp(input);
    if (s.ok) return { ...s, via: 'smtp' as const };
    console.warn('[email] smtp failed, falling back to resend', s.error?.slice(0,200));
  }
  const r = await sendViaResend(input);
  return { ...r, via: 'resend' as const };
}
