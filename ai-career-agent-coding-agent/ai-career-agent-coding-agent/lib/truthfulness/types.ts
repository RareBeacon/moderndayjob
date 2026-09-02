/** Source-of-truth profile facts the truthfulness checker verifies against. */
export interface TruthfulProfile {
  summary?: string | null;
  skills: string[];
  /** Company names from experience entries. */
  employers: string[];
  /** Institution names from education entries. */
  schools: string[];
  /** Joined experience descriptions, a source of legitimate numbers/metrics. */
  experienceText: string;
}

export type ClaimCategory =
  | 'employer'
  | 'school'
  | 'skill'
  | 'metric'
  | 'credential';

export interface Claim {
  category: ClaimCategory;
  /** The value as it appears (e.g. "Google", "40%", "AWS Certified"). */
  value: string;
  /** Why it was flagged, for unsupported/suspicious claims. */
  reason?: string;
}

export interface TruthfulnessReport {
  /** Claims that match a verified profile fact. */
  supported: Claim[];
  /** Claims with NO matching profile fact → would fail strict acceptance. */
  unsupported: Claim[];
  /** Claims that may be inflated but are not hard failures (e.g. an unknown skill). */
  suspicious: Claim[];
  /** True when no unsupported employers/schools/metrics remain. */
  passed: boolean;
  summary: string;
}

/**
 * What the verifier checks. The generation service extracts these from the
 * model's structured output (CV) or its `references` manifest (cover/answers).
 */
export interface VerificationInput {
  claimedEmployers?: string[];
  claimedSchools?: string[];
  claimedSkills?: string[];
  /** Free text to scan for fabricated quantitative claims. */
  text: string;
}
