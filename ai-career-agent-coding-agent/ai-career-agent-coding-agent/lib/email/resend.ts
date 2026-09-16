import { env } from '@/lib/env';
import { SITE_URL } from '@/lib/site';
import {
  BRAND,
  composeEmail,
  emailAlert,
  emailButton,
  emailButtonLinkHint,
  emailCodeDisplay,
  emailHeading,
  emailHero,
  emailInfoCard,
  emailParagraph,
  escapeHtmlEmail,
} from './templates';

/** Transactional email client over the Resend REST API (server-side only).
 *  All senders are the branded Jobiest addresses on the verified domain.
 *  no-reply@ sends automated messages; support@ is the human destination
 *  referenced in every footer. */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// Automated transactional sender on the verified production domain
// (jobiest.com: DNS DKIM record present, domain verified in Resend).
// RESEND_FROM remains available as an explicit override for special cases.
const NO_REPLY = process.env.RESEND_FROM?.trim() || 'Jobiest <no-reply@jobiest.com>';

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
        from: input.from ?? NO_REPLY,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
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

/** Google sign-up verification code (branded, digit cards). Never throws. */
export async function sendEmailVerificationCode(to: string, code: string, firstName?: string): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const html = composeEmail(
    [
      emailHero('Verify your email'),
      emailHeading('Confirm your email address'),
      emailParagraph(`Hi ${escapeHtmlEmail(name)}, you signed in to Jobiest with Google. Enter this code to finish setting up your account:`),
      emailCodeDisplay(code),
      emailParagraph('The code expires in 10 minutes and can be used once.', { muted: true }),
      emailAlert('If you did not expect this email, you can safely ignore it.'),
    ],
    'Your Jobiest verification code',
  );
  const text = `Your Jobiest verification code is ${code}. It expires in 10 minutes. If you did not expect this, ignore this email. Need help? support@jobiest.com`;
  return sendEmail({ to, subject: 'Your Jobiest verification code', html, text });
}

/** Welcome email (sent once, after the account is verified per product policy).
 *  Sent from Philip's address on the verified domain (owner-confirmed:
 *  philip@jobiest.com, forwarding to the owner's Gmail) for a personal touch;
 *  replies land in the owner's inbox once MX/forwarding is configured. */
export async function sendWelcomeEmail(to: string, firstName?: string): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const checklist = [
    'Discover relevant jobs',
    'Build your professional CV',
    'Track every application in one place',
    'Use AI to assist your job search',
    'Secure your account with two-factor authentication',
  ]
    .map((item) => `<div style="padding:4px 0;font-size:14px;color:#333D52;">&#10003;&nbsp; ${item}</div>`)
    .join('');
  const html = composeEmail(
    [
      emailHero('Welcome'),
      emailHeading(`Welcome to Jobiest, ${escapeHtmlEmail(name)}`),
      emailParagraph('Your next opportunity is here. Your Jobiest account is ready, and a few small steps will get you the most from it:'),
      emailParagraph(checklist),
      emailButton('Start setting up my account', `${SITE_URL}/help/getting-started`),
      emailInfoCard('New to Jobiest?', [
        `Follow the step-by-step guide: <a href="${SITE_URL}/help/getting-started" style="color:#2B5BD7;">Getting started with Jobiest</a>.`,
        'Your career profile powers everything: jobs, matching, CV and applications.',
        'Nothing is ever sent to an employer without your approval.',
      ]),
    ],
    'Welcome to Jobiest - your next opportunity is here',
  );
  const text = `Welcome to Jobiest, ${name}. Your account is ready. Start with the guide: ${SITE_URL}/help/getting-started. Discover jobs, build your CV, track applications. Need help? support@jobiest.com`;
  return sendEmail({
    to,
    subject: 'Welcome to Jobiest',
    html,
    text,
    from: 'Philip (Jobiest) <philip@jobiest.com>',
  });
}

/** Password reset (branded; the token link semantics are unchanged). */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<SendEmailResult> {
  const html = composeEmail(
    [
      emailHero('Password reset'),
      emailHeading('Reset your Jobiest password'),
      emailParagraph('We received a request to reset the password for your Jobiest account.'),
      emailButton('Reset password', resetUrl),
      emailButtonLinkHint(resetUrl),
      emailAlert('This link expires shortly. If you did not request a reset, ignore this email; your password stays unchanged.'),
    ],
    'Reset your Jobiest password',
  );
  const text = `Reset your Jobiest password: ${resetUrl} (expires shortly; ignore if you did not request it).`;
  return sendEmail({ to, subject: 'Reset your Jobiest password', html, text });
}

/** Security notification for MFA enable/disable (real events only). */
export async function sendMfaSecurityEmail(
  to: string,
  event: 'enabled' | 'disabled',
  firstName?: string,
): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const enabled = event === 'enabled';
  const html = composeEmail(
    [
      emailHero('Security'),
      emailHeading(enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled'),
      emailParagraph(`Hi ${escapeHtmlEmail(name)},`),
      emailParagraph(
        enabled
          ? 'Two-factor authentication is now active on your Jobiest account. You will be asked for a code from your authenticator app when you sign in.'
          : 'Two-factor authentication was turned off on your Jobiest account. Sign-in now needs only your email and password.',
      ),
      enabled
        ? emailInfoCard('Keep your codes safe', [
            'Keep your authenticator app on your phone.',
            'Losing the device means losing access; store a backup of your setup key somewhere safe.',
          ])
        : emailAlert(`If you did not make this change, <a href="mailto:support@jobiest.com" style="color:#4A3F14;">contact support</a> immediately and change your password.`),
      emailButton('Review security settings', `${SITE_URL}/settings`),
    ],
    enabled ? 'Two-factor authentication enabled on your Jobiest account' : 'Two-factor authentication disabled on your Jobiest account',
  );
  const text = enabled
    ? `Two-factor authentication is now enabled on your Jobiest account. You will be asked for an authenticator code at sign-in. Need help? support@jobiest.com`
    : `Two-factor authentication was turned off on your Jobiest account. If this was not you, contact support@jobiest.com immediately.`;
  return sendEmail({ to, subject: enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled', html, text });
}
