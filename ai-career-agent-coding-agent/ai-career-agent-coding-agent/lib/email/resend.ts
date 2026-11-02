import {
  sendTransactionalEmail,
  type EmailProviderId,
} from './transport';
import { SITE_URL } from '@/lib/site';
import {
  BRAND,
  composeEmail,
  composeVerificationCodeEmail,
  emailAlert,
  emailButton,
  emailButtonLinkHint,
  emailHeading,
  emailHero,
  emailInfoCard,
  emailParagraph,
  escapeHtmlEmail,
  maskEmailForVerificationGreeting,
} from './templates';

/** Transactional email client over Jobiest's $0 multi-transport router
 *  (Self-Hosted Stalwart SMTP <-> Brevo Free <-> Resend Free).
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
  preferredProvider?: EmailProviderId;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  provider?: EmailProviderId;
  attemptedProviders?: EmailProviderId[];
}

// Automated transactional sender on the verified production domain
// (jobiest.com: DNS DKIM record present, domain verified in Resend/Stalwart).
// RESEND_FROM remains available as an explicit override for special cases.
const NO_REPLY = process.env.RESEND_FROM?.trim() || 'Jobiest <no-reply@jobiest.com>';

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const res = await sendTransactionalEmail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from: input.from ?? NO_REPLY,
      replyTo: input.replyTo,
      preferredProvider: input.preferredProvider,
    });
    if (res.skipped) {
      return {
        ok: false,
        error: 'RESEND_API_KEY_NOT_CONFIGURED',
        attemptedProviders: res.attemptedProviders,
      };
    }
    return {
      ok: true,
      id: res.id,
      provider: res.provider,
      attemptedProviders: res.attemptedProviders,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'EMAIL_TRANSPORT_ERROR',
    };
  }
}

/** OAuth (Google / LinkedIn) sign-in verification code email. Never throws. */
export async function sendEmailVerificationCode(to: string, code: string, _firstName?: string): Promise<SendEmailResult> {
  const masked = maskEmailForVerificationGreeting(to);
  const html = composeVerificationCodeEmail({ to, code });
  const text = [
    `Dear ${masked.plain}:`,
    '',
    'Please enter the code to verify your account.',
    '',
    code,
    '',
    'Note:',
    'This verification code expires in 10 minutes and can be used once. After your account is verified, you can manage your career profile, login email address, phone number, and security settings. If you did not request a verification code, please ignore this email or change your account password to prevent unauthorized access to your account.',
    '',
    'Jobiest',
    '----------------------------------------',
    'Please do not reply directly to this email.',
    'This is a system message and do not reply.',
    'If you have any issues or enquiry, you can reach out to us at support@jobiest.com',
  ].join('\n');
  return sendEmail({ to, subject: 'Verification Code from Jobiest', html, text });
}

