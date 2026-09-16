# Phase 0 discovery — repository inspection (B-001)

Date: 2026-09-16 · Repo: `RareBeacon/moderndayjob` @ `7f54ddb` (baseline before this pass)
Answers the Master Implementation Package's Appendix B checklist. Companion artefacts:
`docs/api-inventory.md`, `docs/security-baseline-findings.md`, `jobiest_security_checks.sql`,
`tests/security-baseline.test.ts`, `supabase/migrations/022_security_baseline.sql`.

## A. Stack and framework

| # | Question | Answer |
|---|---|---|
| 1 | Next.js / React versions; known CVEs | **Next 15.5.25, React 19.1.1, Node 20.** CVE-2025-29927 (middleware bypass) is patched in ≥15.2.3 → not affected. No `npm audit --production` criticals on the current lockfile at time of writing (re-run in CI). |
| 2 | `middleware.ts` present; what it enforces | Yes. Session refresh + **UX redirects only** (`/dashboard`… protected pages, `/`→`/dashboard` when signed in). Uses `supabase.auth.getUser()` (verified, not cookie-trusting). Comment in file itself: "Real gating always happens server-side in route handlers" — matches D-02. |
| 3 | Server Actions | **None.** Zero `"use server"` in the repo. The entire attack surface is Route Handlers (cleaner to audit). |
| 4 | Route Handlers | **59 files.** Full inventory with auth/validation/rate-limit columns: `docs/api-inventory.md`. |
| 5 | Supabase client construction | Server: `lib/supabase.ts` (`supabaseAdmin`, service role, server-only) + `lib/auth.ts` (cookie-scoped client, `getUser()`). Browser: `lib/supabase-browser.ts` used **only** in `/login` and `/signup` and **only** for `auth.signInWithPassword` / `auth.signUp` — no browser `.from()` data access anywhere (A-01 resolved: PostgREST is not a public data surface; RLS remains defence in depth). |

## B. Data and authorization

| # | Question | Answer |
|---|---|---|
| 6 | Tables + `.from()` calls vs RLS | 35 tables created across migrations 001–021. RLS enabled on **34/35**; the one gap (`subscription_plans`) is fixed in migration 022 (deny-by-default, service-role only — the app reads it solely via `supabaseAdmin`, which bypasses RLS). |
| 7 | RLS status per table (live DB) | **BLOCKED for automation** — running `jobiest_security_checks.sql` (D1–D12) requires the Supabase SQL editor / service access, which the coding agent does not hold. Script committed; **owner action: run it in production once** and store the output. Source-level proxy: `tests/security-baseline.test.ts` re-checks D1/D2/D6 from the migration files in CI. Migration 010 (`lockdown_private_tables.sql`) already implements the lockdown pattern: RLS on all admin/payment/security tables, owner-read policies on subscriptions/payments/ai_credentials/workspaces, `security_invoker` on views, revokes from anon/authenticated. |
| 8 | Storage buckets | `career-documents` (PDFs). Upload path `{user_id}/{uuid}-{safeName}`, `upsert:false`; magic-byte check `%PDF-`, size cap, mime allowlist; downloads via 60-second signed URL minted **after** an ownership query (`.eq('user_id', user.id)`), 404 for foreign ids. Bucket visibility not verifiable from repo — included in the owner SQL run (D9). |
| 9 | `auth.users` config | Supabase-managed. Project uses **auto-confirm via admin API** (`/api/auth/signup` calls `auth.admin.createUser({ email_confirm: true })`) — instant signup is a product decision recorded in prior specs. MFA not enabled in code (see B-032 in findings). JWT expiry/refresh rotation are dashboard config — **owner action** (recommended: keep default 3600s access tokens, refresh rotation on). |
| 10 | Session handling | `@supabase/ssr` cookie pattern; **zero `getSession()` calls in the repo** (B-031 already satisfied — every server path uses `getUser()`). Cookies set by the ssr helper (HttpOnly/Secure/SameSite=Lax by library default). |

## C. Money and quotas

| # | Question | Answer |
|---|---|---|
| 11 | Payment provider | **Flutterwave** (A-04 resolved; not Paystack). Webhook: size cap → timing-safe `verif-hash` compare → replay short-circuit (`payment_events.event_id` unique) → **server-side transaction re-verification via API** (never trusts the payload) → amount/currency guard against known NGN plans (₦5,000/₦10,/₦20,000) → idempotent `apply_verified_payment` RPC. This is the full B-070/B-071 pipeline; Flutterwave's weaker static-hash scheme is compensated exactly as the spec prescribes. |
| 12 | Quota enforcement | **Server-authoritative in SQL** (B-072 satisfied at the DB layer): `consume_ai_credit` enforces FREE lifetime cap 3 (`usage_lifetime.docs_used`) and paid daily caps with `SELECT … FOR UPDATE` (no read-then-write race); `reserve_application_slot` enforces BASIC 2 lifetime / PREMIUM 10 / MAX 20 daily + idempotency key `user:job`; `consume_tool_use` enforces 10/50/unlimited. Client counters are display-only. |
| 13 | Price/plan source of truth | `lib/billing/pricing.ts` (₦ canonical) + `subscription_plans` table + `planForAmount` in `packages/billing/flutterwave.ts` — all four agree (₦0/₦5,000/₦10,000/₦20,000). |

## D. Agent and AI

