-- 005_profile_application_email.sql
--
-- Adds the application email to a user's profile.
--
-- Product rule: this is an APPLICATION EMAIL ONLY. There is no inbox access,
-- no email OAuth, no mailbox monitoring, and no stored email credentials.
-- See DECISIONS.md D-001 and D-002.

alter table public.profiles
  add column if not exists application_email text;

comment on column public.profiles.application_email is
  'Email address the user wants used when submitting applications. Application email only, no inbox access or credentials are stored.';
