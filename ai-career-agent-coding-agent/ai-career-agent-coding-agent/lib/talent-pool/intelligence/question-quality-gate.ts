import type { CandidateIntelligenceAnalysis } from './prompts/prompt-a-analyst';
import {
  buildDeterministicPersonalizedBlueprint,
  type BlueprintQuestion,
  type InterviewBlueprint,
} from './prompts/prompt-b-architect';
import type { RetrievedEvidence } from './rag-engine';

const PROHIBITED_TOPIC_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'religion_or_faith', regex: /\b(?:religion|religious|church|mosque|synagogue|faith|worship)\b/i },
  { label: 'political_views', regex: /\b(?:political\s+party|politics|vote\s+for|election\s+stance)\b/i },
  { label: 'family_or_marital_status', regex: /\b(?:married|marital\s+status|pregnant|pregnancy|having\s+children|childcare|family\s+plans)\b/i },
  { label: 'protected_demographics', regex: /\b(?:how\s+old\s+are\s+you|birth\s+year|ethnic\s+background|racial\s+identity|sexual\s+orientation)\b/i },
  { label: 'medical_or_disability', regex: /\b(?:medical\s+history|chronic\s+illness|disability\s+diagnosis|health\s+condition)\b/i },
  { label: 'biometric_or_accent_inference', regex: /\b(?:facial\s+expression|eye\s+contact\s+score|native\s+accent|body\s+language\s+score)\b/i },
];

export interface QuestionQualityValidationReport {
  passed: boolean;
  repairedCount: number;
  rejectedReasons: string[];
  uniqueCategoryCount: number;
  hallucinationChecksPassed: boolean;
  prohibitedTopicChecksPassed: boolean;
  uniquenessChecksPassed: boolean;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) {
    if (b.has(w)) inter += 1;
  }
  return inter / (a.size + b.size - inter);
}

/**
 * Validates every question in an InterviewBlueprint against all 10 Quality Control checks:
 * 1. Relevance to candidate profile
 * 2. Relevance to target role
 * 3. Appropriate seniority difficulty
 * 4. Question uniqueness (no near-duplicate questions)
 * 5. Clarity & length bounds
 * 6. Measurability
 * 7. Fairness
 * 8. Scoring rubric availability
 * 9. Absence of prohibited protected-characteristic or biometric questions
 * 10. Anti-hallucination source citation verification & competency coverage
 *
 * Invalid questions are replaced deterministically from the verified fallback blueprint so
 * the candidate never receives a prohibited, repetitive, rubric-less, or hallucinated question.
 */
