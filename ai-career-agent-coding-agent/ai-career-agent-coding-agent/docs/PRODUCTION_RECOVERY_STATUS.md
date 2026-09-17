# JOBIEST WEB — PRODUCTION RECOVERY STATUS

**Started:** 2026-09-17 (this file is updated as verification proceeds — timestamps in log entries)
**Repo root:** `/home/user/moderndayjob` · web app: `ai-career-agent-coding-agent/ai-career-agent-coding-agent` (Next.js 15.5 App Router)

## 1. Repository state (VERIFIED 2026-09-17)

- Branch `main`, **working tree clean**, HEAD `9740171`.
- Last 6 commits: `9740171` (mobile plan docs + mobile scaffold wipe — no web code), `bc0ca35` (mobile enablement), `6be7fb3` (DNS docs), `9c65642` (welcome sender), `1895887` (Settings/MFA/email/support), `dc35cf0` (Google OAuth docs).
- **Mobile development impact on web/backend — exactly one commit, `bc0ca35`** (evidence: `git show --stat bc0ca35`):
  - `lib/auth.ts` — added Bearer-token auth path (cookie path unchanged, unit-tested).
  - 36 API route files — 2–10 line changes each (passing `Request` into `requireUser`).
  - New `app/api/saved-jobs/route.ts` + `supabase/migrations/027_saved_jobs.sql` (additive table, RLS on, service-role only).
  - Supabase project config: `uri_allow_list` += `jobiest://auth/callback` (OAuth return URL — does not affect web flows).
- **Last known good web commit:** `6be7fb3` (web live-verified 2026-09-16: login/Google OAuth live, settings/MFA redirects, support API validation, email delivery to owner Gmails, full test suite 618 passing).
- No uncommitted changes. No destructive git commands run.

## 2. Real production architecture (VERIFIED by inspection during this audit)

- **Frontend+API:** Next.js 15.5 App Router (RSC + client islands), deployed on **Vercel** at `https://jobiest.com` (deploy = git push main; CI on GitHub Actions: typecheck → vitest → build).
- **Auth:** Supabase Auth (project `cbxloutahmalorumaihc`) via `@supabase/ssr` cookies; TOTP MFA; middleware route gating.
- **Database:** Supabase Postgres, migrations 001–027, RLS on user tables, service-role-only access from API routes.
- **Email:** Resend (`no-reply@jobiest.com`, welcome from `Philip (Jobiest) <philip@jobiest.com>`); inbound forwarding via ForwardEmail MX → owner Gmails. SPF/DMARC/DKIM live (verified 2026-09-16).
- **Workers:** Render web services (browser worker confirmed via Render API; agent/api/scheduler workers in repo `workers/`).
- **Payments:** Flutterwave (env keys present in Vercel project env — FLW_* set; see payments section of feature matrix for what was and was not tested).

## 3. Verification log (append-only)

| # | Time (UTC) | Check | Evidence | Result |
|---|---|---|---|---|
| 1 | 09:5x | Repo state | git commands above | ✅ clean, mobile impact isolated to bc0ca35 |
| 2 | — | Static gates (tsc, vitest, build) | pending | |
| 3 | — | Public smoke (live) | pending | |
| 4 | — | Auth E2E (real test account) | pending | |
| 5 | — | Browser E2E journeys | pending | |
| 6 | — | Security checks | pending | |
| 7 | — | DB audit | pending | |
| 8 | — | Infra status | pending | |

## 4. Current stage
Static + live verification in progress.

## 5. Blockers
None identified yet.

## Verification Log (continued)

