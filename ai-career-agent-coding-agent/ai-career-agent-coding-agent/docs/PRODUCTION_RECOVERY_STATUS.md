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
