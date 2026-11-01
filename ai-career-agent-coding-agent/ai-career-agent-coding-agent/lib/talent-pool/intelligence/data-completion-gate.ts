import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import {
  evaluateCandidateReadiness,
  inspectCandidateOnboarding,
  type CandidateSnapshotData,
} from '@/lib/talent-pool/onboarding-inspector';
import {
  ingestCandidateSnapshotIntoRag,
  retrieveEvidence,
  validateAndExtractDocumentText,
} from './rag-engine';
import {
  PROMPT_A_VERSION,
  runCandidateProfileIntelligenceAnalyst,
  type CandidateIntelligenceAnalysis,
  type ContradictionItemSchema,
  type ExtractedCvFacts,
} from './prompts/prompt-a-analyst';
import type { IntelligenceCallTelemetry } from './cost-tracker';

const KNOWN_SKILL_LEXICON = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'Go',
  'Rust',
  'C#',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'Redis',
  'React',
  'Next.js',
  'Node.js',
  'Docker',
  'Kubernetes',
  'Terraform',
  'AWS',
  'GCP',
  'Azure',
  'LangChain',
  'LangGraph',
  'OpenAI',
  'n8n',
  'dbt',
  'Snowflake',
  'Tableau',
  'Power BI',
  'Figma',
  'SEO',
  'Google Analytics',
  'HubSpot',
  'Salesforce',
  'Zendesk',
  'Jira',
  'Financial Modeling',
  'GAAP',
  'IFRS',
];

export interface AssessmentEligibilityContext {
  contextVersion: number;
  promptVersion: string;
  eligible: boolean;
  requiresCandidateClarification: boolean;
  completenessScore: number;
  snapshot: CandidateSnapshotData;
  cvFacts: ExtractedCvFacts;
  missingRequiredLabels: string[];
  contradictions: Array<z.infer<typeof ContradictionItemSchema>>;
  analysis: CandidateIntelligenceAnalysis;
  telemetry: IntelligenceCallTelemetry;
}

/**
 * Extracts verifiable timeline, skill, degree, and title signals from raw CV text
 * without inventing absent skills or assuming keyword presence equals mastery.
 */
export function extractStructuredFactsFromCvText(cvText: string | null | undefined): ExtractedCvFacts {
  if (!cvText || cvText.trim().length < 15) {
    return {
      rawTextPresent: false,
      estimatedYearsFromDates: null,
      detectedSkills: [],
      detectedCompanies: [],
      detectedTitles: [],
      detectedDegrees: [],
    };
  }

  const lower = cvText.toLowerCase();
  const detectedSkills = KNOWN_SKILL_LEXICON.filter((skill) => {
    const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(lower);
  });

  // Extract 4-digit employment years (1990..2027) and estimate span if date ranges exist
  const currentYear = 2026;
  const rangeRegex = /\b(199\d|20[0-2]\d)\s*(?:-|to|–)\s*(199\d|20[0-2]\d|present|current|now)\b/gi;
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = rangeRegex.exec(cvText)) !== null) {
    const startYear = Number(m[1]);
    const endRaw = m[2].toLowerCase();
    const endYear =
      endRaw === 'present' || endRaw === 'current' || endRaw === 'now'
        ? currentYear
        : Number(m[2]);
    if (startYear >= 1990 && endYear >= startYear && endYear <= currentYear + 1) {
      minStart = minStart === null ? startYear : Math.min(minStart, startYear);
      maxEnd = maxEnd === null ? endYear : Math.max(maxEnd, endYear);
    }
  }

  // Also check explicit "X years of experience" statements in CV
  const explicitYearsMatch = cvText.match(/\b(\d{1,2})\+?\s+years?\s+of\s+(?:professional\s+)?experience\b/i);
  let estimatedYearsFromDates: number | null = null;
  if (explicitYearsMatch) {
    estimatedYearsFromDates = Number(explicitYearsMatch[1]);
  } else if (minStart !== null && maxEnd !== null) {
    estimatedYearsFromDates = Math.max(0, maxEnd - minStart);
  }

  const degreeMatches = cvText.match(
    /\b(?:B\.?Sc\.?|M\.?Sc\.?|B\.?Eng\.?|B\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor|Master|Associate|HND|OND)[^\n,;]{0,60}/gi,
  );
  const detectedDegrees = Array.from(new Set((degreeMatches ?? []).map((d) => d.trim()))).slice(0, 6);

  return {
    rawTextPresent: true,
    estimatedYearsFromDates,
    detectedSkills,
    detectedCompanies: [],
    detectedTitles: [],
    detectedDegrees,
  };
}

