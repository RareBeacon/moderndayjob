# 04 · Implementation plan (the build order)

Date: 2026-09-23 · Rule: no milestone starts on pricing, entitlements, or
payments before the owner confirms decisions D1-D6 (00-owner-decisions.md).

Sequencing follows the directive's own recommended order, adapted to what
the audit found: the credit ledger is the dependency for activation,
portfolios, and the quota parts of Auto-Apply 2.0, so it goes first after
onboarding; the engine itself is NOT replaced, it is instrumented and
hardened.

## Milestone 0 · Baseline and cleanup (this session) · DONE

- Android client erased per owner directive (mobile/, android.yml,
  /api/plans + tests); recoverable in history.
- Audit (01), research (02), architecture (03), this plan, and the
  decisions document (00) committed.
- Decisions requested from the owner (end of this session).

## Milestone 1 · Onboarding gate + weighted completion (no decisions needed)

Status: slice 1 (weights, N/A migration 036, server gate on five routes, 14
tests) and slice 2 (wizard N/A checkboxes, required-mode dashboard setup for
the gated cohort, ONBOARDING_REQUIRED handling at every gated call site,
schema + route tests) shipped 2026-09-23. Flag armed in production for
accounts created on/after 2026-09-23.

Scope:
- Extend lib/profile-completeness.ts to the weighted 8-section model with
  optional / not-applicable handling; server-side recalculation only.
- requireOnboarded() helper wired into: documents/generate, applications
  target + submit + auto-submit, portfolio create (M6), preferences/mode.
- Wizard autosave per step, resume, and step routing from gate errors.
- Grandfathering per D6: gate new accounts only; completion prompt for
  existing accounts.

Tests: unit (completion math, gate helper), API tests (gate blocks
below-threshold users on each protected route; existing users unaffected),
e2e (signup -> verify -> incomplete blocked -> complete -> unlocked).
Migration: none (computation over existing tables).
Rollback: gate returns pass-through via flag.

## Milestone 2 · Usage ledger + monthly credits (blocked by D1, D4)

Status: slice 1 SHIPPED 2026-09-23 (migration 037 applied to production;
ledger client + meter integration on the DOCUMENT path + pipeline grant
step). Ledger is in PARALLEL-RUN: tables populated daily, nothing enforced
until the ENTITLEMENTS_LEDGER flip (by code default, same pattern as the
onboarding gate, because the Vercel token is expired). Slice 2 remains:
AUTO_APPLY wiring at engine outcome level, dashboards, enforcement flip
after a clean observation cycle, retire usage_daily.

Scope:
- usage_ledger + credit_periods tables + balances view (03 §2.1), with
  GRANT/RESERVE/CONSUME/RELEASE/EXPIRE/ADJUST operations, idempotency
  keys, row-locked functions. [shipped as credit_ledger + credit_holds +
  credit_periods; EXPIRE dropped per D1 accumulate/never-expire rule]
- Monthly grant job (calendar periods, Africa/Lagos) + subscription-period
  grants driven by apply_verified_payment. [shipped as
  credit_ensure_period_grants called by the daily pipeline; subscription
  periods derive from subscriptions.current_period_*]
- Plan matrix per confirmed D1 (5/10/15/100-fair-use documents;
  5-after-activation/20/30/50 auto-apply; portfolios in M6). [shipped:
  subscription_plans.monthly_*_credits columns, matrix live]
- Parallel-run against usage_daily behind ENTITLEMENTS_LEDGER flag; flip
  enforcement after a clean cycle; retire old counters later.
- Plan cards + /api/plans-style public data updated to the confirmed
  matrix (website, pricing copy, tests kept in sync; claims match
  implementation). [remaining: pricing copy lives in M5 website work]