| # | Question | Answer |
|---|---|---|
| 14 | Agent runtime | No Playwright/browser automation in the repo (A-03 confirmed: no worker, no queue lib). The "agent" is request-scoped: `agent_tasks` table + `scheduled_runs` + Vercel cron (`/api/cron/daily-pipeline`, CRON_SECRET-gated) + `cancel_agent_task` RPC (owner-checked). Applications are **prepared** server-side; submission requires explicit user approval (`approveApplication`); there is no external auto-submit path (matches C-01/Terms). |
| 15 | AI provider + PII | `lib/ai/server.ts`: Ollama-first (self-hosted, `OLLAMA_BASE_URL`) with OpenAI-compatible fallback; user AI credentials stored **encrypted at rest** (`ai_credentials.ciphertext` + `key_version`, `@packages/security/crypto`, `ENCRYPTION_MASTER_KEY`). |
| 16 | Prompt-injection defenses | **Exist**: `lib/ai/injection.ts` (pattern neutralization + length caps + `<UNTRUSTED>` wrapping) + `lib/ai/sanitize.ts`. Injection corpus/CI (B-221) not yet built. |
| 17 | Admin plane | **Exists** (the package's recon missed it — it only sampled public chunks): `/api/admin/*` (11 routes) + `admin_users`/`admin_actions` tables, server-gated by `admin_users` lookup inside every handler (deny-by-default; 401/403). No capability matrix or MFA enforcement yet (B-032/§5 gaps). |

## E. Frontend security

| # | Question | Answer |
|---|---|---|
| 18 | CSP / headers | Were: `unsafe-inline` + `unsafe-eval` in script-src; no COOP/CORP/X-DNS-Prefetch; auth pages cacheable. **Fixed this pass**: `unsafe-eval` removed (verified: no eval/new Function in app code; prod Next doesn't need it), `object-src 'none'` + `worker-src 'self'` added, COOP/CORP/X-DNS-Prefetch-Control added, `Cache-Control: no-store` on /login, /signup, /reset-password and all authenticated surfaces. `unsafe-inline` retained (Next inline bootstrap requires it until nonce CSP — B-040 deferred). Guarded by test. |
| 19 | CORS | No `Access-Control-Allow-Origin` anywhere in app code. The `ACAO: *` on 404 responses (F-004) is **Vercel platform behaviour**, not app code (verified: zero matches in repo). No credentialed cross-origin API exists. |
| 20 | Secrets in bundles | Sampled 21 live chunks previously: clean. Now a **CI bundle-scan test** (`tests/security-baseline.test.ts`) fails the suite if `sk_live|sk_test|sk-ant|sk-proj|service_role|-----BEGIN|postgres://` or any non-anon JWT appears in `.next/static` after a build. |
| 21 | Env classification | `NEXT_PUBLIC_*` = URL + anon key only (safe by design). Service role / FLW secret / encryption key / Upstash token / cron secret are server-only (`lib/env.ts`). `TALLY_WEBHOOK_SECRET` optional — **owner action: set it in all environments** (unsigned Tally events are accepted when unset). |
| 22 | Uploads | PDF-only via `/api/documents` (magic bytes, size cap, per-user path, sha256, private bucket, signed-URL download after ownership check). B-046 substantially satisfied; page-count cap + malware scan are the remaining backlog items. |
| 23 | SSRF | No feature fetches user-supplied URLs (no import-by-URL, no logo fetch). The B-045 SSRF-safe fetcher is therefore precautionary backlog, not an open hole. |
| 24 | Rate limiting | Upstash sliding-window (`lib/rate-limit.ts`), applied on all AI/generation/auth/free-tool/job routes (inventory column). Graceful allow-all when Upstash is unconfigured — **owner action: set `UPSTASH_REDIS_REST_URL/TOKEN` in production** so limits are live (verified present on live endpoints previously, so likely configured). |

## F. Product/UX/SEO (prior passes already shipped)

| # | Question | Answer |
|---|---|---|
| 25 | Truthful copy | No "auto-apply" in user copy (retired in `7f54ddb`); "agent-mode applications, each approved by you"; honest free-tier language; NGN-only pricing; copy-guard tests enforce no em/en dashes and jargon rules. |
| 26 | Resume validators | Deterministic post-processing exists (`packages/security`, truthfulness checks reject unsupported claims pre-save; generate page maps `TRUTHFULNESS_FAILED`). Full evidence-matrix pipeline (B-100..B-108) is Phase 3 backlog. |
| 27 | Job sources | Greenhouse/Ashby/Lever adapters via public board APIs (compliant sources per the package's matrix); 180-job pipeline; `/jobs` private (robots disallow) per Option A decision (C-04 superseded — see findings). |
| 28 | SEO | Titles/templates fixed (`%s - Jobiest`), Product/Offer + ItemList + SoftwareApplication JSON-LD, sitemap with /tools + /help, og:image on tool pages. Public job pages (B-300) deferred pending legal review. |
| 29 | Tests/gate | tsc 0 / vitest (now 422 incl. 9 new security-baseline tests) / next build clean. CI = local gate run per change (no hosted CI configured — owner may wire the same commands). |
| 30 | Deploy/rollback | Push to `main` auto-deploys (Vercel). Migrations are forward-only SQL files applied via the Supabase SQL editor by the owner. Rollback = redeploy previous commit; DB migrations carry idempotent `create or replace`/`if not exists` patterns. PITR/restore drills are owner actions (B-350). |

## Phase 0 exit summary

- **B-001** (this document): complete.
- **B-002** (RLS audit run in prod): script committed; execution is an owner action (no DB console access from the coding environment). Source-level D1/D2/D6 checks run in CI from this pass.
- **B-003** (bundle secret scan): implemented as a CI test (runs post-build; skipped when `.next` absent).
- **B-004** (staging environment): **blocked — owner action** (separate Vercel + Supabase projects + provider test keys).
- **B-005** (header assertions): implemented as a CI test + post-deploy live header verification.
