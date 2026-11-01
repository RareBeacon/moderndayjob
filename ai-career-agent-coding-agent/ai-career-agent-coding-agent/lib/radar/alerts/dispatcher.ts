/**
 * Phase 6 - Candidate First-Mover Radar Alerts & Deduplicated Delivery Engine
 * ===========================================================================
 * Delivers high-signal opportunity notifications to subscribed candidates via
 * `notifyUser()` (in-app `public.notifications` + optional branded email)
 * while guaranteeing via `public.radar_alert_deliveries` (`unique (user_id, radar_job_id)`)
 * that a candidate is never alerted twice about the same opportunity.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from '@/lib/notifications/dispatch';
import {
  rankRadarOpportunitiesForCandidate,
  type CandidateMatchProfile,
} from '@/lib/radar/matching/semantic-matcher';
import { isRadarSchemaMissingError } from '@/lib/radar/sync/persistence';
import { supabaseAdmin } from '@/lib/supabase';
import type { RadarJobRow, WorkplaceType } from '@/lib/radar/types';

export interface CandidateRadarAlertSettings {
  userId: string;
  enabled: boolean;
  exclusivityOnly: boolean;
  minConfidence: number;
  workplaceTypes: WorkplaceType[];
  targetRoles: string[];
  countryCodes: string[];
  frequency: 'DAILY' | 'INSTANT' | 'PAUSED';
  emailEnabled: boolean;
  lastNotifiedAt: string | null;
}

const DEFAULT_SETTINGS = (userId: string): CandidateRadarAlertSettings => ({
  userId,
  enabled: false,
  exclusivityOnly: true,
  minConfidence: 80,
  workplaceTypes: [],
  targetRoles: [],
  countryCodes: [],
  frequency: 'DAILY',
  emailEnabled: false,
  lastNotifiedAt: null,
});

export async function getCandidateAlertSettings(
  userId: string,
  db: SupabaseClient = supabaseAdmin,
): Promise<{ migrationPending: boolean; settings: CandidateRadarAlertSettings }> {
  const { data, error } = await db
    .from('radar_candidate_alerts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isRadarSchemaMissingError(error)) {
      return { migrationPending: true, settings: DEFAULT_SETTINGS(userId) };
    }
    throw error;
  }

  if (!data) {
    return { migrationPending: false, settings: DEFAULT_SETTINGS(userId) };
  }

  const row = data as Record<string, unknown>;
  return {
    migrationPending: false,
    settings: {
      userId,
      enabled: Boolean(row.enabled),
      exclusivityOnly: Boolean(row.exclusivity_only),
      minConfidence: typeof row.min_confidence === 'number' ? row.min_confidence : 80,
      workplaceTypes: Array.isArray(row.workplace_types)
        ? (row.workplace_types as WorkplaceType[])
        : [],
      targetRoles: Array.isArray(row.target_roles) ? (row.target_roles as string[]) : [],
      countryCodes: Array.isArray(row.country_codes) ? (row.country_codes as string[]) : [],
      frequency:
        row.frequency === 'INSTANT' || row.frequency === 'PAUSED' ? row.frequency : 'DAILY',
      emailEnabled: Boolean(row.email_enabled),
      lastNotifiedAt: typeof row.last_notified_at === 'string' ? row.last_notified_at : null,
    },
  };
}

export async function upsertCandidateAlertSettings(
  input: Omit<CandidateRadarAlertSettings, 'lastNotifiedAt'>,
  db: SupabaseClient = supabaseAdmin,
): Promise<{ migrationPending: boolean; settings: CandidateRadarAlertSettings }> {
  const cleanCountries = input.countryCodes
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 12);
  const cleanRoles = input.targetRoles
    .map((r) => r.trim())
    .filter((r) => r.length >= 2 && r.length <= 100)
    .slice(0, 12);
  const minConf = Math.max(50, Math.min(100, Math.round(input.minConfidence)));

  const { data, error } = await db
    .from('radar_candidate_alerts')
    .upsert(
      {
        user_id: input.userId,
        enabled: input.enabled,
        exclusivity_only: input.exclusivityOnly,
        min_confidence: minConf,
        workplace_types: input.workplaceTypes,
        target_roles: cleanRoles,
        country_codes: cleanCountries,
        frequency: input.frequency,
        email_enabled: input.emailEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('last_notified_at')
    .maybeSingle();

  if (error) {
    if (isRadarSchemaMissingError(error)) {
      return {
        migrationPending: true,
        settings: { ...input, minConfidence: minConf, targetRoles: cleanRoles, countryCodes: cleanCountries, lastNotifiedAt: null },
      };
    }
    throw error;
  }

  return {
    migrationPending: false,
    settings: {
      ...input,
      minConfidence: minConf,
      targetRoles: cleanRoles,
      countryCodes: cleanCountries,
      lastNotifiedAt: (data as { last_notified_at?: string | null } | null)?.last_notified_at ?? null,
    },
  };
}

export interface AlertDispatchSummary {
  migrationPending: boolean;
  subscribersChecked: number;
  usersNotified: number;
  deliveriesRecorded: number;
}

export async function dispatchRadarCandidateAlerts(opts: {
  maxSubscribers?: number;
  db?: SupabaseClient;
  notifyFn?: typeof notifyUser;
} = {}): Promise<AlertDispatchSummary> {
  const db = opts.db ?? supabaseAdmin;
  const notify = opts.notifyFn ?? notifyUser;
  const maxSubscribers = Math.max(1, Math.min(200, opts.maxSubscribers ?? 50));

  const { data: subs, error: subsErr } = await db
    .from('radar_candidate_alerts')
    .select('*')
    .eq('enabled', true)
    .neq('frequency', 'PAUSED')
    .limit(maxSubscribers);

  if (subsErr) {
    if (isRadarSchemaMissingError(subsErr)) {
      return { migrationPending: true, subscribersChecked: 0, usersNotified: 0, deliveriesRecorded: 0 };
    }
    return { migrationPending: false, subscribersChecked: 0, usersNotified: 0, deliveriesRecorded: 0 };
  }

  const subscribers = (subs ?? []) as Array<Record<string, unknown>>;
  if (subscribers.length === 0) {
    return { migrationPending: false, subscribersChecked: 0, usersNotified: 0, deliveriesRecorded: 0 };
  }

  // Load recent verified active opportunities
  const { data: jobRows, error: jobErr } = await db
    .from('radar_jobs')
    .select('*')
    .eq('lifecycle_status', 'ACTIVE')
    .in('verification_status', ['VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD'])
    .order('first_seen_at', { ascending: false })
    .limit(150);

  if (jobErr || !jobRows || jobRows.length === 0) {
    return {
      migrationPending: Boolean(jobErr && isRadarSchemaMissingError(jobErr)),
      subscribersChecked: subscribers.length,
      usersNotified: 0,
      deliveriesRecorded: 0,
    };
  }

  const candidateJobs = jobRows as RadarJobRow[];
  let usersNotified = 0;
  let deliveriesRecorded = 0;

  for (const sub of subscribers) {
    const userId = String(sub.user_id ?? '');
    if (!userId) continue;

    // Skip daily subscribers already notified within the past 20 hours
    const freq = String(sub.frequency ?? 'DAILY');
    const lastNotifiedAt = typeof sub.last_notified_at === 'string' ? Date.parse(sub.last_notified_at) : NaN;
    if (freq === 'DAILY' && Number.isFinite(lastNotifiedAt) && Date.now() - lastNotifiedAt < 20 * 3600_000) {
      continue;
    }

    const { data: deliveredRows } = await db
      .from('radar_alert_deliveries')
      .select('radar_job_id')
      .eq('user_id', userId)
      .limit(500);
    const alreadyDelivered = new Set(
      ((deliveredRows ?? []) as Array<{ radar_job_id: string }>).map((r) => r.radar_job_id),
    );

    const minConf = typeof sub.min_confidence === 'number' ? sub.min_confidence : 75;
    const countryFilter = Array.isArray(sub.country_codes)
      ? (sub.country_codes as string[]).map((c) => c.toUpperCase())
      : [];

    const eligibleJobs = candidateJobs.filter((j) => {
      if (alreadyDelivered.has(j.id)) return false;
      if (j.composite_confidence < minConf) return false;
      if (countryFilter.length > 0 && (!j.country_code || !countryFilter.includes(j.country_code.toUpperCase()))) {
        return false;
      }
      return true;
    });
    if (eligibleJobs.length === 0) continue;

    const [{ data: prof }, { data: career }, { data: prefs }] = await Promise.all([
      db.from('profiles').select('full_name, email').eq('user_id', userId).maybeSingle(),
      db.from('career_profiles').select('headline, summary, skills').eq('user_id', userId).maybeSingle(),
      db.from('job_preferences').select('target_roles, preferred_locations').eq('user_id', userId).maybeSingle(),
    ]);

    const subRoles = Array.isArray(sub.target_roles) ? (sub.target_roles as string[]) : [];
    const prefRoles = Array.isArray((prefs as { target_roles?: string[] } | null)?.target_roles)
      ? ((prefs as { target_roles: string[] }).target_roles)
      : [];
    const careerRow = (career ?? {}) as { headline?: string | null; summary?: string | null; skills?: string[] };

    const profile: CandidateMatchProfile = {
      targetRoles: [...subRoles, ...prefRoles, ...(careerRow.headline ? [careerRow.headline] : [])],
      skills: Array.isArray(careerRow.skills) ? careerRow.skills : [],
      preferredLocations: Array.isArray((prefs as { preferred_locations?: string[] } | null)?.preferred_locations)
        ? ((prefs as { preferred_locations: string[] }).preferred_locations)
        : [],
      countryCode: countryFilter[0] ?? null,
      preferredWorkplaceTypes: Array.isArray(sub.workplace_types)
        ? (sub.workplace_types as WorkplaceType[])
        : [],
      summaryText: careerRow.summary ?? null,
    };

    const topMatches = rankRadarOpportunitiesForCandidate({
      jobs: eligibleJobs,
      profile,
      exclusivityOnly: Boolean(sub.exclusivity_only),
      verifiedOnly: true,
      limit: 3,
    }).filter((m) => m.matchScore >= 55);

    if (topMatches.length === 0) continue;

    const emailEnabled = Boolean(sub.email_enabled);
    const profRow = (prof ?? {}) as { full_name?: string | null; email?: string | null };
    const channel = emailEnabled && profRow.email ? 'IN_APP_AND_EMAIL' : 'IN_APP';

    let newlyInserted = 0;
    for (const match of topMatches) {
      const { error: delivErr } = await db.from('radar_alert_deliveries').insert({
        user_id: userId,
        radar_job_id: match.opportunity.id,
        channel,
        match_score: Math.round(match.matchScore),
      });
      if (!delivErr) {
        newlyInserted += 1;
        deliveriesRecorded += 1;
      }
    }

    if (newlyInserted > 0) {
      const lead = topMatches[0].opportunity;
      const moreSuffix =
        topMatches.length > 1 ? ` plus ${topMatches.length - 1} more verified match(es)` : '';
      await notify({
        userId,
        title: `New Radar match: ${lead.title} at ${lead.companyName}`,
        body: `Jobiest spotted ${lead.title} at ${lead.companyName} (${lead.workplaceType})${moreSuffix}. Review the opportunity and prepare your application when ready.`,
        deepLink: '/opportunities',
        type: 'application',
        email:
          channel === 'IN_APP_AND_EMAIL' && profRow.email
            ? {
                to: profRow.email,
                firstName: profRow.full_name ?? null,
                subject: `New Job Radar match: ${lead.title} at ${lead.companyName}`,
                ctaLabel: 'Review opportunities',
              }
            : undefined,
      });

      await db
        .from('radar_candidate_alerts')
        .update({ last_notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      usersNotified += 1;
    }
  }

  return {
    migrationPending: false,
    subscribersChecked: subscribers.length,
    usersNotified,
    deliveriesRecorded,
  };
}
