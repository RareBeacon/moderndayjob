/**
 * Phase 3 - Stage 5 Candidate Opportunity Matcher (`vector(384)` + Trust + First-Mover)
 * =====================================================================================
 * Aligns 100% with `public.radar_job_embeddings` (`vector(384)`) and Talent Pool's
 * `EMBEDDING_DIMENSION = 384` (`generateSemanticEmbedding`, `cosineSimilarity`) so
 * Jobiest uses ONE unified 384-dimensional vector space with zero mandatory paid API
 * cost, while exposing a clean provider-independent embedding override for neural
 * `384`-d models (`all-MiniLM-L6-v2` / `bge-small-en-v1.5`).
 *
 * Enforces Condition 2 & Condition 4:
 *   - Quarantined, scam-rejected, takedown, or expired rows are filtered out BEFORE
 *     scoring and can never be surfaced to candidates.
 *   - Outputs wrap `PublicRadarJobDTO` (`toPublicRadarJobDTO`) so internal crawler
 *     state never crosses the API boundary.
 */

import {
  EMBEDDING_DIMENSION,
  cosineSimilarity,
  generateSemanticEmbedding,
} from '@/lib/talent-pool/intelligence/rag-engine';
import {
  toPublicRadarJobDTO,
  type PublicRadarJobDTO,
  type RadarJobRow,
  type WorkplaceType,
} from '@/lib/radar/types';

export const DEFAULT_RADAR_EMBEDDING_MODEL = 'jobiest-deterministic-384-v1';

export interface CandidateMatchProfile {
  targetRoles: string[];
  skills: string[];
  preferredLocations?: string[];
  countryCode?: string | null;
  preferredWorkplaceTypes?: WorkplaceType[];
  minAnnualSalary?: number | null;
  salaryCurrency?: string | null;
  requiresVisaSponsorship?: boolean;
  summaryText?: string | null;
}

export interface RankedPublicRadarOpportunity {
  opportunity: PublicRadarJobDTO;
  matchScore: number;
  semanticSimilarity: number;
  skillOverlapScore: number;
  locationFitScore: number;
  trustAndExclusivityBonus: number;
  matchReasons: string[];
}

