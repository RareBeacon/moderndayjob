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
  const text = `Your Jobiest verification code is ${code}. It expires in 10 minutes. If you did not expect this, ignore this email. If you have any issues or enquiry, you can reach out to us at support@jobiest.com`;
  return sendEmail({ to, subject: 'Your Jobiest verification code', html, text });
}

/** Signup email verification (branded: 6-digit code cards + one-click link). */
export async function sendSignupVerificationEmail(
  to: string,
  code: string,
  verifyUrl: string,
  firstName?: string,
): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const html = composeEmail(
    [
      emailHero('Verify your email'),
      emailHeading('Confirm your email address'),
      emailParagraph(`Hi ${escapeHtmlEmail(name)}, welcome to Jobiest. Enter this code to verify your email address and activate your account:`),
      emailCodeDisplay(code),
      emailButton('Verify my email', verifyUrl),
      emailButtonLinkHint(verifyUrl),
      emailParagraph('The code expires in 10 minutes and can be used once.', { muted: true }),
      emailAlert('If you did not create a Jobiest account, you can safely ignore this email.'),
    ],
    'Verify your email to activate your Jobiest account',
  );
  const text = `Welcome to Jobiest. Verify your email address with this code: ${code} (expires in 10 minutes). Or open: ${verifyUrl} If you did not create an account, ignore this email. If you have any issues or enquiry, you can reach out to us at support@jobiest.com`;
  return sendEmail({ to, subject: 'Verify your email - Jobiest', html, text });
}

/** Welcome email (sent once, after the account is verified per product policy).
 *  Sent from Philip's address on the verified domain (owner-confirmed:
 *  philip@jobiest.com, forwarding to the owner's Gmail) for a personal touch;
 *  replies land in the owner's inbox once MX/forwarding is configured. */