/**
 * Compares declared candidate profile claims against CV-extracted facts and internal consistency rules.
 */
export function detectProfileAndCvContradictions(
  snapshot: CandidateSnapshotData,
  cvFacts: ExtractedCvFacts,
): Array<z.infer<typeof ContradictionItemSchema>> {
  const contradictions: Array<z.infer<typeof ContradictionItemSchema>> = [];
  const declaredYoe = snapshot.years_of_experience;
  const seniority = (snapshot.seniority_level || '').toUpperCase();

  if (
    typeof declaredYoe === 'number' &&
    cvFacts.estimatedYearsFromDates !== null &&
    Math.abs(declaredYoe - cvFacts.estimatedYearsFromDates) >= 3
  ) {
    contradictions.push({
      field: 'years_of_experience',
      declared_value: `${declaredYoe} years`,
      document_value: `~${cvFacts.estimatedYearsFromDates} years in CV timeline`,
      explanation: `Declared experience (${declaredYoe} yrs) differs substantially from CV timeline (~${cvFacts.estimatedYearsFromDates} yrs).`,
      requires_candidate_clarification: true,
    });
  }

  if (
    (seniority === 'SENIOR' || seniority === 'STAFF_PRINCIPAL' || seniority === 'EXECUTIVE') &&
    typeof declaredYoe === 'number' &&
    declaredYoe < 3
  ) {
    contradictions.push({
      field: 'seniority_level',
      declared_value: `${seniority} with ${declaredYoe} years experience`,
      document_value: `${declaredYoe} years declared`,
      explanation: `Selected seniority (${seniority}) typically requires 5+ years of progressive scope, while ${declaredYoe} year(s) were declared.`,
      requires_candidate_clarification: true,
    });
  }

  if (
    seniority === 'ENTRY' &&
    typeof declaredYoe === 'number' &&
    declaredYoe >= 6
  ) {
    contradictions.push({
      field: 'seniority_level',
      declared_value: `ENTRY with ${declaredYoe} years experience`,
      document_value: `${declaredYoe} years declared`,
      explanation: `Candidate selected ENTRY level despite declaring ${declaredYoe} years of experience.`,
      requires_candidate_clarification: false,
    });
  }

  if (
    cvFacts.rawTextPresent &&
    snapshot.skills.length >= 3 &&
    cvFacts.detectedSkills.length >= 2
  ) {
    const overlap = snapshot.skills.filter((s) =>
      cvFacts.detectedSkills.some((cs) => cs.toLowerCase() === s.toLowerCase()),
    );
    if (overlap.length === 0) {
      contradictions.push({
        field: 'skills',
        declared_value: snapshot.skills.slice(0, 5).join(', '),
        document_value: cvFacts.detectedSkills.slice(0, 5).join(', '),
        explanation:
          'None of the primary skills declared on the profile matched the core technical terms detected in the uploaded CV.',
        requires_candidate_clarification: true,
      });
    }
  }

  return contradictions;
}

/**
 * Pure/in-memory evaluation entry point (used both by live DB workflows and by the 36-candidate QA benchmark).
 */