export function buildRadarJobEmbeddingText(job: Pick<
  RadarJobRow,
  | 'title'
  | 'company_name'
  | 'department'
  | 'career_category'
  | 'seniority_level'
  | 'workplace_type'
  | 'location_raw'
  | 'skills_required'
  | 'description_clean'
>): string {
  return [
    job.title,
    job.company_name,
    job.department ?? '',
    job.career_category ?? '',
    job.seniority_level ?? '',
    job.workplace_type,
    job.location_raw ?? '',
    (job.skills_required ?? []).join(' '),
    job.description_clean.slice(0, 4000),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRadarJobEmbedding384(
  job: Pick<
    RadarJobRow,
    | 'title'
    | 'company_name'
    | 'department'
    | 'career_category'
    | 'seniority_level'
    | 'workplace_type'
    | 'location_raw'
    | 'skills_required'
    | 'description_clean'
  >,
  embedFn: (text: string) => number[] = generateSemanticEmbedding,
): number[] {
  const vec = embedFn(buildRadarJobEmbeddingText(job));
  if (vec.length !== EMBEDDING_DIMENSION) {
    throw new Error(`RADAR_EMBEDDING_DIM_MISMATCH: expected ${EMBEDDING_DIMENSION}, received ${vec.length}`);
  }
  return vec;
}

export function buildCandidateQueryEmbedding384(
  profile: CandidateMatchProfile,
  embedFn: (text: string) => number[] = generateSemanticEmbedding,
): number[] {
  const queryText = [
    profile.targetRoles.join(' '),
    profile.skills.join(' '),
    (profile.preferredLocations ?? []).join(' '),
    profile.summaryText ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  const vec = embedFn(queryText || 'software business operations professional');
  if (vec.length !== EMBEDDING_DIMENSION) {
    throw new Error(`RADAR_EMBEDDING_DIM_MISMATCH: expected ${EMBEDDING_DIMENSION}, received ${vec.length}`);
  }
  return vec;
}

export function formatPgVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBEDDING_DIMENSION) {
    throw new Error(`RADAR_EMBEDDING_DIM_MISMATCH: expected ${EMBEDDING_DIMENSION}, received ${vec.length}`);
  }
  return `[${vec.map((n) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0)).join(',')}]`;
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

export function rankRadarOpportunitiesForCandidate(params: {
  jobs: RadarJobRow[];
  profile: CandidateMatchProfile;
  jobEmbeddingsById?: Map<string, number[]>;
  embedFn?: (text: string) => number[];
  exclusivityOnly?: boolean;
  verifiedOnly?: boolean;
  limit?: number;
}): RankedPublicRadarOpportunity[] {
  const embedFn = params.embedFn ?? generateSemanticEmbedding;
  const candidateVec = buildCandidateQueryEmbedding384(params.profile, embedFn);

  const normalizedSkills = params.profile.skills.map(normalizeToken).filter(Boolean);
  const normalizedRoles = params.profile.targetRoles.map(normalizeToken).filter(Boolean);
  const preferredCountries = new Set(
    [
      params.profile.countryCode?.toUpperCase() ?? '',
      ...(params.profile.preferredLocations ?? []).map((l) => l.trim().toUpperCase()),
    ].filter((c) => /^[A-Z]{2}$/.test(c)),
  );
  const preferredLocationsLower = (params.profile.preferredLocations ?? []).map((l) => l.toLowerCase().trim());
  const preferredModes = new Set(params.profile.preferredWorkplaceTypes ?? []);

  const results: RankedPublicRadarOpportunity[] = [];

  for (const job of params.jobs) {
    // Hard safety & lifecycle filter BEFORE scoring
    if (job.lifecycle_status !== 'ACTIVE' && job.lifecycle_status !== 'POTENTIALLY_CLOSING') {
      continue;
    }
    if (
      job.verification_status === 'SCAM_REJECTED' ||
      job.verification_status === 'SUSPICIOUS_QUARANTINE' ||
      job.verification_status === 'TAKEDOWN'
    ) {
      continue;
    }
    if (params.verifiedOnly && !job.verified_by_deterministic_evidence) {
      continue;
    }
    if (params.exclusivityOnly && job.exclusivity_tier === 'SYNDICATED') {
      continue;
    }
    if (params.profile.requiresVisaSponsorship && job.visa_sponsorship === false) {
      continue;
    }

    const jobVec = params.jobEmbeddingsById?.get(job.id) ?? buildRadarJobEmbedding384(job, embedFn);
    const rawCos = Math.max(0, Math.min(1, cosineSimilarity(candidateVec, jobVec)));

    const hayLower = `${job.title} ${job.department ?? ''} ${(job.skills_required ?? []).join(' ')} ${job.description_clean.slice(0, 3000)}`.toLowerCase();

    // Skill + role overlap (0..1)
    let matchedSkillsCount = 0;
    const matchedSkillLabels: string[] = [];
    for (const sk of normalizedSkills) {
      if (sk && hayLower.includes(sk)) {
        matchedSkillsCount += 1;
        if (matchedSkillLabels.length < 4) matchedSkillLabels.push(sk);
      }
    }
    const skillRatio = normalizedSkills.length > 0 ? matchedSkillsCount / normalizedSkills.length : 0.5;

    let roleHit = false;
    for (const role of normalizedRoles) {
      if (!role) continue;
      const roleWords = role.split(/\s+/).filter((w) => w.length >= 3);
      if (roleWords.length > 0 && roleWords.every((w) => job.normalized_title.includes(w))) {
        roleHit = true;
        break;
      }
    }
    const skillOverlapScore = Math.min(1, skillRatio * 0.65 + (roleHit ? 0.35 : 0));

    // Location & workplace compatibility (0..1)
    let locationFitScore = 0.6;
    const reasons: string[] = [];

    if (job.workplace_type === 'REMOTE') {
      locationFitScore = preferredModes.size === 0 || preferredModes.has('REMOTE') ? 1.0 : 0.75;
      reasons.push('Remote-friendly workplace');
    } else {
      const countryMatch =
        (job.country_code && preferredCountries.has(job.country_code.toUpperCase())) ||
        (job.country_codes ?? []).some((c) => preferredCountries.has(c.toUpperCase()));
      const cityMatch = preferredLocationsLower.some(
        (loc) => loc && (job.location_raw ?? '').toLowerCase().includes(loc),
      );
      if (countryMatch || cityMatch) {
        locationFitScore = 1.0;
        reasons.push(`Matches preferred location (${job.location_raw ?? job.country_code})`);
      } else if (preferredCountries.size > 0 || preferredLocationsLower.length > 0) {
        locationFitScore = 0.25;
      }
    }

    if (preferredModes.size > 0 && job.workplace_type !== 'UNKNOWN' && !preferredModes.has(job.workplace_type)) {
      locationFitScore *= 0.65;
    }

    // Compensation alignment (0..1, neutral 0.7 when salary is undisclosed)
    let compFit = 0.7;
    if (
      params.profile.minAnnualSalary &&
      job.salary_max != null &&
      job.salary_period === 'YEAR' &&
      (!params.profile.salaryCurrency || job.salary_currency === params.profile.salaryCurrency)
    ) {
      compFit = job.salary_max >= params.profile.minAnnualSalary ? 1.0 : 0.35;
    }

    // Trust & First-Mover Advantage bonus (0..1)
    let trustAndExclusivityBonus = (job.composite_confidence / 100) * 0.5;
    if (job.exclusivity_tier === 'FIRST_PARTY_EXCLUSIVE') {
      trustAndExclusivityBonus += 0.5;
      reasons.push('Posted directly on Jobiest by a verified employer');
    } else if (job.exclusivity_tier === 'FIRST_MOVER_EXCLUSIVE') {
      trustAndExclusivityBonus += 0.42;
      reasons.push('First-mover direct employer discovery (not yet syndicated)');
    } else if (job.exclusivity_tier === 'EARLY_DIRECT') {
      trustAndExclusivityBonus += 0.3;
      reasons.push('Discovered directly on employer ATS ahead of job aggregators');
    }

    if (roleHit) reasons.unshift(`Direct title match for ${job.title}`);
    if (matchedSkillLabels.length > 0) {
      reasons.push(`Matched skills: ${matchedSkillLabels.join(', ')}`);
    }
    if (job.requires_human_form_review) {
      reasons.push('External application form: requires your review before applying');
    }

    const weighted =
      rawCos * 40 +
      skillOverlapScore * 25 +
      locationFitScore * 15 +
      compFit * 10 +
      Math.min(1, trustAndExclusivityBonus) * 10;

    const matchScore = Math.max(1, Math.min(99, Math.round(weighted)));

    results.push({
      opportunity: toPublicRadarJobDTO(job),
      matchScore,
      semanticSimilarity: Number(rawCos.toFixed(4)),
      skillOverlapScore: Number(skillOverlapScore.toFixed(4)),
      locationFitScore: Number(locationFitScore.toFixed(4)),
      trustAndExclusivityBonus: Number(Math.min(1, trustAndExclusivityBonus).toFixed(4)),
      matchReasons: reasons.slice(0, 4),
    });
  }

  results.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.trustAndExclusivityBonus - a.trustAndExclusivityBonus;
  });

  return results.slice(0, params.limit ?? 50);
}
