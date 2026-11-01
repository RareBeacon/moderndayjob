import { createHash } from 'node:crypto';
import {
  EXTERNAL_FORM_MECHANISMS,
  type ApplyMechanism,
  type EmployerVerificationStatus,
  type JobVerificationStatus,
  type RadarPostingInput,
  type VacancyAuthenticityStatus,
} from '../types';

/**
 * Evidence-Backed Verification & 3-Axis Scam/Fraud Engine (Condition 2)
 *
 * Non-negotiable architectural invariants:
 * 1. An AI confidence score can NEVER certify an employer or mark a job verified.
 *    `AI_RISK_ADVISORY_ONLY` inputs can only attach risk flags and reduce scores
 *    (`scoreDelta <= 0`); they never flip `verifiedByDeterministicEvidence` to true.
 * 2. Employer identity (`employerVerificationStatus`) is evaluated separately from
 *    vacancy authenticity (`vacancyAuthenticityStatus`) and application destination
 *    safety (`applicationSafetyScore`).
 * 3. Every piece of verification evidence carries deterministic provenance (`evidenceKind`,
 *    `isDeterministic`, `evidenceSummary`, `evidenceHash`).
 */

export type VerificationEvidenceKind =
  | 'FIRST_PARTY_ORG_APPROVAL'
  | 'CORPORATE_DOMAIN_LINKS_TO_ATS'
  | 'OFFICIAL_ATS_PUBLIC_API_ATTESTATION'
  | 'DNS_HTTPS_DOMAIN_RESOLUTION'
  | 'MX_RECORD_PRESENT'
  | 'SCHEMA_ORG_ORGANIZATION_MATCH'
  | 'FORM_DOMAIN_MISMATCH'
  | 'UPFRONT_FEE_OR_PAYMENT_REQUEST'
  | 'SENSITIVE_NATIONAL_ID_REQUEST'
  | 'BRAND_IMPERSONATION_SIGNAL'
  | 'OFF_PLATFORM_MESSENGER_LURE'
  | 'AI_RISK_ADVISORY_ONLY';

export interface VerificationEvidenceItem {
  evidenceKind: VerificationEvidenceKind;
  isDeterministic: boolean;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  scoreDelta: number;
  evidenceSummary: string;
  evidenceHash: string;
}

export interface DeterministicEmployerFacts {
  firstPartyVerifiedOrgId?: string | null;
  corporateDomain?: string | null;
  corporateDomainLinksToAtsBoard?: boolean;
  domainResolvesHttps?: boolean;
  mxRecordPresent?: boolean;
  schemaOrgOrganizationMatched?: boolean;
}

export interface AIAdvisorySignal {
  /** Advisory suspicion flags from an LLM classifier; NEVER allowed to add positive trust. */
  advisoryFlags: string[];
  penaltyPoints: number;
  rationale: string;
}

export interface VerificationAssessment {
  employerVerificationStatus: EmployerVerificationStatus;
  vacancyAuthenticityStatus: VacancyAuthenticityStatus;
  verificationStatus: JobVerificationStatus;
  verifiedByDeterministicEvidence: boolean;
  employerLegitimacyScore: number;
  jobAuthenticityScore: number;
  applicationSafetyScore: number;
  compositeConfidence: number;
  requiresHumanFormReview: boolean;
  riskFlags: string[];
  evidence: VerificationEvidenceItem[];
}

const PROTECTED_GLOBAL_BRANDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  google: ['google.com', 'alphabet.com', 'deepmind.google'],
  microsoft: ['microsoft.com', 'github.com', 'linkedin.com'],
  apple: ['apple.com'],
  amazon: ['amazon.com', 'amazon.jobs', 'aws.amazon.com'],
  meta: ['meta.com', 'metacareers.com', 'facebook.com'],
  stripe: ['stripe.com'],
  openai: ['openai.com'],
  anthropic: ['anthropic.com'],
  cloudflare: ['cloudflare.com'],
  coinbase: ['coinbase.com'],
  flutterwave: ['flutterwave.com'],
  paystack: ['paystack.com'],
});

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'yandex.com',
  'mail.ru',
]);

