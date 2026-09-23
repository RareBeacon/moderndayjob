import { supabaseAdmin } from '@/lib/supabase';

export type CompletenessCheck = [string, boolean, string];

/**
 * Shared profile-completeness computation (Enterprise upgrade Milestone 1:
 * weighted sections + not-applicable support). Used by the API route and
 * dashboard server components. Reads only real user records.
 *
 * Weights reflect what the product actually needs to prepare truthful
 * applications. Sections a user may legitimately not have (experience,
 * education, projects) can be marked not applicable in
 * career_profiles.not_applicable; a marked section counts as addressed
 * without forcing invented data. It is never written into documents.
 *
 * Weights (total 100): name 5, target roles 15, headline 10, summary 10,
 * skills 15, experience 15, education 10, projects 5, job preferences 5,
 * master CV 10.
 */

const SECTION_WEIGHTS: Record<string, number> = {
  name: 5,
  roles: 15,
  headline: 10,
  summary: 10,
  skills: 15,
  experience: 15,
  education: 10,
  projects: 5,
  preferences: 5,
  cv: 10,
};

const NA_ELIGIBLE = new Set(['experience', 'education', 'projects']);

export async function getProfileCompleteness(userId: string) {
  const [{ data: p }, { data: c }, { data: prefs }, { count: docCount }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles').eq('user_id', userId).single(),
    supabaseAdmin
      .from('career_profiles')
      .select('headline,summary,skills,experience,education,projects,links,not_applicable')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('job_preferences')
      .select('locations,remote_types,employment_types')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const naSections = (c?.not_applicable ?? ([] as string[])) as string[];
  const na = new Set(naSections.filter((id: string) => NA_ELIGIBLE.has(id)));
  const naAware = (id: string, present: boolean): boolean => present || na.has(id);

  const checks: CompletenessCheck[] = [
    ['name', !!p?.full_name, 'Add your name'],
    ['roles', !!p?.target_roles?.length, 'Add target roles'],
    ['headline', !!c?.headline, 'Add a headline'],
    ['summary', !!c?.summary, 'Add a professional summary'],
    ['skills', !!c?.skills?.length, 'Add skills'],
    ['experience', naAware('experience', !!c?.experience?.length), 'Add work experience, or mark it not applicable'],
    ['education', naAware('education', !!c?.education?.length), 'Add education, or mark it not applicable'],
    ['projects', naAware('projects', !!c?.projects?.length), 'Add projects, or mark them not applicable'],
    [
      'preferences',
      !!(prefs?.locations?.length || prefs?.remote_types?.length || prefs?.employment_types?.length),
      'Add job preferences (location, remote, or employment type)',
    ],
    ['cv', !!docCount, 'Upload a master CV'],
  ];

  const total = Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0);
  const done = checks.reduce((sum, [id, ok]) => (ok ? sum + (SECTION_WEIGHTS[id] ?? 0) : sum), 0);
  return {
    percent: Math.round((done / total) * 100),
    next: checks.filter((x) => !x[1]).map((x) => x[2]),
    checks,
  };
}
