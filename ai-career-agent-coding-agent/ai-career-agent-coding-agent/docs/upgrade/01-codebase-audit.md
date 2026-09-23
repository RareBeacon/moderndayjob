# 01 · Codebase audit (Phase 0)

Date: 2026-09-23 · Commit at audit time: c1525b0 (plus the mobile-client
removal commit that follows this document) · Auditor: coding agent

Method: direct inspection of the repository, migrations, routes, workers,
and test suite, plus a live test baseline. No assumptions from the upgrade
directive were accepted without verification; corrections are flagged
inline.

## 1. Stack (verified)

- Web: Next.js App Router, TypeScript, deployed on Vercel (project
  "modernjob"). Production https://jobiest.com. CI on push to main:
  gitleaks secret scan, Typecheck + Tests + Build, Playwright e2e smoke
  against production (waits for the deploy's commit SHA to appear in
  /api/health).
- Database + auth: Supabase (Postgres, RLS on every table, GoTrue auth
  with cookie sessions, TOTP MFA, admin API). Native-client Bearer auth
  path on 35 API routes (kept after the mobile client removal: it is
  generic API infrastructure).
- Email: Resend (noreply@jobiest.com, support@jobiest.com).
- AI: Oracle Cloud gateway at https://ai.jobiest.com (workers/api), token
  authenticated, /healthz liveness.
- Browser automation: isolated Playwright worker (workers/browser) that
  runs ONLY outside the Vercel runtime. Primary host: Oracle VM
  https://worker.jobiest.com (always-on, 2 OCPU / 12 GB). Standby: Render
  free tier. Failover logic in lib/apply/client.ts probes /healthz and
  falls through; all workers down means a safe STOP, never a retry storm.
  Prior decision documented in docs/RENDER_VS_ORACLE_AUTOMATION_STUDY.md.
- Payments: Paystack (primary) and Flutterwave, hosted checkout, webhook
  signature verification, idempotent apply_verified_payment DB function,
  transaction-reference guards.

Correction to the directive's framing: the directive describes the current
Auto-Apply as "browser automation that opens job pages". Reality is more
specific and better: a deterministic adapter layer (Workable, Greenhouse,
Lever, Ashby) with the Playwright worker as the isolated execution host,
SSRF-guarded navigation, fresh context per submission, stop-conditions for
CAPTCHA/logins/unsupported sites, sensitive-question gates, and snapshots.
No scraping of LinkedIn or Indeed anywhere (board links only, built from
the user's own preferences).

## 2. Current product surface (verified)

- Auth flows: signup with full name + E.164 phone + password policy +
  email verification + welcome email; password reset; MFA (TOTP) enroll,
  verify, disable; admin panel with reveal/suspend/terminate/signout.
- Onboarding: a multi-step wizard at /onboarding. Profile completeness is
  computed (lib/profile-completeness.ts) but there is NO hard gate: an
  email-verified user can use the product below any threshold. The 85%
  gate in the directive is new work.
- Career profile: profiles (target roles, status) + career_profiles
  (headline, summary, experience, skills, education, projects, links).
  Shared by generation already; Portfolio Studio does not exist yet.
- Resume Studio: /generate flow plus /api/resume-studio/{ai,draft,
  generate,photo}; 20-template master catalog with PDF and DOCX export and
  photo support, covered by export tests. Document generation is
  profile-grounded and truthfulness-checked; deterministic-only mode
  exists.
- Applications: job-link intake (/api/applications/target), manual
  tracking, list + detail with package documents and timeline; actions
  approve / reject / withdraw / submit / auto-submit; saved jobs API.
- Auto-apply engine: lib/apply/{engine,registry,gate,sensitive,
  stop-conditions,snapshot,task,client}.ts with adapters for Workable,
  Greenhouse, Lever, Ashby. Approval mode by default; auto mode is a
  per-user preference gated by entitlement; global kill switch
  AUTOMATION_SUBMIT_ENABLED (currently OFF; supervised go-live pending).
  Email is sent after every automated submission (standing owner rule).
- Billing: plans FREE / BASIC 5,000 / PREMIUM 10,000 / MAX 20,000 NGN per
  month; subscription_plans table; subscriptions with trial logic;
  checkout via hosted Paystack/Flutterwave; providers endpoint.
- Entitlements TODAY (this is what changes in the upgrade): usage_daily
  per-day counters (ai_used, applications_used, tools_used) and lifetime
  counters (docs_used for FREE, auto_apply_used BASIC trial). Daily
  quotas: FREE 3 AI/day and 0 applications; BASIC 10/10; PREMIUM 20/20;
  MAX 40/40. Enforced inside DB functions (trackGeneration, application
  creation) with row locks; exposed via v_workspace_entitlements.
- Free tools: ten public SEO tool pages with a shared generation API.
- Observability: structured logs, audit_logs, security digest cron,
  client-error intake. No per-application success/failure analytics yet
  (the "pilot scorecard" gap, absorbed into Milestone 4 below).

## 3. Test baseline (run today, post mobile-removal commit)

- tsc: exit 0.
- vitest: full suite green (count recorded in the removal commit's CI run;
  the 5 plans-route tests are removed with the endpoint).
- Build: next build succeeds in CI (same job).
- e2e: production smoke suite 13 passed / 5 skipped (credential-gated and
  mobile-project skips), including WCAG contrast, retired routes 404, and
  API anon guards.

## 4. Risks and gaps found

1. Quota semantics: current daily counters + lifetime trials differ
   completely from the directive's monthly credit matrix. Migration needs
   a ledger and a cutover plan (Milestone 2), not an in-place edit.
2. Onboarding has no server-side gate; protected APIs are reachable for
   any authenticated user regardless of profile completeness.
3. Auto-policy boundary overclaim on the site (pre-existing, owner-queued
   before investor circulation): claims must match the supported-adapter
   list. Absorbed into Milestone 4 with an honest "supported systems" page.
4. Instrumentation gap: no per-adapter success/failure/uncertainty
   measurement, so any engine change would be unmeasurable. This is why
   the research recommendation defers new engine layers until after
   Milestone 4's instrumentation.
5. Oracle trial ends 2026-10-07 (A1 free-tier retry armed, Render standby
   live). Worker hosting economics are an input to any engine decision.
6. Portfolio Studio: nothing exists (no table, route, or export).
7. Flutterwave card-verification parity unverified; Paystack-only launch
   recommended for free activation.

## 5. Preserved invariants (standing owner rules)

No stored board passwords; no logged-in sessions; never Easy Apply or
Indeed Apply mass submit; no scraping of LinkedIn/Indeed; approval before
anything is sent; email after every automated submission; no fabricated
qualifications; claims match implementation; no watermark on documents;
zero em dashes in product copy; 1000-user hardening; no destructive git or
db operations without explicit owner confirmation.

## 6. What was removed alongside this audit

The Android client (mobile/, its CI workflow, and the mobile-only
/api/plans endpoint + tests) per the owner's erase directive. The work
remains recoverable in git history (commits 5d81fe8, 0e0b475, c1525b0).
The Bearer native-auth path and saved-jobs API stay: they are server
infrastructure, not mobile-app sections.
