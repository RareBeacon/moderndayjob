import { supabaseAdmin } from '@/lib/supabase';
import type { GenerationJob, GenerationProfile } from './types';

/** Load the profile subset the generators need (career_profiles + profiles). */
export async function loadGenerationProfile(userId: string): Promise<GenerationProfile | null> {
  const [cp, p] = await Promise.all([
    supabaseAdmin
      .from('career_profiles')
      .select('headline, summary, skills, experience, education')
      .eq('user_id', userId)
      .single(),
    supabaseAdmin.from('profiles').select('target_roles').eq('user_id', userId).single(),
  ]);
  if (!cp.data) return null;
  return {
    headline: cp.data.headline ?? null,
    summary: cp.data.summary ?? null,
    skills: cp.data.skills ?? [],
    targetRoles: p.data?.target_roles ?? [],
    experience: (cp.data.experience ?? []) as GenerationProfile['experience'],
    education: (cp.data.education ?? []) as GenerationProfile['education'],
  };
}

/** Load a job (untrusted reference) for tailoring. */
export async function loadGenerationJob(jobId: string): Promise<GenerationJob | null> {
  const { data } = await supabaseAdmin
    .from('jobs')
    .select('company, title, description, location')
    .eq('id', jobId)
    .maybeSingle();
  if (!data) return null;
  return {
    company: data.company ?? '',
    title: data.title ?? '',
    description: data.description ?? '',
    location: data.location ?? undefined,
  };
}
