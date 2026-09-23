# 05 · Final report: Enterprise upgrade M0-M7, go-live

Date: 2026-09-23 · All milestones built and tested. Production database is
fully migrated (001-040). Code deployment is blocked ONLY by credentials
(GitHub push token missing from this session; Vercel token lacks project
scope) - see section F. Every commit is local, tested, and ready to push.

## A. Assumption register (what was assumed vs verified)

- The Vercel project deploys from GitHub pushes (verified: 7704812, 8c75837,
  259bcc4 all reached production via that path).
- `AUTOMATION_SUBMIT_ENABLED=true` in production env (verified via
  docs/GO_LIVE_CHECKLIST.md, set 2026-09-08); the approval-default policy
  still gates every automated send.
- `PAYSTACK_SECRET_KEY` is set in production (verified indirectly: the
  subscriptions flow is live; the checklist shows Paystack as the active
  provider). The live webhook endpoint is the same route M3 extended.
- Zero applications exist in production today (verified read-only), so the
  dedup index (039) created cleanly and no user-visible state changed.

## B. What shipped, milestone by milestone

- M1 (earlier): weighted onboarding gate, armed by code default for accounts
  created on/after 2026-09-23.
- M2: credit ledger (037) + DOCUMENT-path meter integration + AUTO_APPLY
  wiring at engine outcome level + nightly period grants. ENFORCEMENT IS NOW
  ARMED BY CODE DEFAULT (go-live). Monthly matrix per D1: documents
  5/10/15/100-fair-use; auto-apply 0 (5 after activation) /20/30/50.
- M3: free auto-apply activation. Paystack purpose=ADD_CARD zero-amount
  verification (initialize by access code, 3DS on Paystack's page,
  `zero_charge_authorization.success` webhook with signature + replay dedup
  + server-side re-verification, idempotent `apply_card_activation` grant of
  5 AUTO_APPLY credits per month). No recurring consent: the card can never
  be charged through us. Activation UI at /auto-apply/activation with
  plain-language terms and remaining credits. HONEST DEVIATION: Paystack's
  verification endpoint requires card details to transit our server (TLS,
  in-memory only, never stored or logged, only last4/brand/bank persisted);
  subscription payments remain fully provider-hosted.
- M4: submission verification layer (no SUBMITTED without an explicit
  confirmation signal; otherwise AWAITING_VERIFICATION, never auto-retried);
  extended statuses (AWAITING_VERIFICATION, AWAITING_USER_INPUT, CANCELLED)
  with withdraw support; unique partial dedup index (039); admin pilot
  scorecard at /admin/applications (per-adapter attempts/submitted/stopped/
  unconfirmed, stop reasons, median task latency, documents per submission);
  honest /supported-systems page generated from the adapter registry;
  pricing copy updated to the real monthly matrix (closes the
  investor-circulation overclaim risk). Stagehand PoC intentionally NOT
  started: the plan requires two weeks of instrumentation data first.
- M5: Resume Studio profile-aware pass (prefill + first-incomplete-section
  skip, extracted to testable lib), no-watermark guarantee test across all
  70 templates, explicit copy that editing/re-downloading never uses a
  credit (verified by route test: download makes no ledger rpc).
- M6: Portfolio Studio (040): slugs with previous-slug permanent redirects,
  3 templates, PRIVATE/UNLISTED/PUBLIC visibility, plan record limits
  1/5/10/26 on subscription_plans.portfolio_limit, PDF export (shared
  renderer) + fully escaped standalone HTML export, public pages at
  /portfolio/<slug>, PUBLIC-only sitemap entries, onboarding gate on create.
- M7: Command Center dashboard (pipeline split prepared / checking send /
  submitted / verified, ledger credits per resource, activation state,
  portfolio presence, deterministic suggestions); rate limits on every new
  route (enforced by the security-baseline test); docs refresh (README,
  runbook, DEPLOY); this report.

## C. Database state (production, verified read-only after each apply)

- 037: credit_periods / credit_ledger / credit_holds + 7 functions; plan
  matrix columns live. Grants ISSUED once manually (2 profiles -> 2 DOCUMENT
  grants; the nightly cron re-runs it idempotently at 06:30 UTC).