const FEE_SCAM_PATTERNS: readonly { code: string; re: RegExp; summary: string }[] = [
  {
    code: 'UPFRONT_APPLICATION_FEE',
    re: /\b(application|processing|registration|onboarding|training|background\s+check|security\s+clearance)\s+(fee|deposit|payment|charge)\b/i,
    summary: 'Listing text references an upfront application, training, or processing fee.',
  },
  {
    code: 'EQUIPMENT_PURCHASE_SCAM',
    re: /\b(pay\s+for|purchase\s+your\s+own|reimburse\s+you\s+after\s+buying)\s+(laptop|macbook|equipment|software\s+license|starter\s+kit)\b/i,
    summary: 'Listing requests upfront equipment purchase or check-reimbursement scheme.',
  },
  {
    code: 'CRYPTO_OR_WIRE_PAYMENT_REQUEST',
    re: /\b(send\s+usdt|crypto\s+wallet\s+deposit|western\s+union\s+transfer|moneygram\s+fee|wire\s+deposit)\b/i,
    summary: 'Listing mentions cryptocurrency deposit or wire-transfer fee.',
  },
];

const SENSITIVE_ID_PATTERNS: readonly { code: string; re: RegExp; summary: string }[] = [
  {
    code: 'SENSITIVE_GOVERNMENT_ID_ON_APPLY',
    re: /\b(provide|enter|upload|submit)\s+(your\s+)?(social\s+security\s+number|ssn|bvn|bank\s+verification\s+number|national\s+identification\s+number|nin|passport\s+scan|bank\s+account\s+pin|credit\s+card\s+number)\b/i,
    summary: 'Initial application asks for SSN, BVN, NIN, passport scan, or banking credentials.',
  },
];

const MESSENGER_LURE_PATTERNS: readonly { code: string; re: RegExp; summary: string }[] = [
  {
    code: 'OFF_PLATFORM_MESSENGER_APPLY',
    re: /\b(apply|contact\s+hr|message\s+hiring\s+manager|send\s+cv)\s+(only\s+)?(via|on|through)\s+(whatsapp|telegram|signal)\b/i,
    summary: 'Listing directs candidates to apply via WhatsApp, Telegram, or Signal.',
  },
];

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function makeEvidence(
  kind: VerificationEvidenceKind,
  isDeterministic: boolean,
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
  scoreDelta: number,
  summary: string,
  uniqueSalt: string,
): VerificationEvidenceItem {
  // Enforce DB constraint in code too: AI_RISK_ADVISORY_ONLY can never be positive!
  const safeDirection = kind === 'AI_RISK_ADVISORY_ONLY' ? (scoreDelta < 0 ? 'NEGATIVE' : 'NEUTRAL') : direction;
  const safeDelta = kind === 'AI_RISK_ADVISORY_ONLY' ? Math.min(0, scoreDelta) : scoreDelta;
  const safeDet = kind === 'AI_RISK_ADVISORY_ONLY' ? false : isDeterministic;

  return {
    evidenceKind: kind,
    isDeterministic: safeDet,
    direction: safeDirection,
    scoreDelta: safeDelta,
    evidenceSummary: summary,
    evidenceHash: createHash('sha256').update(`${kind}¦${summary}¦${uniqueSalt}`, 'utf8').digest('hex'),
  };
}

function extractFreeEmailMention(text: string): string | null {
  const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) ?? [];
  for (const m of emailMatches) {
    const at = m.lastIndexOf('@');
    const domain = m.slice(at + 1).toLowerCase();
    if (FREE_EMAIL_DOMAINS.has(domain)) return domain;
  }
  return null;
}

