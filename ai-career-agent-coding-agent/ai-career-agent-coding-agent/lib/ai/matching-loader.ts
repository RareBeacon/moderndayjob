import { supabaseAdmin } from '@/lib/supabase';
import type { EmploymentType, RemoteType } from '@/lib/jobs/types';
import type {
  MatchableJob,
  MatchableProfile,
  MatchPreferences,
} from '@/lib/matching/types';

const REMOTE_MAP: Record<string, RemoteType> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
};
const EMP_MAP: Record<string, EmploymentType> = {
  'full-time': 'full-time',
  full_time: 'full-time',
  'part-time': 'part-time',
  part_time: 'part-time',
  contract: 'contract',
  internship: 'internship',
};

interface JobMetadata {
  remote_type?: RemoteType;
  employment_type?: EmploymentType;
  seniority?: string;
  canonical_url?: string;
}

export interface MatchInputs {
  profile: MatchableProfile | null;
  prefs: MatchPreferences;
  jobs: MatchableJob[];
  appliedJobIds: Set<string>;
}

/**
 * Server-only loader: assembles everything runMatching needs from the database.
 * All reads use the service role (RLS bypass) since this runs in a protected
 * route after requireUser().
 */
export async function loadMatchInputs(userId: string): Promise<MatchInputs> {
  const [cpRes, pRes, prefsRes, jobsRes, appsRes] = await Promise.all([
    supabaseAdmin
      .from('career_profiles')
      .select('headline, summary, skills, experience')
      .eq('user_id', userId)
      .single(),
    supabaseAdmin.from('profiles').select('target_roles').eq('user_id', userId).single(),
    supabaseAdmin
      .from('job_preferences')
      .select('remote_types, locations, employment_types')
      .eq('user_id', userId)
      .single(),
    supabaseAdmin
      .from('jobs')
      .select('id, source, external_id, company, title, description, location, metadata')
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin.from('applications').select('job_id').eq('user_id', userId),
  ]);

  let profile: MatchableProfile | null = null;
  if (cpRes.data) {
    profile = {
      headline: cpRes.data.headline ?? null,
      summary: cpRes.data.summary ?? null,
      skills: cpRes.data.skills ?? [],
      targetRoles: pRes.data?.target_roles ?? [],
      experience: (cpRes.data.experience ?? []) as MatchableProfile['experience'],
    };
  }

  const prefsRow = prefsRes.data as
    | { remote_types?: string[]; locations?: string[]; employment_types?: string[] }
    | null;
  const prefs: MatchPreferences = {
    remoteTypes: (prefsRow?.remote_types ?? [])
      .map((s) => REMOTE_MAP[s.trim().toLowerCase()] ?? 'unknown')
      .filter((r): r is RemoteType => r !== 'unknown'),
    employmentTypes: (prefsRow?.employment_types ?? [])
      .map((s) => EMP_MAP[s.trim().toLowerCase().replace(/\s+/g, '-')] ?? '')
      .filter(Boolean) as EmploymentType[],
    locations: prefsRow?.locations ?? [],
  };

  const jobs: MatchableJob[] = ((jobsRes.data as Array<Record<string, unknown>>) ?? []).map((j) => {
    const m = (j.metadata ?? {}) as JobMetadata;
    return {
      id: String(j.id),
      source: (j.source as string) ?? 'UNKNOWN',
      externalId: (j.external_id as string) ?? '',
      company: (j.company as string) ?? '',
      title: (j.title as string) ?? '',
      description: (j.description as string) ?? '',
      location: (j.location as string) ?? '',
      remoteType: m.remote_type ?? 'unknown',
      employmentType: m.employment_type ?? 'unknown',
      seniority: m.seniority ?? undefined,
      canonicalUrl: m.canonical_url ?? undefined,
    };
  });

  const appliedJobIds = new Set<string>(
    ((appsRes.data as Array<{ job_id: string }>) ?? [])
      .map((a) => a.job_id)
      .filter(Boolean),
  );

  return { profile, prefs, jobs, appliedJobIds };
}