- 038: auto_apply_activations + activation grant functions; FREE calendar
  grants now consult activation state.
- 039: dedup cleanup (no-op, 0 rows) + applications_user_job_active_uidx.
- 040: portfolios + previous-slug unique index + portfolio_limit matrix
  (1/5/10/26). RLS enabled on every new table, no policies (service-role
  only, the pattern of 027).

## D. Test evidence

- tsc: 0 errors. Suite: 918 passed + 1 skipped (was 849 at the session
  start; +69 tests across M3-M7).
- New suites: auto-apply-activation (13), auto-apply-m4 (11),
  resume-studio-m5 (8), portfolio-studio (14), plus updates to credits,
  credits-auto-apply, apply-task, apply-adapters, apply-ashby, sources-ats,
  homepage-autopilot (truth pins updated to the new matrix), copy-guard,
  security-baseline (all routes rate-limited, jargon-free copy).
- The security-baseline test enforces: auth on every new API route, rate
  limits on every route, RLS on every migration table.

## E. Security posture (new surface)

- Public portfolio page: server-side render of structured data only; no
  dangerouslySetInnerHTML anywhere; storage-time sanitizer + React escaping
  + export-time escaping; UNLISTED = noindex and excluded from sitemap;
  PRIVATE = 404. Slug enumeration is blunted by random suffixes.
- Activation: card data never logged, stored, or echoed; error messages are
  deliberately vague; 5 attempts/hour; webhook re-verifies with Paystack and
  refuses non-zero amounts routed through the verification event.
- Ledger: all functions SECURITY DEFINER with pinned search_path, advisory
  transaction locks against double-spend, append-only ledger with unique
  idempotency keys.

## F. Deployment status (the one open item)

Everything is committed locally (HEAD ready at the M7 commit). Production
deploys automatically from GitHub pushes, but this sandbox session lost the
GitHub credential (it lives in git-config paths that do not persist), and
the renewed Vercel token authenticates but lacks project scope (403 on
/api.vercel.com project endpoints). ONE of the following unblocks the
deploy: (1) paste a repo-scoped GitHub PAT (preferred; also restores CI),
or (2) issue a Vercel token with the project's scope. Until then,
production runs M2-slice-2 code (259bcc4) with all migrations applied; the
armed-by-default enforcement only takes effect once this code deploys.

## G. Known limitations, stated honestly

- The e2e double-spend test and the synthetic 1000-user ledger load test
  are NOT run: per the owner's standing rule, no reserve/consume
  round-trips against real production accounts, and no dedicated test
  account exists yet. The SQL is lock-guarded and unit-tested; the e2e
  remains open until the test account is provided.
- Paystack live webhook confirmation is still an outstanding owner action
  (test-mode events verified by design; the endpoint is the same one
  subscriptions already use).
- Stagehand PoC deferred by plan (needs two weeks of scorecard data).
- usage_daily/usage_lifetime retirement deferred until the ledger has run
  as the enforced system for a clean cycle.

## H. Outstanding owner actions

1. Paste a repo-scoped GitHub PAT (or a properly scoped Vercel token) so
   this release can deploy.
2. Confirm the Paystack live webhook (dashboard -> webhooks) receives
   `zero_charge_authorization.success` and `card_verification.failed`.
3. Create the dedicated e2e test account (offer already standing) for the
   double-spend and activation round-trip tests.
4. Prior list (Oracle trial decision before 2026-10-07, GSC/DMARC, screen
   recording, LinkedIn browser test) still stands.

## I. Rollback procedures

- Credit enforcement: set `ENTITLEMENTS_LEDGER=false` (env, once Vercel
  scope works; or revert the default in lib/credits.ts and redeploy).
  Legacy counters are still maintained, so the old entitlement path works
  immediately.
- Automated submissions: `AUTOMATION_SUBMIT_ENABLED=false` (already the
  documented kill switch).
- Activation flow: stop using the page; grants are idempotent and additive;
  no forced migration rollback needed.
- All migrations are additive; no destructive operation was performed at
  any point (per standing owner rule).
