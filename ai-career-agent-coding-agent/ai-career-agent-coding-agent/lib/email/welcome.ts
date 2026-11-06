import { supabaseAdmin } from '@/lib/supabase';
import { sendWelcomeEmail } from './resend';

/**
 * Welcome email with server-side once-only semantics.
 *
 * The profiles row is the single marker: welcome_email_sent_at is updated
 * with a WHERE ... IS NULL guard, so no matter how often verification is
 * replayed, pages refreshed, or requests raced, the email can only be
 * triggered by the one update that actually flips the marker. The mail send
 * is best-effort and never blocks the calling flow.
 */
export async function sendWelcomeEmailOnce(
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  if (!email) return;
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('welcome_email_sent_at', null)
      .select('full_name')
      .maybeSingle();
    if (error || !data) return; // already sent, or marker write failed
    const fullName = (data as { full_name: string | null }).full_name ?? undefined;
    const res = await sendWelcomeEmail(email, fullName).catch((err) => {
      console.warn('[email:welcome] sendWelcomeEmail failed', { userId, email, err });
      return { ok: false, error: String(err?.message ?? err) };
    });
    if (!res || !res.ok) {
      console.warn('[email:welcome] Welcome email not delivered; releasing marker for retry', {
        userId,
        email,
        error: res?.error,
      });
      await supabaseAdmin
        .from('profiles')
        .update({ welcome_email_sent_at: null })
        .eq('user_id', userId);
    }
  } catch {
    // never break the caller
  }
}
