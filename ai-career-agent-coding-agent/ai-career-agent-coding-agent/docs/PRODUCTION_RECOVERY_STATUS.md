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
| 1 | 2026-09-17 09:5x | Repo state | git commands above | ✅ clean, mobile impact isolated to bc0ca35 |
| 2 | 2026-09-17 11:0x | Static gates (tsc, vitest, build) | `tsc --noEmit` 0 errors; `vitest run` 67 files / 623 passed / 1 skipped; `next build` success (all routes) | ✅ PASS |
| 3 | 2026-09-17 10:2x | Public smoke (live, jobiest.com @ 9740171) | urllib checks: 10 public pages 200 + expected content; /api/health 200 ok; /api/jobs 200 with 50 real rows; 60/68 endpoints reject unauth correctly; 8 endpoints returned 500 (BUG family, pre-existing at 6be7fb3) | ⚠️ 8 bugs → fixed this session |
| 4 | 2026-09-17 11:0x | Unauth-500 fix + regression tests | 8 route files restructured (requireUser inside try; catch maps UNAUTHENTICATED/MFA_REQUIRED→401, ACCOUNT_*→403); new tests/unauth-contract.test.ts pins 401/401/403; suite green | ✅ FIXED (live re-verify after deploy) |
| 5 | 2026-09-17 11:1x | Time-bomb test repair | tests/apply-snapshot.test.ts hardcoded approved_at=2026-09-16T12:00Z with real-clock verifyApprovalAndRevert → failed once clock passed 2026-09-17 12:00Z window; fixed by adding injectable `now` param (additive); suite green | ✅ FIXED |
| 6 | — | Auth E2E (real test account) | pending | |
| 7 | — | Browser E2E journeys | pending | |
| 8 | — | Security checks (secret scan) | pending | |
| 9 | — | DB audit (read-only) | pending | |
| 10 | — | Infra status (Vercel/Render/Supabase) | pending | |
| 11 | — | Post-deploy live re-verify of the 8 endpoints (expect 401) | pending | |

## 4. Current stage
Bug fixes complete (8 unauth-500 routes + time-bomb test), all gates green, release candidate ready (2026-09-17 13:32).

## 5. Blockers
None identified yet.