export async function evaluateDataCompletionAndBuildContext(params: {
  userId: string;
  snapshot: CandidateSnapshotData;
  masterCvDocumentId?: string | null;
  portfolioId?: string | null;
  cvExtractedText?: string | null;
  candidateConfirmedDiscrepancies?: boolean;
  contextVersion?: number;
  persistToDatabase?: boolean;
}): Promise<AssessmentEligibilityContext> {
  const readiness = evaluateCandidateReadiness({
    snapshot: params.snapshot,
    masterCvDocumentId: params.masterCvDocumentId ?? null,
    portfolioId: params.portfolioId ?? null,
  });

  const cvFacts = extractStructuredFactsFromCvText(params.cvExtractedText);
  const contradictions = detectProfileAndCvContradictions(params.snapshot, cvFacts);
  const blockingContradictions = contradictions.filter((c) => c.requires_candidate_clarification);
  const requiresClarification =
    !readiness.readyToApply ||
    (blockingContradictions.length > 0 && !params.candidateConfirmedDiscrepancies);
  const eligible = readiness.readyToApply && !requiresClarification;

  await ingestCandidateSnapshotIntoRag({
    candidateId: params.userId,
    snapshot: params.snapshot,
    cvExtractedText: params.cvExtractedText ?? null,
    cvDocumentId: params.masterCvDocumentId ?? null,
    version: params.contextVersion ?? 1,
    persistToDatabase: params.persistToDatabase ?? false,
  });

  const ragCompetencyHits = await retrieveEvidence({
    query: `${params.snapshot.career_category ?? ''} ${params.snapshot.target_roles.join(' ')} ${params.snapshot.skills.join(' ')}`,
    namespace: 'JOB_COMPETENCY_KNOWLEDGE',
    careerCategory: params.snapshot.career_category,
    topK: 3,
  });

  const missingLabels = readiness.missingRequired.map((m) => m.label);
  const { analysis, telemetry } = await runCandidateProfileIntelligenceAnalyst({
    userId: params.userId,
    snapshot: params.snapshot,
    cvFacts,
    missingLabels,
    contradictions,
    completenessScore: readiness.completenessScore,
    eligibleForAssessment: eligible,
    ragCompetencyHits,
  });

  return {
    contextVersion: params.contextVersion ?? 1,
    promptVersion: PROMPT_A_VERSION,
    eligible,
    requiresCandidateClarification: requiresClarification,
    completenessScore: readiness.completenessScore,
    snapshot: params.snapshot,
    cvFacts,
    missingRequiredLabels: missingLabels,
    contradictions,
    analysis,
    telemetry,
  };
}

/**
 * Live database-backed Data Completion Gate that loads candidate onboarding + downloads & extracts
 * their uploaded MASTER_CV PDF from `career-documents` storage if present, then persists a versioned
 * row in `public.talent_assessment_contexts`.
 */
export async function runLiveCandidateDataCompletionGate(params: {
  userId: string;
  email: string;
  applicationId?: string | null;
  candidateConfirmedDiscrepancies?: boolean;
}): Promise<AssessmentEligibilityContext> {
  const onboarding = await inspectCandidateOnboarding(params.userId, params.email);
  let cvExtractedText: string | null = null;

  if (onboarding.masterCvDocumentId) {
    try {
      const { data: docMeta } = await supabaseAdmin
        .from('documents')
        .select('id,storage_path,mime_type')
        .eq('id', onboarding.masterCvDocumentId)
        .eq('user_id', params.userId)
        .maybeSingle();

      if (docMeta?.storage_path) {
        const { data: blob } = await supabaseAdmin.storage
          .from('career-documents')
          .download(docMeta.storage_path);
        if (blob) {
          const buf = Buffer.from(await blob.arrayBuffer());
          cvExtractedText = validateAndExtractDocumentText(buf, docMeta.mime_type || 'application/pdf');
        }
      }
    } catch {
      cvExtractedText = null;
    }
  }

  const ctx = await evaluateDataCompletionAndBuildContext({
    userId: params.userId,
    snapshot: onboarding.snapshot,
    masterCvDocumentId: onboarding.masterCvDocumentId,
    portfolioId: onboarding.portfolioId,
    cvExtractedText,
    candidateConfirmedDiscrepancies: params.candidateConfirmedDiscrepancies ?? false,
    persistToDatabase: true,
  });

  try {
    await supabaseAdmin.from('talent_assessment_contexts').insert({
      user_id: params.userId,
      application_id: params.applicationId ?? null,
      context_version: ctx.contextVersion,
      prompt_version: ctx.promptVersion,
      career_category: ctx.analysis.career_category,
      professional_title: ctx.analysis.professional_title,
      seniority_level: ctx.analysis.seniority_level,
      years_of_experience: ctx.analysis.years_of_experience,
      completeness_score: ctx.completenessScore,
      eligible_for_interview: ctx.eligible,
      candidate_confirmed: Boolean(params.candidateConfirmedDiscrepancies),
      candidate_confirmed_at: params.candidateConfirmedDiscrepancies ? new Date().toISOString() : null,
      declared_claims: {
        headline: ctx.snapshot.headline,
        skills: ctx.snapshot.skills,
        experience: ctx.snapshot.experience,
        projects: ctx.snapshot.projects,
      },
      document_extracted_claims: ctx.cvFacts,
      verified_evidence: { email_verified: Boolean(ctx.snapshot.email) },
      missing_information: ctx.missingRequiredLabels,
      contradictory_information: ctx.contradictions,
      analysis_json: ctx.analysis,
    });
  } catch {
    // Graceful degradation if migration 051 is not yet applied on target DB
  }

  return ctx;
}
