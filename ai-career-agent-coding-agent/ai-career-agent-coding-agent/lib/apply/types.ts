/**
 * Controlled application-automation contracts (Phase 8).
 *
 * A "site apply adapter" knows ONE ATS form (Greenhouse, Lever, …). It fills
 * the form from an `ApplyCandidate` and either submits (SUBMITTED) or stops
 * with a `StopCode` + human message. Adapters never bypass a stop condition —
 * CAPTCHA, anti-bot, sign-in challenges and unparseable forms always STOP.
 *
 * `ApplyPage` is a narrow, fakeable view of a browser page so adapters and the
 * engine are unit-testable without launching Chromium. `workers/browser` is
 * the only place a real Playwright page is bound to this interface.
 */

export type StopCode =
  | 'CAPTCHA'
  | 'ANTI_BOT'
  | 'AUTH_CHALLENGE'
  | 'UNSUPPORTED_FORM'
  | 'UNSUPPORTED_PLATFORM'
  | 'MISSING_INFO'
  | 'TRUTHFULNESS_ISSUE'
  | 'POLICY_RESTRICTED'
  | 'SUBMIT_UNCLEAR';

export type ApplyOutcome =
  | { outcome: 'SUBMITTED'; confirmation: string; url: string }
  | { outcome: 'STOP'; code: StopCode; message: string };

/** Everything the adapter needs to fill and submit one application. */
export interface ApplyCandidate {
  jobUrl: string;
  company: string;
  title: string;
  email: string;
  /** Full name from the profile (may be null → MISSING_INFO). */
  name: string | null;
  /** Phone — the schema has no phone field today, so this is usually null. */
  phone: string | null;
  /** Local path to the CV file on the browser worker (materialised from cvDownloadUrl). */
  cvPath: string | null;
  /** Signed storage URL the browser worker downloads to build cvPath. */
  cvDownloadUrl: string | null;
  coverLetter: string | null;
  answers: { question: string; answer: string }[];
}

/** Minimal, fakeable view of a browser page. */
export interface ApplyPage {
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  has(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<void>;
  check(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
  setInputFiles(selector: string, files: string[]): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  goto(url: string): Promise<void>;
}

export interface SiteApplyAdapter {
  /** Stable id, e.g. 'greenhouse'. */
  id: string;
  /** Human label for reports and messages. */
  label: string;
  /** Allowlisted hostnames (exact or subdomain) for SSRF scoping. */
  domains: string[];
  /** First-pass: does this URL belong to a form this adapter understands? */
  matches(url: URL): boolean;
  /** Fill + submit. Returns SUBMITTED or STOP — never throws for a stop. */
  apply(page: ApplyPage, candidate: ApplyCandidate): Promise<ApplyOutcome>;
}
