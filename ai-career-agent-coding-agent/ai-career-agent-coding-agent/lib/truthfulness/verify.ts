import type { Claim, TruthfulProfile, TruthfulnessReport, VerificationInput } from './types';
import { extractCredentials, extractMetrics, matchesAny, norm } from './extract';

/**
 * Deterministic truthfulness verifier (ARCHITECTURE §2, the AI is never the
 * sole authority for truthfulness). Given the model's claimed entities and the
 * generated text, it checks every claim against the verified profile facts:
 *
 *  - employers / schools: every claimed entity must exist in the profile
 *    (hard failure if not, fabricated employers/schools are disqualifying);
 *  - metrics: every percentage / multiplier / currency amount in the text must
 *    appear in the profile's source text (catches "increased revenue by 45%"
 *    that the candidate never stated);
 *  - credentials: any certification claim must be grounded in the profile;
 *  - skills: an unknown skill is suspicious (informational, not a hard fail).
 *
 * Pure + side-effect free → fully unit-testable.
 */
export function verifyDocument(
  input: VerificationInput,
  profile: TruthfulProfile,
): TruthfulnessReport {
  const supported: Claim[] = [];
  const unsupported: Claim[] = [];
  const suspicious: Claim[] = [];

  // --- Employers ---
  for (const e of input.claimedEmployers ?? []) {
    if (matchesAny(e, profile.employers)) {
      supported.push({ category: 'employer', value: e });
    } else {
      unsupported.push({
        category: 'employer',
        value: e,
        reason: `"${e}" is not in the candidate's experience.`,
      });
    }
  }

  // --- Schools ---
  for (const s of input.claimedSchools ?? []) {
    if (matchesAny(s, profile.schools)) {
      supported.push({ category: 'school', value: s });
    } else {
      unsupported.push({
        category: 'school',
        value: s,
        reason: `"${s}" is not in the candidate's education.`,
      });
    }
  }

  // --- Skills (lenient: unknown skill = suspicious, not a hard fail) ---
  for (const sk of input.claimedSkills ?? []) {
    if (matchesAny(sk, profile.skills)) {
      supported.push({ category: 'skill', value: sk });
    } else {
      suspicious.push({
        category: 'skill',
        value: sk,
        reason: `"${sk}" is not listed in the candidate's skills.`,
      });
    }
  }

  // --- Metrics (percentages / multipliers / currency) ---
  const profileText = [profile.summary, profile.experienceText, profile.skills.join(' '), profile.schools.join(' ')].join(' ');
  const profileMetrics = new Set(extractMetrics(profileText));
  for (const m of extractMetrics(input.text)) {
    if (profileMetrics.has(m)) {
      supported.push({ category: 'metric', value: m });
    } else {
      unsupported.push({
        category: 'metric',
        value: m,
        reason: `Quantitative claim "${m}" is not supported by the profile.`,
      });
    }
  }

  // --- Credentials ---
  const profileHas = (kw: string) => norm(profileText).includes(norm(kw));
  const credClaims = extractCredentials(input.text);
  // A specific acronym (aws/pmp/...) is the real claim; the generic "certified"
  // marker is considered grounded if the profile contains "certified" OR any
  // specific credential is grounded, to avoid double-flagging "AWS certified".
  const specificSupported = credClaims.filter((c) => c !== 'certified' && profileHas(c));
  for (const c of credClaims) {
    const grounded = c === 'certified' ? profileHas('certified') || specificSupported.length > 0 : profileHas(c);
    if (grounded) {
      supported.push({ category: 'credential', value: c });
    } else {
      unsupported.push({
        category: 'credential',
        value: c,
        reason: `Certification "${c}" is not supported by the profile.`,
      });
    }
  }

  const passed = unsupported.length === 0;
  const summary = passed
    ? suspicious.length
      ? `Passed with ${suspicious.length} unverified skill(s) to review.`
      : 'All claims are supported by the profile.'
    : `${unsupported.length} unsupported claim(s) detected, not persisted.`;

  return { supported, unsupported, suspicious, passed, summary };
}