| Timestamp (UTC) | Check | Result | Evidence |
|---|---|---|---|
| 2026-09-17 ~11:30 | Bug family fix: 8 unauth-500 routes restructured (requireUser + rate-limit prelude moved inside try; catch extended with MFA_REQUIRED→401, ACCOUNT_*→403; admin/users catch extended) | FIXED, pending deploy | files: app/api/applications/[id]/route.ts, {approve,reject,withdraw,submit,auto-submit}/route.ts, applications/prepare/route.ts, app/api/admin/users/route.ts |
| 2026-09-17 ~11:30 | New regression test tests/unauth-contract.test.ts (mocks requireUser throwing UNAUTHENTICATED/MFA_REQUIRED/ACCOUNT_SUSPENDED; asserts 401/403 not 500) | PASS | 5 tests green |
| 2026-09-17 ~11:45 | Discovered pre-existing time-bomb test: tests/apply-snapshot.test.ts hardcoded approved_at=2026-09-16T12:00Z; verifyApprovalAndRevert used real clock → 2 tests began failing when the 24h approval window expired at 2026-09-17T12:00Z (test written fb27dcd 2026-09-16 14:01 UTC — green for <22h by construction; NOT caused by recovery patches) | ROOT-CAUSED | failure: expected APPROVAL_STALE got APPROVAL_EXPIRED |
| 2026-09-17 ~11:50 | Fix: added injectable `now: Date = new Date()` param to verifyApprovalAndRevert (lib/apply/snapshot.ts, additive/backward-compatible), tests pass NOW | FIXED | full suite green |
| 2026-09-17 ~11:55 | Gate 1: tsc --noEmit | PASS | 0 errors |
| 2026-09-17 ~11:55 | Gate 2: npx vitest run | PASS | 67 files, 623 passed, 1 skipped, 0 failed |
| 2026-09-17 ~12:05 | Gate 3: npm run build (Next.js 15.5.25) | PASS | "✓ Compiled successfully in 8.3s", 102 static pages, exit 0 |
| 2026-09-17 ~12:15 | Remote main advanced 9740171→b88101e (mobile PRs #1-#4); inspected: 102 files, all under apps/jobiest-mobile + docs + 1 new public web route app/api/mobile/config (returns only NEXT_PUBLIC_* values, reviewed in security-baseline PUBLIC_ROUTES) + 2 test files; ZERO overlap with recovery files | MERGED | merge commit 47aa5f8, no conflicts |
| 2026-09-17 ~12:25 | B-003 bundle secret scan failed post-build: flagged "unexpected JWT" in 7 auth-page chunks. Investigated: exactly ONE distinct JWT in all of .next/static, byte-identical to .env.local NEXT_PUBLIC_SUPABASE_ANON_KEY (public by design). Cause: vitest.config.ts dummy env overrides the key the scan compares against; scan had never run post-build locally (skipIf .next/static absent; earlier runs pre-dated first build). Pre-existing design flaw, not a leak, not a regression | ROOT-CAUSED + FIXED | full-equality check MATCH; fix resolves real key from process env (CI) or .env.local (local) |
| 2026-09-17 ~12:35 | Gates on merged tree: tsc PASS; vitest 68 files / 626 passed / 0 failed (B-003 active post-build); npm run build "✓ Compiled successfully in 10.8s" | PASS | commit 2ff2357 |
| 2026-09-17 12:43:34 UTC | DEPLOYED 2ff2357 (push→Vercel). Live re-verify: all 8 bug endpoints now 401 {"error":"UNAUTHENTICATED"} (was 500): GET /api/applications/{id}, GET /api/admin/users, POST prepare/approve/reject/withdraw/submit/auto-submit. Homepage 200 hero ok; /api/health 200 ok:true | VERIFIED LIVE | probe timestamps 12:43:02 (500s) → 12:43:34 (all 401) |
| 2026-09-17 ~13:00 | Auth API E2E (production, real labeled test account qa.webtest@jobiest.com): signup 200 via /api/auth/signup (user d386e5ae); invalid email 400; short password 400; duplicate 409; login via Supabase token grant 200; wrong password vs unknown account return byte-identical 400 invalid_credentials (anti-enumeration VERIFIED) | PASS | evidence in session log |
| 2026-09-17 ~13:05 | FINDING (mobile-path, web unaffected): fresh no-factor password-grant token carries aal:'aal1' (evidence: admin factors API returns [] for test user; token payload decoded). lib/auth.ts bearerAuthContext treats presence of aal claim as 'factor enrolled' → every Bearer call to requireUser routes returns 401 MFA_REQUIRED. Cookie path uses getAuthenticatorAssuranceLevel (factorless → no gate) so WEB LOGIN IS UNAFFECTED. Bearer path = mobile-only, frozen; documented, not fixed (directive: touch shared code only if web restoration requires) | DOCUMENTED | token claims + factors[] evidence |
| 2026-09-17 ~13:35 | BROWSER E2E pass 1 (Playwright/Chromium vs production, real login): login→/dashboard; 10 authed APIs 200 with real data (profile, completeness, preferences, entitlements FREE/TRIAL, credentials, applications, saved-jobs, documents, generated, resume draft); 7 protected pages render; job search "engineer"→19 cards; LOGOUT: /api/profile→401 after logout, /dashboard→/login, refresh stays logged out; mobile 375px: 0px overflow on /, /jobs, /login, /pricing, /support | ALL 29 PASS | e2e-production.cjs |
| 2026-09-17 ~13:50 | Deep Journey A (real data): profile PUT 200 → completeness 0%→78%; resume draft save 201 + persists; REAL CV generated (201) + REAL PDF export (200, %PDF-1.7); 50 job cards + 50 external links; saved-job PUT/GET 200/1; application prepare 201 (real application); ai/match 200 with real scored matches (Spotify BE etc.); support submit 200 ok:true delivered:true (REAL Resend delivery) | ALL PASS | e2e-journey-a.cjs, e2e-dashboard-evidence.png |
| 2026-09-17 ~13:55 | Application lifecycle authed: detail 200 (application/package/timeline); approve → 409 INVALID_TRANSITION (correct state machine, PREPARING); reject → 409; withdraw → 200 (test app closed, audit trail preserved) | PASS | honest error states confirmed |
| 2026-09-17 ~14:00 | AI agent real calls (cookie session): salary-insights 200 (real scanned job data); career-paths 200 (real LLM output referencing actual profile skills); interview-questions 200 with valid body (400 INVALID_BODY with wrong body — honest); /profile/ai renders authed | PASS | 4 real AI requests, zero fake responses |
| 2026-09-17 ~14:05 | Rate limits LIVE: support burst → 400,400 then 429×5 (limiter engaged); signup → 429 immediately (quota already consumed by earlier tests — limiter active) | PASS | invalid-body requests only; no inbox spam, no junk accounts |
| 2026-09-17 ~14:10 | API latency best-of-3: / 0.18s, /api/health 0.24s, /api/jobs 0.49s | PASS | no bottlenecks |
| 2026-09-17 ~14:15 | DB audit (read-only via Supabase mgmt API): 41 tables, ALL RLS-enabled, zero without; real data (192 jobs, 20 profiles, 47 workspaces, 9 generated docs); payments + payment_events have 0 rows (no real transaction ever processed — payments verified at code/config level only); migrations: 27 files in-repo, no DB-side ledger (operational note) | PASS | SQL evidence |
| 2026-09-17 ~14:20 | Render: jobiest-browser-worker active/not suspended (created 2026-09-08, repo-linked); outside request path (automation kill switch OFF) | PASS | Render API |
| 2026-09-17 ~14:25 | Payments code review: webhook = size cap + timing-safe verif-hash + replay guard + SERVER-SIDE re-verification + amount guard; verify = server-side re-verify + NOT_YOUR_TRANSACTION 403 + rate limit; create = amount from server-side subscription_plans only. LIVE: webhook rejects no-sig 401 and fake-sig 401 | PASS (code/config level) | no sandbox exists for full payment E2E — disclosed |
| 2026-09-17 ~14:30 | Repo secret scan (664 tracked files): no API keys / private keys / postgres URLs / embedded JWTs / platform tokens; only .env.example tracked; service-role literal absent from tracked files | CLEAN | git ls-files + pattern scan |
| 2026-09-17 ~14:35 | docs/PRODUCTION_FEATURE_MATRIX.md written (40 features, evidence-based statuses) | DONE | see file |


## Independent re-verification (session 2 · 2026-09-17 13:45–14:00 UTC)

A second session independently re-verified the recovery (fresh evidence, own labeled test account `qa2.webtest@jobiest.com`, user `02421bad-0d74-4fe4-8cee-492a0bb5c373`). A duplicate of the 8-route fix was produced in parallel; `git diff` proved all 10 code files byte-identical to origin/main and the duplicate was merged with zero content delta (merge `30f7073`).

| # | Time (UTC) | Check | Evidence | Result |
|---|---|---|---|---|
| S1 | 13:20 | Git reconciliation | remote advanced to c04086b (password-reset repair, feature matrix, E2E evidence, CI green ×5 on GitHub incl. c04086b); my 3b24518 code files byte-identical → merged | ✅ MERGED, no content delta |
| S2 | 13:35 | Gates on merged tree (= c04086b) | tsc --noEmit 0 errors; vitest 69 files / 632 passed / 0 failed; next build ✓ | ✅ PASS |
| S3 | 13:40 | Live: 8 bug endpoints | all 8 → 401 {"error":"UNAUTHENTICATED"} (was 500) | ✅ VERIFIED LIVE |
| S4 | 13:40 | Live: c04086b deployed | POST /api/auth/reset-password no-token/no-session → 401 NO_RESET_SESSION (new-code fingerprint); garbage token → 400 INVALID_OR_EXPIRED_LINK; bad body → 400 INVALID_BODY | ✅ DEPLOYED + CORRECT |
| S5 | 13:44 | Auth E2E (API, real cookie path) | signup: bad email 400, short pw 400, valid 200, duplicate 409; token grant 200; 9 authed APIs 200 (profile/completeness/entitlements/applications/saved-jobs/resume-draft/preferences/credentials/documents); cross-user /api/applications/<uuid> → 404 NOT_FOUND; profile PUT 200 persists (completeness 33%); signout 303 + cookie cleared; REPLAYED pre-signout cookie → 401 (session truly revoked); re-login 200; wrong-pw vs unknown-account byte-identical 400 | ✅ ALL PASS |
| S6 | 13:50 | Browser E2E (Playwright/Chromium, real UI) | login UI → /dashboard; authed APIs 200 via cookies; UI profile form save → PUT 200, persisted, completeness 33%; jobs search "engineer" → 19 cards, 50 external links, real Spotify Lever URL; logout UI → /; post-logout /api/profile 401, /dashboard → /login, reload stays logged out; /reset-password renders; mobile 375px: 5 pages scrollWidth exactly 375 (zero overflow); 0 page errors. (Two initial FAILs were test-harness bugs: incomplete form fill blocked by correct required-field validation; wrong button selector) | ✅ ALL PASS (e2e-reverify.cjs, e2e-ui-save.cjs) |
| S7 | 13:55 | DB audit (read-only, Supabase mgmt API SQL) | 41 public tables, 41/41 RLS-enabled, 20 row policies; 192 jobs, 21 profiles, 0 payments rows (confirms no real transaction ever processed) | ✅ PASS |
| S8 | 13:55 | Infra | Render jobiest-browser-worker active (not suspended); /api/billing/flutterwave/webhook: no-sig 401, fake verif-hash 401, GET 405; verify unauth 401; /api/support invalid bodies → 400 Required | ✅ PASS |
| S9 | 13:58 | Feature matrix review | docs/PRODUCTION_FEATURE_MATRIX.md: 27 features, statuses evidence-based, partials honestly disclosed (payments code/config-only; admin authed-testing rejected as risk) | ✅ ACCEPTED |

Session-2 conclusion: every critical claim of the first session's audit was independently reproduced. No new blockers found.

## Current stage: VERIFICATION COMPLETE — final report issued

## Blockers for full production readiness: none critical.
Disclosed limitations (not blockers, by directive definitions):
1. Payments end-to-end (real transaction) untested — NO sandbox infrastructure exists; verified at code/config level with live webhook signature enforcement. payments tables have 0 historical transactions.
2. Email delivery directly observed only for support (delivered:true); welcome/reset share the same proven Resend pipeline (code-level).
3. Admin authenticated flows not exercised (would require granting a test account admin role — rejected as unnecessary risk); admin access-control verified (401s + /admin 404 public).
4. Mobile Bearer path (shared lib/auth.ts) returns MFA_REQUIRED for all tokens because Supabase stamps aal:'aal1' on factorless tokens — WEB (cookie path) unaffected, mobile frozen per directive; fix deferred to mobile resumption.
5. Test data disclosure: labeled account qa.webtest@jobiest.com (user d386e5ae, profile 78%, 1 draft, 1 generated CV, 1 withdrawn application, 1 saved job, 2 support messages) left in place (non-destructive mandate).
| 2026-09-17 ~15:05 | CRITICAL BUG FOUND (pre-existing, live): password reset broken end to end. Evidence: real click-through of a GoTrue recovery link lands on /reset-password#access_token=... (session in URL FRAGMENT) but the page read ?token= from the QUERY string -> every user sees "This reset link is missing its token". Second latent defect: route hashed the link token (sha256) before sending as token_hash, but GoTrue link tokens ARE the hashed_token (empirically: token == properties.hashed_token, and verify(token_hash=hashed) -> 200) so even a present token would fail | ROOT-CAUSED | browser click-through + GoTrue REST evidence |
| 2026-09-17 ~15:20 | FIX: (1) /reset-password page now detects the fragment-consumed session (supabaseBrowser getSession poll) and POSTs {password}; token query param still honored; recovery session signed out after success. (2) /api/auth/reset-password accepts {token?, password}: token sent VERBATIM as token_hash (correct GoTrue semantics); no-token path authorizes via requireUser({allowIncompleteMfa:true}) session + admin update; audit preserved; rate limit preserved. 6 new route tests pin both paths incl. verbatim token_hash | FIXED, pending deploy | tests/reset-password-route.test.ts |
