import { supabaseAdmin } from '@/lib/supabase';

export type CompletenessCheck = [string, boolean, string];

/**
 * Shared profile-completeness computation. Used by both the API route and the
 * dashboard server component (DRY). Reads only real user records.
 */
export async function getProfileCompleteness(userId: string) {
  const [{ data: p }, { data: c }, { count: docCount }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles').eq('user_id', userId).single(),
    supabaseAdmin
      .from('career_profiles')
      .select('headline,summary,skills,experience,education,links')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const checks: CompletenessCheck[] = [
    ['name', !!p?.full_name, 'Add your name'],
    ['roles', !!p?.target_roles?.length, 'Add target roles'],
    ['headline', !!c?.headline, 'Add a headline'],
    ['summary', !!c?.summary, 'Add a professional summary'],
    ['skills', !!c?.skills?.length, 'Add skills'],
    ['experience', !!c?.experience?.length, 'Add work experience'],
    ['education', !!c?.education?.length, 'Add education'],
    ['portfolio', !!c?.links?.portfolio, 'Add a portfolio link'],
    ['cv', !!docCount, 'Upload a master CV'],
  ];

  const done = checks.filter((x) => x[1]).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    next: checks.filter((x) => !x[1]).map((x) => x[2]),
    checks,
  };
}