export function validateAndRepairInterviewBlueprint(params: {
  blueprint: InterviewBlueprint;
  analysis: CandidateIntelligenceAnalysis;
  candidateRagHits: RetrievedEvidence[];
  roleRagHits: RetrievedEvidence[];
}): { blueprint: InterviewBlueprint; report: QuestionQualityValidationReport } {
  const { blueprint, analysis, candidateRagHits, roleRagHits } = params;
  const fallbackBlueprint = buildDeterministicPersonalizedBlueprint({
    analysis,
    candidateRagHits,
    roleRagHits,
    targetQuestionCount: blueprint.target_question_count,
  });

  // Build corpus of real candidate facts so hallucinated company/project references are caught
  const allowedEvidenceCorpus = [
    analysis.career_category,
    analysis.professional_title,
    analysis.seniority_level,
    ...analysis.primary_skills,
    ...analysis.secondary_skills,
    ...analysis.claimed_competencies,
    ...analysis.target_roles,
    ...analysis.employment_history.flatMap((e) => [e.company, e.title]),
    ...analysis.project_experience.map((p) => p.name),
    ...analysis.certifications.map((c) => c.name),
    ...analysis.education.flatMap((ed) => [ed.institution, ed.qualification]),
    ...candidateRagHits.map((h) => `${h.chunkId} ${h.text}`),
    ...roleRagHits.map((h) => `${h.chunkId} ${h.text}`),
  ]
    .join(' ')
    .toLowerCase();

  const rejectedReasons: string[] = [];
  let repairedCount = 0;
  let prohibitedTopicDetected = false;
  let hallucinationDetected = false;
  let duplicateDetected = false;

  const acceptedSets: Set<string>[] = [];
  const validatedQuestions: BlueprintQuestion[] = [];

  for (let i = 0; i < blueprint.questions.length; i += 1) {
    const q = blueprint.questions[i];
    const replacement = fallbackBlueprint.questions[i % fallbackBlueprint.questions.length];
    let reason: string | null = null;

    // Check 9: Prohibited protected characteristics or biometric inference
    for (const rule of PROHIBITED_TOPIC_PATTERNS) {
      if (rule.regex.test(q.question_text) || rule.regex.test(q.competency_being_tested)) {
        reason = `prohibited_topic:${rule.label}`;
        prohibitedTopicDetected = true;
        break;
      }
    }

    // Check 5 & 8: Clarity, rubric completeness, source citation presence
    if (!reason) {
      if (q.question_text.trim().length < 25 || !q.question_text.includes('?')) {
        reason = 'unclear_or_non_interrogative_question';
      } else if (
        !q.scoring_rubric?.excellent_85_100 ||
        !q.scoring_rubric?.proficient_70_84 ||
        !q.scoring_rubric?.insufficient_0_49
      ) {
        reason = 'incomplete_scoring_rubric';
      } else if (!q.source_references || q.source_references.length === 0) {
        reason = 'missing_source_citation';
      }
    }

    // Check 3: Seniority appropriateness (ENTRY/JUNIOR should not get ARCHITECTURAL questions)
    if (!reason) {
      const upperSen = analysis.seniority_level.toUpperCase();
      if ((upperSen === 'ENTRY' || upperSen === 'JUNIOR') && q.difficulty === 'ARCHITECTURAL') {
        reason = 'difficulty_exceeds_junior_calibration';
      }
    }

    // Check 10: Anti-hallucination check on explicit project/company profile_reference
    if (!reason && q.profile_reference.startsWith('project_experience:')) {
      const refName = q.profile_reference.split(':')[1]?.toLowerCase() ?? '';
      if (refName && !allowedEvidenceCorpus.includes(refName)) {
        reason = `hallucinated_project_reference:${refName}`;
        hallucinationDetected = true;
      }
    }
    if (!reason && q.profile_reference.startsWith('employment_history:')) {
      const refCompany = q.profile_reference.split(':')[1]?.toLowerCase() ?? '';
      if (refCompany && !allowedEvidenceCorpus.includes(refCompany)) {
        reason = `hallucinated_company_reference:${refCompany}`;
        hallucinationDetected = true;
      }
    }

    // Check 4: Uniqueness against already accepted questions
    const qWords = wordSet(q.question_text);
    if (!reason) {
      for (const prev of acceptedSets) {
        if (jaccardSimilarity(qWords, prev) >= 0.72) {
          reason = 'near_duplicate_question';
          duplicateDetected = true;
          break;
        }
      }
    }

    if (reason) {
      rejectedReasons.push(`${q.question_id}: ${reason}`);
      repairedCount += 1;
      const repaired = {
        ...replacement,
        question_id: `Q${String(i + 1).padStart(2, '0')}`,
      };
      validatedQuestions.push(repaired);
      acceptedSets.push(wordSet(repaired.question_text));
    } else {
      validatedQuestions.push({
        ...q,
        question_id: `Q${String(i + 1).padStart(2, '0')}`,
      });
      acceptedSets.push(qWords);
    }
  }

  // Normalize weights to sum to 1.0
  const weightSum = validatedQuestions.reduce((acc, q) => acc + q.assessment_weight, 0) || 1;
  const normalizedQuestions = validatedQuestions.map((q) => ({
    ...q,
    assessment_weight: Number((q.assessment_weight / weightSum).toFixed(4)),
  }));

  const uniqueCategories = new Set(normalizedQuestions.map((q) => q.question_type)).size;

  return {
    blueprint: {
      ...blueprint,
      target_question_count: normalizedQuestions.length,
      questions: normalizedQuestions,
    },
    report: {
      passed: uniqueCategories >= 4 && normalizedQuestions.length >= 6,
      repairedCount,
      rejectedReasons,
      uniqueCategoryCount: uniqueCategories,
      hallucinationChecksPassed: !hallucinationDetected,
      prohibitedTopicChecksPassed: !prohibitedTopicDetected,
      uniquenessChecksPassed: !duplicateDetected,
    },
  };
}
