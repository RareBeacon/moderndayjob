# API inventory (B-023 / spec §9.2)

Generated from the repository at commit time (see git log). One row per Route Handler.
Auth semantics: `user` = `requireUser()` (server-verified session + account-status check);
`admin` = `admin_users` table gate (deny-by-default); ownership of `[id]` resources is
enforced in `lib/applications/service.ts` / route queries (`.eq('user_id', user.id)`),
with 404 for foreign ids (no existence disclosure). No Server Actions exist.

| Route | Methods | Auth | Validation | Rate limit |
|---|---|---|---|---|
| `/api/admin/credentials` | POST,PATCH | user+admin | zod | - |
| `/api/admin/ingest` | POST | admin | zod | - |
| `/api/admin/seo/articles` | POST | admin | zod | - |
| `/api/admin/seo/oauth/callback` | GET | admin | inline checks | - |
| `/api/admin/seo/oauth/start` | GET | admin | n/a (GET) | - |
| `/api/admin/seo/run` | POST | admin | zod | - |
| `/api/admin/seo/setup` | GET,POST,PATCH | admin | zod | - |
| `/api/admin/seo/sites` | GET | admin | inline checks | - |
| `/api/admin/users` | GET | user+admin | n/a (GET) | - |
| `/api/admin/users/signout` | POST | user+admin | zod | - |
| `/api/admin/users/suspend` | POST | user+admin | zod | - |
| `/api/admin/users/terminate` | POST | user+admin | zod | - |
| `/api/ai/analyze-job` | POST | user | zod | yes |
| `/api/ai/career-paths` | POST | user | inline checks | yes |
| `/api/ai/followup-email` | POST | user | zod | yes |
| `/api/ai/interview-questions` | POST | user | zod | yes |
| `/api/ai/match` | POST | user | zod | yes |
| `/api/ai/profile-copy` | POST | user | zod | yes |
| `/api/ai/resume` | POST | user | zod | yes |
| `/api/ai/salary-insights` | POST | user | zod | yes |
| `/api/applications/[id]/approve` | POST | user | n/a (GET) | yes |
| `/api/applications/[id]/auto-submit` | POST | user | inline checks | yes |
| `/api/applications/[id]/reject` | POST | user | zod | yes |
| `/api/applications/[id]` | GET | user | n/a (GET) | - |
| `/api/applications/[id]/submit` | POST | user | n/a (GET) | yes |
| `/api/applications/[id]/withdraw` | POST | user | n/a (GET) | yes |
| `/api/applications/prepare` | POST | user | zod | yes |
| `/api/applications` | GET,POST | user | zod | yes |
| `/api/ats/scan` | POST | user | zod | yes |
| `/api/auth/confirm` | POST | PUBLIC (allowlist) | inline checks | - |
| `/api/auth/forgot-password` | POST | PUBLIC (allowlist) | zod | yes |
| `/api/auth/reset-password` | POST | PUBLIC (allowlist) | zod | yes |
| `/api/auth/signout` | POST | PUBLIC (allowlist) | n/a (GET) | - |
| `/api/auth/signup` | POST | PUBLIC (allowlist) | inline checks | yes |
| `/api/billing/flutterwave/create` | POST | user | zod | yes |
| `/api/billing/flutterwave/webhook` | POST | webhook-sig+reverify | n/a (GET) | - |
| `/api/cron/daily-pipeline` | GET | cron-secret | n/a (GET) | - |
| `/api/cron/security-digest` | GET | cron-secret | n/a (GET) | - |
| `/api/cron/seo` | GET | cron-secret | n/a (GET) | - |
| `/api/documents/[id]/download` | GET | user | n/a (GET) | - |
| `/api/documents/[id]/export` | GET | user | inline checks | - |
| `/api/documents/generate` | POST | user | zod | yes |
| `/api/documents/generated` | GET | user | n/a (GET) | - |
| `/api/documents` | GET,POST | user | inline checks | - |
| `/api/entitlements` | GET | user | n/a (GET) | - |
| `/api/free-tools/action` | POST | user | zod | yes |
| `/api/free-tools/analytics` | POST | user | zod | - |
| `/api/free-tools/generate` | POST | user | zod | yes |
| `/api/health` | GET | PUBLIC (allowlist) | n/a (GET) | - |
| `/api/jobs` | GET | PUBLIC (allowlist) | n/a (GET) | yes |
| `/api/preferences/agent` | POST | user | zod | yes |
| `/api/preferences` | GET,PUT | user | zod | - |
| `/api/profile/completeness` | GET | user | n/a (GET) | - |
| `/api/profile` | GET,PUT,DELETE | user | zod | - |
| `/api/resume-studio/ai` | POST | user | zod | yes |
| `/api/resume-studio/draft` | GET,PUT | user | zod | - |
| `/api/resume-studio/generate` | POST | user | zod | yes |
| `/api/tally/webhook` | POST | hmac-secret | n/a (GET) | - |
| `/api/tasks/[id]/cancel` | POST | user | n/a (GET) | - |

**Total: 59 route files.** Every row has a non-empty Auth cell.

## Reviewed public allowlist (deny-by-default registry)

These routes intentionally serve anonymous traffic; each has a stated reason and is mirrored in
`tests/security-baseline.test.ts` (`PUBLIC_ROUTES`), which fails CI if any new route is added
without a server auth marker or an explicit allowlist entry.

| Route | Why public | Control |
|---|---|---|
| `/api/health` | Uptime signal, no data | DB reachability only; no PII |
| `/api/jobs` | Public job search (marketing value) | Rate-limited |
| `/api/auth/signup` | Account creation | Rate-limited; admin-API confirm; no email verification by product decision |
| `/api/auth/signout` | Clears cookies | Nothing to protect |
| `/api/auth/confirm` | Legacy-account repair | Only reachable after client proved the password (failed sign-in) |
| `/api/auth/forgot-password` | Password reset request | Rate-limited; token via Supabase |
| `/api/auth/reset-password` | Password reset completion | Token-gated; rate-limited |

## Webhooks (signature-gated, not session auth)

| Route | Verification |
|---|---|
| `/api/billing/flutterwave/webhook` | Timing-safe `verif-hash` + size cap + replay dedup + server-side transaction re-verification + idempotent grant RPC |
| `/api/tally/webhook` | HMAC-SHA256 when `TALLY_WEBHOOK_SECRET` set (owner action: set it) |

## Admin routes (all `admin_users`-gated)

`/api/admin/credentials`, `/api/admin/ingest`, `/api/admin/seo/*` (6), `/api/admin/users` (4).
Known gaps recorded in `docs/security-baseline-findings.md`: no capability matrix, no MFA step-up,
no rate limiting on admin routes (backlog B-032/B-044).