Tests: concurrency (double-spend), reservation release on failure, period
boundaries, upgrade/downgrade/cancellation/refund paths, e2e credit
exhaustion and reset. [shipped: tests/credits.test.ts covers flag
defaulting, rpc shapes, exhaustion mapping, meter reserve/commit/refund in
both flag states; SQL-level concurrency is guarded by advisory locks +
unique holds, e2e with a dedicated test account remains open]
Acceptance: a script firing N parallel generations cannot exceed the
period allowance by one; every ledger row is auditable. [to be exercised
on the dedicated test account before the enforcement flip]

## Milestone 3 · Free auto-apply activation (blocked by D2, D3)

Scope:
- Paystack card verification flow (purpose=ADD_CARD, zero amount, no
  recurring consent), provider-hosted collection only.
- Webhook handling reusing the existing verified-event patterns; activation
  record; ledger GRANT of 5 AUTO_APPLY credits for the period.
- Activation UI with plain-language terms and remaining-credit display.

Tests: webhook signature/replay/dedup, grant idempotency, entitlement
enforcement of the 5, e2e activation -> application -> credit accounting.
Rollback: activation flow off; auto-apply stays plan-gated.

## Milestone 4 · Auto-Apply 2.0 reliability + instrumentation (partially unblocked)

The engine is kept, not replaced. Scope:
- Extended status machine incl. uncertain + awaiting_verification +
  awaiting_user_input + cancelled; never auto-resubmit uncertain.
- Submission verification layer per adapter (explicit success signal
  required).
- Deduplication unique partial index (user_id, job_id).
- Instrumentation dashboard (admin): per-adapter success/failure/
  uncertainty, failure reasons, latency, AI cost per completed
  application. This is the pilot scorecard, permanently installed.
- Honest supported-systems page + Auto-policy boundary copy fix (closes
  the investor-circulation overclaim).
- Stagehand PoC only AFTER instrumentation has two weeks of data, inside
  workers/browser behind ENGINE_AI_FALLBACK, unknown fields only, cost
  ceiling, never final submit.

Tests: adapter fixtures for verification signals; uncertain-state
transitions; dedupe races; injection fixtures (page content cannot alter
engine behavior); e2e approval flow unchanged.

## Milestone 5 · Resume Studio profile-aware pass

Scope: flow loads the career profile and asks only missing or role-specific
questions; regenerate-vs-edit clarity (editing and re-downloading never
consume a new credit; only successful new generation does, via the
ledger); no-watermark verification on all templates; PDF output tests
already exist and stay green.

## Milestone 6 · Portfolio Studio (blocked by D1 portfolio limits, D5)

Scope: portfolios table + slugs + public pages + templates (start with 3,
reuse the 20-template infra where sensible) + PDF export + sanitized HTML
export + visibility + ledger-enforced limits + sitemap/metadata +
rename redirects. Security-baseline allowlist entry for the public
portfolio route.

Tests: slug collision + uniqueness, sanitization (XSS fixtures), export
safety (no secrets), limit enforcement, e2e create -> publish -> view.

## Milestone 7 · Command Center + hardening + rollout

Scope: dashboard per 03 §2.6; security test pass (threat model 06 items);
rate-limit and capacity review under the 1000-user mandate; load test of
ledger contention; staged rollout with flags; documentation refresh
(README, runbook, DEPLOY); final report per the directive's format
A-I.

## Cross-milestone rules

- Every commit passes the existing CI (gitleaks, tsc, tests, build) and
  the production e2e smoke after deploy.
- Migrations additive; rollback notes mandatory; no destructive db or git
  operations without owner confirmation.
- Zero em dashes in product copy; layman's language in user-facing text;
  no invented stats or testimonials; claims match implementation.
- Standing hard lines stay: no board passwords, no logged-in sessions, no
  Easy Apply or Indeed Apply mass submit, no scraping, approval default,
  email after every automated submission.

## Open user actions that intersect this plan

- Oracle trial decision before 2026-10-07 (worker host economics).
- Supervised go-live of AUTOMATION_SUBMIT_ENABLED (owner flips when ready;
  Milestone 4 instrumentation makes the decision data-driven).
- Paystack live-webhook confirmation already outstanding from earlier.