/** Password signup email verification (6-digit code + one-click link). */
export async function sendSignupVerificationEmail(
  to: string,
  code: string,
  verifyUrl: string,
  _firstName?: string,
): Promise<SendEmailResult> {
  const masked = maskEmailForVerificationGreeting(to);
  const html = composeVerificationCodeEmail({ to, code, verifyUrl });
  const text = [
    `Dear ${masked.plain}:`,
    '',
    'Please enter the code to verify your account.',
    '',
    code,
    '',
    `Or verify in one click: ${verifyUrl}`,
    '',
    'Note:',
    'This verification code expires in 10 minutes and can be used once. After your account is verified, you can manage your career profile, login email address, phone number, and security settings. If you did not request a verification code, please ignore this email or change your account password to prevent unauthorized access to your account.',
    '',
    'Jobiest',
    '----------------------------------------',
    'Please do not reply directly to this email.',
    'This is a system message and do not reply.',
    'If you have any issues or enquiry, you can reach out to us at support@jobiest.com',
  ].join('\n');
  return sendEmail({ to, subject: 'Verification Code from Jobiest', html, text });
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

/** First-win activation nudge for verified-but-dormant accounts (2026-10-05).
 *  One tiny action: scan your current CV against one real job. Reply-to is
 *  support@ because the copy promises a human reply. */
export async function sendFirstWinEmail(to: string, firstName?: string): Promise<SendEmailResult> {
  const name = firstName?.trim() || 'there';
  const first = name.split(' ')[0];
  const steps = [
    'Open the free ATS resume scanner - no upload needed.',
    'Paste your current CV, and one job post you actually want.',
    'Read the score, and the fixes that would move it most.',
  ]
    .map((item) => `<div style="padding:4px 0;font-size:14px;color:#333D52;">&#10003;&nbsp; ${item}</div>`)
    .join('');
  const html = composeEmail(
    [
      emailHero('Your first scan takes 90 seconds'),
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph(
        'Your Jobiest account is ready and your free daily credits are in - but nothing has run through them yet. No judgement: most people sign up on a busy Monday and get pulled away. Here is the whole thing, three lines.',
      ),
      emailParagraph(steps),
      emailParagraph(
        'Do not try to overhaul your whole career tonight. Just scan your CV against one real job. That proves the agent works, which is the only hard part. Everything after that - tailored CVs, cover letters, applications you approve one by one - builds on that one score.',
      ),
      emailButton('Scan my CV now', `${SITE_URL}/free-ats-resume-scanner`),
      emailParagraph('Your free daily credits refill every day, so there is nothing to lose by starting small.', {
        muted: true,
      }),
      emailParagraph(
        'Something not working? Just reply to this email - it lands in a real inbox, and we read every one.',
      ),
    ],
    'Jobiest - your first scan takes 90 seconds',
  );
  const text = `Hello ${first},\n\nYour Jobiest account is ready and your free daily credits are in - but nothing has run through them yet. No judgement: most people sign up on a busy Monday and get pulled away. Here is the whole thing, three lines:\n\n1. Open the free ATS resume scanner: ${SITE_URL}/free-ats-resume-scanner\n2. Paste your current CV, and one job post you actually want.\n3. Read the score, and the fixes that would move it most.\n\nDo not try to overhaul your whole career tonight. Just scan your CV against one real job. That proves the agent works, which is the only hard part. Everything after that - tailored CVs, cover letters, applications you approve one by one - builds on that one score.\n\nYour free daily credits refill every day, so there is nothing to lose by starting small.\n\nSomething not working? Just reply to this email - it lands in a real inbox, and we read every one.\n\nIf you have any issues or enquiry, you can reach out to us at support@jobiest.com`;
  return sendEmail({
    to,
    subject: 'Your first scan takes 90 seconds',
    html,
    text,
    replyTo: 'support@jobiest.com',
  });
}

export interface PlanChangeEmailInput {
  firstName?: string;
  planName: string;
  mode: 'applied' | 'scheduled' | 'cancelled';
  until?: string | null;
}

/** Admin-granted plan change notice (best-effort; never blocks the change). */
export async function sendPlanChangeEmail(to: string, input: PlanChangeEmailInput): Promise<SendEmailResult> {
  const first = input.firstName?.trim() || 'there';
  const plan = input.planName;
  const until = input.until ? ` until ${input.until}` : '';
  const line =
    input.mode === 'cancelled'
      ? 'Your Jobiest account is now on the Free plan. Your documents and applications stay exactly as they are, and you can upgrade again any time.'
      : input.mode === 'scheduled'
        ? `Your upgrade to Jobiest ${plan} is queued. It activates automatically when your current plan ends${until ? ` (${input.until})` : ''}. You do not need to do anything.`
        : `Your Jobiest account has been upgraded to ${plan}${until}. Everything in the plan is active right now.`;
  const html = composeEmail(
    [
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph(line),
      emailButton('Open my plan', `${SITE_URL}/billing`),
      emailParagraph('If you did not expect this change, just reply to this email and we will sort it out.', { muted: true }),
    ],
    input.mode === 'cancelled' ? 'Your Jobiest plan has changed' : `You are now on Jobiest ${plan}`,
  );
  const text = `Hello ${first},\n\n${line}\n\nOpen your plan: ${SITE_URL}/billing\n\nIf you did not expect this change, just reply to this email and we will sort it out.\n\nJobiest support`;
  return sendEmail({ to, subject: input.mode === 'cancelled' ? 'Your Jobiest plan has changed' : `You are now on Jobiest ${plan}`, html, text, replyTo: 'support@jobiest.com' });
}

export interface PaymentReceiptEmailInput {
  firstName?: string;
  planName: string;
  amountFormatted: string;
  reference: string;
  provider: string;
  periodEnd?: string | null;
}

/** Verified payment receipt email (sent best-effort after server-side payment verification). */
export async function sendPaymentReceiptEmail(to: string, input: PaymentReceiptEmailInput): Promise<SendEmailResult> {
  const first = input.firstName?.trim() || 'there';
  const html = composeEmail(
    [
      emailHero('Payment confirmed'),
      emailHeading(`Hello ${escapeHtmlEmail(first)},`),
      emailParagraph(`Thank you for upgrading to <strong>Jobiest ${escapeHtmlEmail(input.planName)}</strong>. Your payment has been verified and your plan benefits are active immediately.`),
      emailInfoCard('Payment receipt', [
        `<strong>Plan:</strong> Jobiest ${escapeHtmlEmail(input.planName)}`,
        `<strong>Amount paid:</strong> ${escapeHtmlEmail(input.amountFormatted)}`,
        `<strong>Reference:</strong> ${escapeHtmlEmail(input.reference)}`,
        `<strong>Provider:</strong> ${escapeHtmlEmail(input.provider)}`,
        ...(input.periodEnd ? [`<strong>Active through:</strong> ${escapeHtmlEmail(input.periodEnd)}`] : []),
      ]),
      emailButton('View my subscription', `${SITE_URL}/billing`),
      emailParagraph('If you have any billing questions, reply to this email or contact support@jobiest.com.', { muted: true }),
    ],
    `Receipt for your Jobiest ${input.planName} subscription`,
  );
  const text = [
    `Hello ${first},`,
    '',
    `Thank you for upgrading to Jobiest ${input.planName}. Your payment has been verified and your plan benefits are active immediately.`,
    '',
    `Plan: Jobiest ${input.planName}`,
    `Amount paid: ${input.amountFormatted}`,
    `Reference: ${input.reference}`,
    `Provider: ${input.provider}`,
    ...(input.periodEnd ? [`Active through: ${input.periodEnd}`] : []),
    '',
    `Manage your subscription: ${SITE_URL}/billing`,
    '',
    'If you have any billing questions, contact support@jobiest.com.',
  ].join('\n');
  return sendEmail({
    to,
    subject: `Your Jobiest ${input.planName} payment receipt`,
    html,
    text,
    replyTo: 'support@jobiest.com',
  });
}

export interface AdminSecurityAlertEmailInput {
  action: string;
  actorEmail?: string | null;
  targetSummary: string;
  reason?: string | null;
  occurredAt?: string;
}

/** High-sensitivity administrative or security alert for the Owner account. */
export async function sendAdminSecurityAlertEmail(to: string, input: AdminSecurityAlertEmailInput): Promise<SendEmailResult> {
  const when = input.occurredAt ?? new Date().toISOString();
  const html = composeEmail(
    [
      emailHero('Admin security notice'),
      emailHeading('Sensitive administrative action recorded'),
      emailParagraph('A privileged action was executed in the Jobiest Admin Control Centre:'),
      emailInfoCard('Audit summary', [
        `<strong>Action:</strong> ${escapeHtmlEmail(input.action)}`,
        ...(input.actorEmail ? [`<strong>Actor:</strong> ${escapeHtmlEmail(input.actorEmail)}`] : []),
        `<strong>Target:</strong> ${escapeHtmlEmail(input.targetSummary)}`,
        ...(input.reason ? [`<strong>Reason:</strong> ${escapeHtmlEmail(input.reason)}`] : []),
        `<strong>Timestamp (UTC):</strong> ${escapeHtmlEmail(when)}`,
      ]),
      emailButton('Open Admin Security', `${SITE_URL}/admin/security`),
    ],
    `Jobiest Admin Alert: ${input.action}`,
  );
  const text = [
    'Sensitive administrative action recorded in Jobiest Admin Control Centre:',
    '',
    `Action: ${input.action}`,
    ...(input.actorEmail ? [`Actor: ${input.actorEmail}`] : []),
    `Target: ${input.targetSummary}`,
    ...(input.reason ? [`Reason: ${input.reason}`] : []),
    `Timestamp (UTC): ${when}`,
    '',
    `Review audit trail: ${SITE_URL}/admin/security`,
  ].join('\n');
  return sendEmail({
    to,
    subject: `[Jobiest Security] ${input.action}`,
    html,
    text,
    replyTo: 'support@jobiest.com',
  });
}
