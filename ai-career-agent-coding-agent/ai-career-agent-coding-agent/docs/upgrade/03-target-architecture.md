# 03 · Target architecture (Phase 2)

Date: 2026-09-23 · Principle: evolve the working system; no rewrites, no
new backend, no new vendor while the current one holds.

## 1. What stays (verified working)

Next.js on Vercel; Supabase Postgres + GoTrue + Storage; Resend email;
Oracle AI gateway; isolated Playwright browser worker (Oracle primary,
Render standby, failover in lib/apply/client.ts); Paystack + Flutterwave
hosted checkout with idempotent apply_verified_payment; the deterministic
adapter set (Workable, Greenhouse, Lever, Ashby); CI (gitleaks, verify,
production e2e smoke).

## 2. New subsystems

### 2.1 Entitlements and usage ledger (replaces daily counters)

- Table usage_ledger, append-only: id, user_id, resource_type
  (DOCUMENT | AUTO_APPLY | PORTFOLIO), delta, operation (GRANT | RESERVE |
  CONSUME | RELEASE | EXPIRE | ADJUST), period_id, idempotency_key unique,
  reference (transaction / application id), created_at.
- Table credit_periods: id, user_id, kind (CALENDAR | SUBSCRIPTION),
  starts_at, ends_at, source (plan code or FREE), subscription reference.
  Free period = calendar month in Africa/Lagos. Paid period = verified
  subscription interval.
- Materialized balances view (reserves held, consumed this period,
  remaining) computed from the ledger; never stored as a mutable counter.
- Server-authoritative only. All consumption flows through one DB function
  family with row locks (same pattern as today's trackGeneration), called
  by API routes and the engine, never by the client.
- Fair use for Max: disclosed cap (see decision D1), enforced as a limit
  with a clear error code, plus anomaly alerts.
- Cutover: run ledger and legacy counters in parallel behind a feature
  flag, then flip enforcement, then retire usage_daily after one clean
  billing cycle.

### 2.2 Mandatory onboarding gate (85%)

- Weighted completion algorithm in lib/profile-completeness.ts, extended:
  personal, objective/target roles, education, experience, skills,
  projects, preferences, application profile; optional and
  not-applicable answers count as addressed without forcing invention.
- Server-side gate helper requireOnboarded() used by protected APIs
  (documents generate, applications target/submit/auto-submit, portfolio
  create, preferences mode). Returns ONBOARDING_REQUIRED with the missing
  sections; the UI routes to the wizard step.
- Applies to accounts created after the feature ships (decision D6).
  Wizard autosaves per step; resumable; completion recalculated on the
  server only.

### 2.3 Free auto-apply activation

- Paystack card verification, purpose=ADD_CARD, zero amount, no recurring
  consent. Provider-hosted collection; webhook verified with signature +
  reference + event dedupe (same patterns as the existing webhook); only
  then insert an activation record and GRANT 5 AUTO_APPLY credits for the
  current calendar period via the ledger.
- Activation UI states: terms first (what is granted, what is not, that
  the card is never charged), then verification, then remaining-credit
  display with reset date.

### 2.4 Auto-Apply 2.0 (reliability, not replacement)

- Application status machine extended to: queued, running,
  awaiting_user_input, awaiting_verification, submitted, failed,
  uncertain, cancelled. Uncertain means the submit outcome could not be
  verified; never auto-resubmit an uncertain application; surface it for
  human resolution.
- Submission verification layer per adapter: explicit success signal
  (confirmation text, application reference, or known response shape)
  required before marking submitted. A click is not a submission.
- Deduplication: unique partial index on applications(user_id, job_id)
  where status not in (REJECTED, WITHDRAWN); idempotency key stays.
- Instrumentation (absorbs the pilot scorecard initiative): per-run
  outcomes, per-adapter success/failure/uncertainty, failure reasons,
  latency, AI cost; internal dashboard page (admin-scoped).
- Stagehand AI fallback: post-instrumentation PoC inside workers/browser
  behind ENGINE_AI_FALLBACK flag; assists unknown fields only; cost
  ceiling per application; never final submit.

### 2.5 Portfolio Studio

- Table portfolios: id, user_id, format (DOCUMENT | WEB), slug unique,
  template, content jsonb, visibility (PUBLIC | UNLISTED | PRIVATE),
  published_at, created_at, updated_at. Slug = normalized name with
  collision suffix (philip-opeyemi, philip-opeyemi-7k2m); DB unique
  constraint; rename leaves a 301 redirect row.
- Public pages at jobiest.com/portfolio/[slug], server-rendered with
  caching; no user auth to view PUBLIC; sitemap + social metadata.
- Document portfolios reuse the Resume Studio PDF export stack (20-template
  infrastructure); no watermark.
- HTML export: sanitized static bundle (no scripts, no secrets, no
  internal data; CSP headers on export; user content escaped).
- Limits from the ledger (PORTFOLIO resource type); downgrade preserves
  existing portfolios, restricts new ones.

### 2.6 Application Command Center

- Dashboard extension: profile completion, plan, credits remaining per
  resource, activation state, recent documents and portfolios, application
  pipeline by status with filters, clear distinction between prepared,
  submitted, and verified.

## 3. Security posture (carried forward, extended)

Untrusted inputs: job descriptions, page content, uploaded documents,
exported HTML. Prompt-injection containment in the engine (page content
never enters system prompts; sensitive-question gate unchanged). SSRF
guards unchanged in the worker. New surface (public portfolio pages)
gets rate limiting, sanitization, sitemap abuse controls, and an
allowlisted public route in the security baseline test. Threat model
document (06) accompanies each milestone.

## 4. Deployment and rollback

Every milestone ships behind flags where behavior changes (ledger
enforcement, gate, engine fallback). Migrations are additive with rollback
notes; no destructive migration without owner confirmation. CI gates
unchanged: gitleaks, typecheck + tests + build, production e2e smoke
(extended per milestone with new route assertions).
