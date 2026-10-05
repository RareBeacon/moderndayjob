import { supabaseAdmin } from '@/lib/supabase';
import { sendFirstWinEmail } from './resend';

/**
 * First-win activation nudge. Users who verified their email (welcome marker
 * set) but have zero product usage (no rows in usage_daily) get one tiny-
 * action email pointing at the free ATS scanner: "scan your CV against one
 * real job; that proves the agent works". Sent at most once per account via
 * the profiles.first_win_email_sent_at set-once marker (same single-writer
 * semantics as the welcome email, migration 043). Claim-then-send: the
 * marker is claimed with an IS NULL guard BEFORE the send, and the send is
 * best-effort, so no failure path can ever double-send.
 */

/** Safety cap per cron run (early product; keep batches small). */
const MAX_PER_RUN = 50;
/** Only nudge accounts that have had >= 3 days to explore. */
const DORMANT_AFTER_DAYS = 3;

export interface FirstWinReport {
  candidates: number;
  sent: number;
  skipped: number;
}

export async function sendFirstWinEmails(): Promise<FirstWinReport> {
  const cutoff = new Date(Date.now() - DORMANT_AFTER_DAYS * 86_400_000).toISOString();

  // Candidates: email-verified (welcome marker set), nudge not yet sent,
  // account old enough, oldest first.
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, full_name, email')
    .not('welcome_email_sent_at', 'is', null)
    .is('first_win_email_sent_at', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error || !profiles || profiles.length === 0) {
    return { candidates: 0, sent: 0, skipped: 0 };
  }

  // Exclude anyone with product usage (any usage_daily row = used a feature).
  const ids = profiles.map((p) => p.user_id);
  const { data: usage } = await supabaseAdmin
    .from('usage_daily')
    .select('user_id')
    .in('user_id', ids);
  const active = new Set((usage ?? []).map((u: { user_id: string }) => u.user_id));

  let sent = 0;
  let skipped = 0;
  for (const profile of profiles as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
    const email = profile.email?.trim();
    if (active.has(profile.user_id) || !email) {
      skipped += 1;
      continue;
    }
    // Claim the one-time marker (set-once; a lost race returns no row).
    const { data: claimed } = await supabaseAdmin
      .from('profiles')
      .update({ first_win_email_sent_at: new Date().toISOString() })
      .eq('user_id', profile.user_id)
      .is('first_win_email_sent_at', null)
      .select('user_id')
      .maybeSingle();
    if (!claimed) {
      skipped += 1;
      continue;
    }
    const result = await sendFirstWinEmail(email, profile.full_name ?? undefined);
    if (result.ok) sent += 1;
    else skipped += 1;
  }
  return { candidates: profiles.length, sent, skipped };
}
