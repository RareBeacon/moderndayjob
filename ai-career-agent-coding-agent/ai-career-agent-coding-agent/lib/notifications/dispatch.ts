import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email/resend';
import { composeEmail, emailButton, emailHeading, emailParagraph, escapeHtmlEmail } from '@/lib/email/templates';
import { SITE_URL } from '@/lib/site';

export interface NotifyUserInput {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
  type?: 'talent_pool' | 'employer' | 'application' | 'security' | 'general';
  email?: {
    to?: string | null;
    firstName?: string | null;
    subject: string;
    ctaLabel?: string;
  };
}

/**
 * Unified server-side notification dispatcher.
 * Always writes to public.notifications first so web users see updates in-app
 * even when they have zero mobile device_tokens registered, then sends optional
 * branded transactional email best-effort. Never throws.
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: input.userId,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 1000),
      deep_link: input.deepLink ?? null,
      type: input.type ?? 'general',
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal if notifications table is unavailable in unit-test environments.
  }

  if (input.email?.to) {
    try {
      const first = input.email.firstName?.trim()?.split(' ')[0] || 'there';
      const targetUrl = input.deepLink
        ? input.deepLink.startsWith('http')
          ? input.deepLink
          : `${SITE_URL}${input.deepLink.startsWith('/') ? '' : '/'}${input.deepLink}`
        : `${SITE_URL}/talent-pool`;
      const html = composeEmail(
        [
          emailHeading(`Hello ${escapeHtmlEmail(first)},`),
          emailParagraph(escapeHtmlEmail(input.body)),
          emailButton(input.email.ctaLabel ?? 'Open Jobiest', targetUrl),
        ],
        input.title,
      );
      const text = `Hello ${first},\n\n${input.body}\n\nOpen Jobiest: ${targetUrl}\n\nJobiest Support (support@jobiest.com)`;
      await sendEmail({
        to: input.email.to,
        subject: input.email.subject,
        html,
        text,
      });
    } catch {
      // Best-effort email delivery.
    }
  }
}
