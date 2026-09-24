# Security review 2026-09-24

Checklist-driven review of the live production system (jobiest.com, deploy `24246d5`).
Every item below was checked against code and, where possible, against production today.
Method notes at the bottom.

## Checklist results

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Enable RLS | Pass (live) | Anonymous REST reads with the public anon key return empty sets on `documents`, `applications`, `profiles`, `payments`, `subscription_plans`, `ai_credentials`, `agent_tasks`, `audit_logs`; `security_events`, `admin_users`, `seo_conversion_events` are revoked from the anon role entirely (HTTP 42501). Migration 022 closed the last gap (`subscription_plans`). |
| 2 | Tighten CORS settings | Pass | The app sets no CORS headers: every surface is same-origin by default. Platform-level `ACAO: *` on static assets was reviewed in the security baseline (F-004): no credentials are ever exposed cross-origin. VM worker endpoints (api, ai, browser) require a shared secret and return 401 without it. |
| 3 | Parameterized SQL queries | Pass | All database access goes through supabase-js (PostgREST), which parameterizes by construction. Grep for string-interpolated SQL found none. Server-side quotas use SQL functions with bound parameters (migration 013). |
| 4 | Verify email addresses | Pass (as designed) | Signup creates accounts that must be email-verified (`issueEmailVerificationCode`, `/api/auth/verify`), per the 2026-09-21 auth brief. Security layers kept: per-IP rate limits, device cookies, registration risk scoring, audit trail. |
| 5 | Keep tokens out of localStorage | Pass | Browser sessions use `@supabase/ssr` cookie storage (`lib/supabase-browser.ts`), not localStorage. The service-role client is server-only with `persistSession: false`. |
| 6 | Hide .env files | Pass | `git ls-files` shows only `.env.example` files; `.env*` is gitignored. Gitleaks secret scan runs in CI and passed on this commit. |
| 7 | Validate form inputs | Pass | Signup validates and normalizes email, phone (E.164), name shape server-side; admin and tool routes use schema validation; the full route inventory is enforced by CI lint (every route carries a server auth marker or is on the reviewed allowlist). |
| 8 | Gate admin routes | Pass | Every `/api/admin/*` handler calls `requireAdminUser()` (deny by default); `tests/admin-security.test.ts` and `tests/security-baseline.test.ts` passed in the full suite today (918 passed). |
| 9 | Disable production debugging | Pass | No debug flags in app code; production Next.js does not expose stack traces; VM services run with production env only. |
| 10 | Server-side API secrets | Pass | Only URLs and the anon key are `NEXT_PUBLIC_`. Service keys and worker secrets live server-side only; the CI bundle scan fails on any secret pattern or non-anon JWT in client bundles. |
| 11 | Validate file uploads | Pass | CV uploads: 5 MB cap, PDF MIME plus magic-byte `%PDF-` signature, auth required, rate limited, SHA-256 recorded. Resume photos: 2 MB cap, JPEG/PNG magic-byte check, re-validated again at PDF embed time. |
| 12 | Keep sensitive data out of logs | Pass | Grep for logging of key, token, secret or password values found none; IP addresses are stored hashed (`hashIp`), not raw. |

## Copy review (same date)

Homepage copy pass shipped in `24246d5`: hero tightened for lazy readers, pricing limits
broken into a scannable list, and board claims aligned with the implementation (any pasted
job on Greenhouse, Lever, Ashby or Workable is filled and submitted after approval;
agent-found jobs come from Greenhouse and Lever boards today). Copy-guard and
homepage-autopilot tests green; zero em dashes.

## Method

- Code checks: grep and file review at `24246d5`, plus the existing findings register
  (`docs/security-baseline-findings.md`) and CI guards.
- Live checks: production homepage and API responses over HTTPS; anonymous PostgREST reads
  against the project REST endpoint using the public anon key.
- Test run: full vitest suite (92 files, 918 passed, 1 skipped), `tsc --noEmit` clean,
  `next build` clean, CI 3 of 3 green (Typecheck/Tests/Build, E2E smoke, gitleaks).
