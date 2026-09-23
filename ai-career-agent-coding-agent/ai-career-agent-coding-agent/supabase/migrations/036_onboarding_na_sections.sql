-- 036: onboarding gate groundwork (Enterprise upgrade Milestone 1).
-- career_profiles.not_applicable lets a user mark sections that genuinely do
-- not apply (e.g. no work experience yet) instead of inventing data to reach
-- the onboarding threshold. A marked section counts as addressed for
-- completeness; it is never written into generated documents.

alter table public.career_profiles
  add column if not exists not_applicable text[] not null default '{}';

alter table public.career_profiles
  add constraint not_applicable_values check (
    not_applicable <@ array['experience', 'education', 'projects']::text[]
  );