export function evaluateOpportunityVerification(params: {
  posting: RadarPostingInput;
  applyMechanism: ApplyMechanism;
  employerFacts?: DeterministicEmployerFacts;
  formInspection?: {
    requestsPaymentOrFee?: boolean;
    requestsSensitiveId?: boolean;
    requiresLogin?: boolean;
    domainMatchesEmployer?: boolean;
  } | null;
  aiAdvisory?: AIAdvisorySignal | null;
}): VerificationAssessment {
  const { posting, applyMechanism, employerFacts, formInspection, aiAdvisory } = params;
  const evidence: VerificationEvidenceItem[] = [];
  const riskFlags = new Set<string>();

  let employerScore = 40;
  let jobScore = 45;
  let appSafetyScore = EXTERNAL_FORM_MECHANISMS.has(applyMechanism) ? 55 : 75;

  let hasDeterministicEmployerProof = false;
  let hasDeterministicVacancyProof = false;
  let impersonationDetected = false;
  let hardScamRejected = false;
  let quarantineTriggered = false;

  // 1) Deterministic Employer Identity Evidence
  if (employerFacts?.firstPartyVerifiedOrgId) {
    hasDeterministicEmployerProof = true;
    hasDeterministicVacancyProof = true;
    employerScore += 55;
    jobScore += 45;
    appSafetyScore += 20;
    evidence.push(
      makeEvidence(
        'FIRST_PARTY_ORG_APPROVAL',
        true,
        'POSITIVE',
        55,
        `Verified Jobiest Employer Organization (${employerFacts.firstPartyVerifiedOrgId}).`,
        employerFacts.firstPartyVerifiedOrgId,
      ),
    );
  }

  if (employerFacts?.corporateDomainLinksToAtsBoard && employerFacts.corporateDomain) {
    hasDeterministicEmployerProof = true;
    employerScore += 35;
    jobScore += 20;
    evidence.push(
      makeEvidence(
        'CORPORATE_DOMAIN_LINKS_TO_ATS',
        true,
        'POSITIVE',
        35,
        `Verified corporate domain ${employerFacts.corporateDomain} links directly to source ${posting.sourceId}.`,
        `${employerFacts.corporateDomain}:${posting.sourceId}`,
      ),
    );
  }

  if (employerFacts?.domainResolvesHttps && employerFacts.corporateDomain) {
    employerScore += 10;
    evidence.push(
      makeEvidence(
        'DNS_HTTPS_DOMAIN_RESOLUTION',
        true,
        'POSITIVE',
        10,
        `Corporate domain ${employerFacts.corporateDomain} resolves over public HTTPS.`,
        employerFacts.corporateDomain,
      ),
    );
  }

  if (employerFacts?.mxRecordPresent && employerFacts.corporateDomain) {
    employerScore += 5;
    evidence.push(
      makeEvidence(
        'MX_RECORD_PRESENT',
        true,
        'POSITIVE',
        5,
        `Corporate domain ${employerFacts.corporateDomain} publishes active MX records.`,
        employerFacts.corporateDomain,
      ),
    );
  }

  if (employerFacts?.schemaOrgOrganizationMatched) {
    hasDeterministicEmployerProof = true;
    employerScore += 15;
    evidence.push(
      makeEvidence(
        'SCHEMA_ORG_ORGANIZATION_MATCH',
        true,
        'POSITIVE',
        15,
        'Employer career page Organization/JobPosting JSON-LD matches canonical domain.',
        posting.url,
      ),
    );
  }

  // 2) Deterministic Source & Vacancy Attestation
  if (posting.discoveryOrigin === 'DIRECT_ATS_API') {
    hasDeterministicVacancyProof = true;
    jobScore += 30;
    employerScore += 15;
    appSafetyScore += 15;
    evidence.push(
      makeEvidence(
        'OFFICIAL_ATS_PUBLIC_API_ATTESTATION',
        true,
        'POSITIVE',
        30,
        `Fetched directly from official ${posting.providerKey} board endpoint (${posting.sourceId}).`,
        `${posting.sourceId}:${posting.externalId}`,
      ),
    );
  } else if (posting.discoveryOrigin === 'DIRECT_EMPLOYER_CAREER_PAGE' && employerFacts?.corporateDomain) {
    hasDeterministicVacancyProof = true;
    jobScore += 25;
  }

  // 3) Deterministic Brand-Impersonation, Fee Scam & Sensitive-ID Checks
  const combinedText = `${posting.title}\n${posting.descriptionPlain}`;
  const freeMailDomain = extractFreeEmailMention(combinedText);
  const companyNorm = posting.companyName.trim().toLowerCase();

  for (const [brand, officialDomains] of Object.entries(PROTECTED_GLOBAL_BRANDS)) {
    if (companyNorm === brand || companyNorm.startsWith(`${brand} `)) {
      const externalForm = EXTERNAL_FORM_MECHANISMS.has(applyMechanism);
      const domainOk =
        employerFacts?.corporateDomain &&
        officialDomains.some(
          (d) =>
            employerFacts.corporateDomain!.toLowerCase() === d ||
            employerFacts.corporateDomain!.toLowerCase().endsWith(`.${d}`),
        );
      if ((externalForm && !domainOk) || freeMailDomain) {
        impersonationDetected = true;
        quarantineTriggered = true;
        employerScore -= 60;
        jobScore -= 55;
        appSafetyScore -= 60;
        riskFlags.add('BRAND_IMPERSONATION_SUSPECTED');
        evidence.push(
          makeEvidence(
            'BRAND_IMPERSONATION_SIGNAL',
            true,
            'NEGATIVE',
            -60,
            `Protected brand '${brand}' referenced with unverified form/contact (${freeMailDomain ?? applyMechanism}).`,
            `${brand}:${posting.url}`,
          ),
        );
      }
    }
  }

  if (freeMailDomain && EXTERNAL_FORM_MECHANISMS.has(applyMechanism)) {
    riskFlags.add(`FREE_EMAIL_CONTACT_${freeMailDomain.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`);
    employerScore -= 20;
    appSafetyScore -= 20;
    evidence.push(
      makeEvidence(
        'FORM_DOMAIN_MISMATCH',
        true,
        'NEGATIVE',
        -20,
        `External application uses consumer email provider (${freeMailDomain}).`,
        `${posting.url}:${freeMailDomain}`,
      ),
    );
  }

  for (const rule of FEE_SCAM_PATTERNS) {
    if (rule.re.test(combinedText)) {
      hardScamRejected = true;
      riskFlags.add(rule.code);
      jobScore = 0;
      appSafetyScore = 0;
      evidence.push(
        makeEvidence('UPFRONT_FEE_OR_PAYMENT_REQUEST', true, 'NEGATIVE', -100, rule.summary, `${rule.code}:${posting.url}`),
      );
    }
  }

  for (const rule of SENSITIVE_ID_PATTERNS) {
    if (rule.re.test(combinedText)) {
      quarantineTriggered = true;
      riskFlags.add(rule.code);
      appSafetyScore -= 65;
      jobScore -= 40;
      evidence.push(
        makeEvidence('SENSITIVE_NATIONAL_ID_REQUEST', true, 'NEGATIVE', -65, rule.summary, `${rule.code}:${posting.url}`),
      );
    }
  }

  for (const rule of MESSENGER_LURE_PATTERNS) {
    if (rule.re.test(combinedText)) {
      quarantineTriggered = true;
      riskFlags.add(rule.code);
      appSafetyScore -= 50;
      jobScore -= 35;
      evidence.push(
        makeEvidence('OFF_PLATFORM_MESSENGER_LURE', true, 'NEGATIVE', -50, rule.summary, `${rule.code}:${posting.url}`),
      );
    }
  }

  if (formInspection?.requestsPaymentOrFee) {
    hardScamRejected = true;
    riskFlags.add('FORM_REQUESTS_PAYMENT_OR_FEE');
    appSafetyScore = 0;
    jobScore = 0;
    evidence.push(
      makeEvidence(
        'UPFRONT_FEE_OR_PAYMENT_REQUEST',
        true,
        'NEGATIVE',
        -100,
        'Inspected external form contains a payment, fee, or deposit field.',
        `form-fee:${posting.applyUrl ?? posting.url}`,
      ),
    );
  }

  if (formInspection?.requestsSensitiveId) {
    quarantineTriggered = true;
    riskFlags.add('FORM_REQUESTS_SENSITIVE_ID');
    appSafetyScore = Math.min(appSafetyScore, 15);
    evidence.push(
      makeEvidence(
        'SENSITIVE_NATIONAL_ID_REQUEST',
        true,
        'NEGATIVE',
        -70,
        'Inspected external form asks for national ID, SSN, BVN, NIN, or bank credentials.',
        `form-id:${posting.applyUrl ?? posting.url}`,
      ),
    );
  }

  // 4) Optional AI Advisory Signal (Strictly downgrade/flag only - NEVER certifies!)
  if (aiAdvisory && (aiAdvisory.penaltyPoints > 0 || aiAdvisory.advisoryFlags.length > 0)) {
    const penalty = Math.min(50, Math.max(0, Math.round(aiAdvisory.penaltyPoints)));
    jobScore -= penalty;
    appSafetyScore -= Math.round(penalty * 0.5);
    for (const flag of aiAdvisory.advisoryFlags) {
      if (flag.trim()) riskFlags.add(`AI_ADVISORY_${flag.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`);
    }
    if (penalty >= 35) quarantineTriggered = true;
    evidence.push(
      makeEvidence(
        'AI_RISK_ADVISORY_ONLY',
        false,
        penalty > 0 ? 'NEGATIVE' : 'NEUTRAL',
        -penalty,
        aiAdvisory.rationale.slice(0, 280),
        `ai:${posting.url}:${aiAdvisory.advisoryFlags.join(',')}`,
      ),
    );
  }

  const finalEmployerScore = clampScore(employerScore);
  const finalJobScore = clampScore(jobScore);
  const finalSafetyScore = clampScore(appSafetyScore);
  const compositeConfidence = Math.floor(
    (finalEmployerScore * 35 + finalJobScore * 35 + finalSafetyScore * 30) / 100,
  );

  // Separate Employer Verification Status vs Vacancy Authenticity Status (Condition 2)
  let employerVerificationStatus: EmployerVerificationStatus;
  if (impersonationDetected) {
    employerVerificationStatus = 'IMPERSONATION_QUARANTINED';
  } else if (employerFacts?.firstPartyVerifiedOrgId) {
    employerVerificationStatus = 'FIRST_PARTY_VERIFIED';
  } else if (hasDeterministicEmployerProof) {
    employerVerificationStatus = 'EVIDENCE_VERIFIED';
  } else if (posting.discoveryOrigin === 'DIRECT_ATS_API') {
    employerVerificationStatus = 'DOMAIN_EVIDENCE_PENDING';
  } else {
    employerVerificationStatus = 'UNVERIFIED';
  }

  let vacancyAuthenticityStatus: VacancyAuthenticityStatus;
  if (hardScamRejected) {
    vacancyAuthenticityStatus = 'SCAM_REJECTED';
  } else if (quarantineTriggered) {
    vacancyAuthenticityStatus = 'SUSPICIOUS_QUARANTINE';
  } else if (employerFacts?.firstPartyVerifiedOrgId) {
    vacancyAuthenticityStatus = 'FIRST_PARTY_POSTED';
  } else if (hasDeterministicEmployerProof && hasDeterministicVacancyProof) {
    vacancyAuthenticityStatus = 'DOMAIN_CORROBORATED';
  } else if (hasDeterministicVacancyProof) {
    vacancyAuthenticityStatus = 'SOURCE_ATTESTED';
  } else {
    vacancyAuthenticityStatus = 'UNVERIFIED';
  }

  const verifiedByDeterministicEvidence =
    !hardScamRejected &&
    !quarantineTriggered &&
    !impersonationDetected &&
    (hasDeterministicEmployerProof || hasDeterministicVacancyProof);

  let verificationStatus: JobVerificationStatus;
  if (hardScamRejected) {
    verificationStatus = 'SCAM_REJECTED';
  } else if (quarantineTriggered || impersonationDetected) {
    verificationStatus = 'SUSPICIOUS_QUARANTINE';
  } else if (EXTERNAL_FORM_MECHANISMS.has(applyMechanism)) {
    verificationStatus = 'UNVERIFIED_EXTERNAL_FORM';
  } else if (
    verifiedByDeterministicEvidence &&
    (vacancyAuthenticityStatus === 'FIRST_PARTY_POSTED' || vacancyAuthenticityStatus === 'DOMAIN_CORROBORATED') &&
    compositeConfidence >= 75
  ) {
    verificationStatus = 'VERIFIED_HIGH_TRUST';
  } else if (
    verifiedByDeterministicEvidence &&
    vacancyAuthenticityStatus === 'SOURCE_ATTESTED' &&
    compositeConfidence >= 60
  ) {
    verificationStatus = 'VERIFIED_STANDARD';
  } else {
    verificationStatus = 'PENDING_VERIFICATION';
  }

  const requiresHumanFormReview =
    EXTERNAL_FORM_MECHANISMS.has(applyMechanism) ||
    verificationStatus === 'UNVERIFIED_EXTERNAL_FORM' ||
    verificationStatus === 'PENDING_VERIFICATION' ||
    verificationStatus === 'SUSPICIOUS_QUARANTINE' ||
    verificationStatus === 'SCAM_REJECTED' ||
    riskFlags.size > 0;

  return {
    employerVerificationStatus,
    vacancyAuthenticityStatus,
    verificationStatus,
    verifiedByDeterministicEvidence,
    employerLegitimacyScore: finalEmployerScore,
    jobAuthenticityScore: finalJobScore,
    applicationSafetyScore: finalSafetyScore,
    compositeConfidence,
    requiresHumanFormReview,
    riskFlags: [...riskFlags],
    evidence,
  };
}
