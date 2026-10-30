-- 043_first_win_email.sql
-- First-win activation nudge (2026-10-05): one-time email to verified but
-- dormant accounts pointing at the free ATS scanner. Same set-once marker
-- semantics as 026 (welcome email): profiles.first_win_email_sent_at can
-- only ever be written once per account (guarded UPDATE ... IS NULL), so the
-- cron can never double-send no matter how often it runs.
alter table public.profiles
  add column if not exists first_win_email_sent_at timestamptz;