export async function sendWelcomeEmail(to: string, firstName?: string): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const first = name.split(' ')[0];
  const steps = [
    'Complete your career profile - it powers your CV, your documents and your applications.',
    'Bring a job you want as a link or a description, and let your agent prepare the application.',
    'Build your first CV in the Resume Studio.',
  ]
    .map((item) => `<div style="padding:4px 0;font-size:14px;color:#333D52;">&#10003;&nbsp; ${item}</div>`)
    .join('');
  const html = composeEmail(
    [
      emailHero('Welcome'),
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph('This is <strong>Philip Opeyemi</strong>, the cofounder and CEO of Jobiest.'),
      emailParagraph('I want to appreciate you for trusting the platform and creating an account with us. I do not take that lightly. Behind every new account is a person with real ambitions - someone hoping the next opportunity changes something for them and for the people who depend on them. That is exactly the person we built Jobiest for.'),
      emailParagraph('When we started Jobiest, we kept one promise at the centre of it: <strong>your career deserves an agent of its own</strong>. Jobiest works for you - it prepares a truthful, tailored application for the roles you bring, helps you build a CV you are proud of, keeps every application organised in one place, and never sends anything to an employer without your explicit approval.'),
      emailParagraph('You matter here. Not as a number on a dashboard, but as a person we are privileged to serve. Here are three small steps that will make the platform work hardest for you:'),
      emailParagraph(steps),
      emailButton('Start setting up my account', `${SITE_URL}/help/getting-started`),
      emailParagraph('We are still young and we are building fast. If anything is missing, confusing or broken, tell us - you will reach a real human who cares, and more often than not, that human is me.'),
      emailParagraph('Thank you for being here. I am genuinely glad you joined.'),
      emailParagraph('<strong>Thank you.</strong>'),
      emailParagraph(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="padding-top:10px;"><tr><td width="76" style="vertical-align:middle;"><img src="${SITE_URL}/images/philip-opeyemi.jpg" width="72" height="72" alt="Philip Opeyemi" style="width:72px;height:72px;border-radius:50%;display:block;border:2px solid #C9A227;background:#F4F6FA;" /></td><td style="vertical-align:middle;padding-left:12px;font-size:15px;line-height:1.6;color:#1A2233;">Philip Opeyemi<br><span style="font-size:13px;color:#5A6579;">Cofounder &amp; CEO, Jobiest</span></td></tr></table>`,
      ),
    ],
    'A personal welcome from Philip, cofounder and CEO of Jobiest',
  );
  const text = `Hello ${first},\n\nThis is Philip Opeyemi, the cofounder and CEO of Jobiest.\n\nI want to appreciate you for trusting the platform and creating an account with us. I do not take that lightly. Behind every new account is a person with real ambitions, and that is exactly the person we built Jobiest for. Your career deserves an agent of its own: Jobiest prepares a truthful, tailored application for the roles you bring, helps you build a CV you are proud of, keeps every application organised, and never contacts an employer without your approval.\n\nStart with these three steps: complete your career profile, bring a job you want as a link or a description, and build your first CV in the Resume Studio.\n\nIf anything is missing or broken, tell us - you will reach a real human who cares.\n\nThank you for being here.\n\nThank you.\n\nPhilip Opeyemi\nCofounder & CEO, Jobiest\n\nIf you have any issues or enquiry, you can reach out to us at support@jobiest.com`;
  return sendEmail({
    to,
    subject: 'Welcome to Jobiest - a note from our CEO',
    html,
    text,
    from: 'Philip Opeyemi <philip@jobiest.com>',
    replyTo: 'philip@jobiest.com',
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
  const text = `Reset your Jobiest password: ${resetUrl} (expires shortly; ignore if you did not request it). If you have any issues or enquiry, you can reach out to us at support@jobiest.com`;
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
      emailParagraph(`Hello ${escapeHtmlEmail(name)},`),
      emailParagraph(
        enabled
          ? 'This is to confirm that you have successfully setup 2FA security on your account.'
          : 'Two-factor authentication was turned off on your Jobiest account. Sign-in now needs only your email and password.',
      ),
      enabled
        ? emailParagraph('You will be asked for a code from your authenticator app whenever you sign in. <strong>Thank you.</strong>')
        : emailAlert('If you did not make this change, <a href="mailto:support@jobiest.com" style="color:#4A3F14;">contact support</a> immediately and change your password.'),
      enabled
        ? emailInfoCard('Keep your codes safe', [
            'Keep your authenticator app on your phone.',
            'Losing the device means losing access; store a backup of your setup key somewhere safe.',
          ])
        : emailParagraph('You can review your security settings at any time from your Jobiest account.', { muted: true }),
      emailButton('Review security settings', `${SITE_URL}/settings`),
    ],
    enabled ? 'Two-factor authentication enabled on your Jobiest account' : 'Two-factor authentication disabled on your Jobiest account',
  );
  const text = enabled
    ? `Hello ${name},\n\nThis is to confirm that you have successfully setup 2FA security on your account.\n\nThank you.\n\nIf you have any issues or enquiry, you can reach out to us at support@jobiest.com`
    : `Two-factor authentication was turned off on your Jobiest account. If this was not you, contact support@jobiest.com immediately.`;
  return sendEmail({ to, subject: enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled', html, text });
}

/* ==========================================================================
   Agent notifications (discovery + automatic submission), owner request
   2026-09-21: after the agent finishes an application, the user gets an
   email with a link to their pipeline.
   ========================================================================== */

export interface ApplicationSubmittedInput {
  firstName?: string;
  jobTitle: string;
  company: string;
  pipelineUrl: string;
  confirmation?: string | null;
  /** 'auto' = the user delegated the send; 'approval' = they approved it. */
  mode?: 'auto' | 'approval';
}

/** "A job has been submitted on your behalf" + pipeline link. */
export async function sendApplicationSubmittedEmail(to: string, input: ApplicationSubmittedInput): Promise<SendEmailResult> {
  const first = input.firstName?.trim() || 'there';
  const role = `${input.jobTitle} at ${input.company}`;
  const delegated = input.mode === 'auto';
  const html = composeEmail(
    [
      emailHero('Application submitted'),
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph(
        delegated
          ? 'Your agent finished an application on your behalf. It is now submitted:'
          : 'The application you approved has been submitted:',
      ),
      emailInfoCard('Submitted application', [
        `<strong>Role:</strong> ${escapeHtmlEmail(input.jobTitle)}`,
        `<strong>Company:</strong> ${escapeHtmlEmail(input.company)}`,
        ...(input.confirmation ? [`<strong>Confirmation:</strong> ${escapeHtmlEmail(input.confirmation)}`] : []),
      ]),
      emailButton('View it in my pipeline', input.pipelineUrl),
      emailParagraph(
        delegated
          ? 'You can review the tailored documents, the timeline and the result in your pipeline at any time. If you would rather approve every send yourself, you can change your send policy in your preferences.'
          : 'You can review the tailored documents, the timeline and the result in your pipeline at any time.',
      ),
    ],
    `A job has been submitted on your behalf: ${input.jobTitle} at ${input.company}`,
  );
  const text = `Hello ${first},\n\nYour agent finished an application on your behalf. It is now submitted:\n\nRole: ${input.jobTitle}\nCompany: ${input.company}${input.confirmation ? `\nConfirmation: ${input.confirmation}` : ''}\n\nView it in your pipeline: ${input.pipelineUrl}\n\nIf you would rather approve every send yourself, you can change your send policy in your preferences.\n\nJobiest - Your next opportunity is here.`;
  return sendEmail({ to, subject: 'A job has been submitted on your behalf', html, text });
}

export interface AgentFoundJobsInput {
  firstName?: string;
  count: number;
  pipelineUrl: string;
}

/** "Your agent found jobs for you" (approval send policy): the applications
 *  are crafted and waiting in the pipeline for the user's approval. */
export async function sendAgentFoundJobsEmail(to: string, input: AgentFoundJobsInput): Promise<SendEmailResult> {
  const first = input.firstName?.trim() || 'there';
  const n = input.count === 1 ? 'a new job' : `${input.count} new jobs`;
  const html = composeEmail(
    [
      emailHero('Your agent has been working'),
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph(
        input.count === 1
          ? 'Your agent found a job that matches your criteria, tailored your CV and cover letter, and added the application to your pipeline.'
          : `Your agent found ${n} that match your criteria, tailored your CV and cover letter for each, and added the applications to your pipeline.`,
      ),
      emailAlert('Nothing has been sent. You approve every send. Review the applications and approve the ones you want.'),
      emailButton('Review my applications', input.pipelineUrl),
      emailParagraph('Applications you approve are submitted automatically after your approval.'),
    ],
    `Your agent found ${n} for you and prepared the applications`,
  );
  const text = `Hello ${first},\n\nYour agent found ${n} matching your criteria and prepared the applications (tailored CV and cover letter).\n\nNothing has been sent: you approve every send.\n\nReview them here: ${input.pipelineUrl}\n\nJobiest - Your next opportunity is here.`;
  return sendEmail({ to, subject: input.count === 1 ? 'Your agent found a job for you' : `Your agent found ${input.count} jobs for you`, html, text });
}
