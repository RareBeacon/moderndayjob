# Jobiest - System Architecture & Sources of Truth

Production URL: `https://jobiest.com`  
Application Root: `ai-career-agent-coding-agent/ai-career-agent-coding-agent/`  
Framework: Next.js `15.5.28` (App Router) · React `19.1.1` · TypeScript `5.7.3` · Supabase (`@supabase/ssr` `0.5.2`, `@supabase/supabase-js` `2.58.0`)

---

## 1. High-Level Request & Execution Topology

```text
Browser / Mobile Client
   |
   +--> Edge Middleware (middleware.ts)
   |      |-- Bypass: /, /auth/callback, /api/auth/oauth, public marketing & free tools
   |      |-- Protected pages: Supabase SSR getUser() + App Session (30m idle / 7d absolute)
   |      |-- Social verification/completion gates + TOTP MFA (aal2) gate
   |
   +--> App Router Server Components (app/**/page.tsx)
   |      |-- Page-level auth triage via requireUserOrRedirect(nextPath)
   |      |-- Scoped server queries + resilient fallback UI (never raw 500 digests)
   |
   +--> API Route Handlers (app/api/**/route.ts - 68 endpoints)
   |      |-- Mandatory Upstash/sliding-window rate limiting (lib/rate-limit.ts)
   |      |-- Deny-by-default auth (requireUser / requireAdminUser / HMAC / CRON_SECRET)
   |      |-- Structured logging + correlation IDs (lib/observability.ts, lib/audit.ts)
   |
   +--> Persistence & External Boundaries
          |-- Supabase Auth (GoTrue) + PostgreSQL (58 RLS-protected tables) + Private Storage
          |-- Dual Entitlement Engine: v_workspace_entitlements + Monthly Credit Ledger
          |-- Payment Providers: Paystack, Flutterwave, Dodo Payments (HMAC webhooks + server verify)
          |-- AI Gateway: Ollama (self-hosted) -> Cloudflare Workers AI -> OpenRouter / encrypted BYOK
          |-- Vercel Cron Jobs (vercel.json) + Isolated SSRF-guarded Browser Worker
```

---

## 2. Authoritative Map of the 15 System Domains

| # | Architectural Domain | Authoritative Source of Truth | Key Implementation Files |
|---|---|---|---|
| 1 | **Routing & App Router Surfaces** | Next.js App Router filesystem (`126` compiled routes) + `next.config.mjs` security/`no-store` headers | `app/**/page.tsx`, `app/layout.tsx`, `next.config.mjs` |
| 2 | **Middleware & Edge Access Control** | `middleware.ts` (`PROTECTED` list + explicit `config.matcher`) | `middleware.ts` |
| 3 | **Authentication & Identity** | Supabase Auth (`auth.users`) + PKCE OAuth starter/callback + 6-digit OTP verification | `lib/auth.ts`, `app/api/auth/oauth/route.ts`, `app/auth/callback/route.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/verify/route.ts` |
| 4 | **Session Lifecycle (30m / 7d)** | `public.app_sessions` table (`044_app_sessions.sql`) + Edge Web Crypto manager (`jobiest_app_session` cookie, HMAC fallback) | `lib/session.ts`, `app/api/auth/session/route.ts`, `app/api/auth/signout/route.ts` |
| 5 | **Supabase Client Boundaries** | Browser anon client (`lib/supabase-browser.ts`), RSC cookie client (`lib/supabase/server.ts`), server-only service-role client (`lib/supabase.ts`) | `lib/supabase-browser.ts`, `lib/supabase/server.ts`, `lib/supabase.ts` |
| 6 | **User Profiles & Onboarding** | `public.profiles` (`PK: user_id`), `public.career_profiles`, `public.job_preferences`, `handle_new_user()` trigger + `ensureProfile()` backfill | `lib/auth/profile.ts`, `lib/profile-completeness.ts`, `lib/onboarding-gate.ts`, `app/api/profile/route.ts` |
| 7 | **Database Schema & RLS Isolation** | Ordered SQL migrations `supabase/migrations/001_initial.sql` .. `046_fix_period_grants.sql` (`58` tables, `100%` RLS enabled) | `supabase/migrations/*.sql`, `tests/security-baseline.test.ts` |
| 8 | **Private Document Storage & Exports** | Private Supabase bucket `career-documents` (PDF magic-byte check, 60s signed URLs) + `public.documents` + `public.generated_documents` | `app/api/documents/route.ts`, `app/api/documents/[id]/download/route.ts`, `app/api/documents/[id]/export/route.ts`, `lib/documents/export.ts` |
| 9 | **Resume Studio & Truthfulness** | `public.resume_studio_drafts`, 30 catalog templates, photo magic-byte validator, and deterministic truthfulness verifier (`verifyDocument`) | `lib/resume-studio/*`, `lib/truthfulness/*`, `app/api/resume-studio/*/route.ts` |
| 10 | **Subscriptions, Billing & Quotas** | `public.subscriptions`, `v_workspace_entitlements`, monthly `credit_ledger` (`037`/`046`), server-trusted `payment_quotes`, and idempotent payment RPCs | `packages/shared/plans.ts`, `packages/security/entitlements.ts`, `lib/credits.ts`, `lib/billing/*`, `packages/billing/*`, `app/api/billing/**/route.ts` |
| 11 | **Job Discovery & Saved Jobs** | `public.jobs` + `public.job_sources` + 3-tier deduplication + circuit-broken board adapters (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) + `public.saved_jobs` | `lib/jobsources/*`, `lib/agent/discovery.ts`, `app/api/jobs/route.ts`, `app/api/saved-jobs/route.ts` |
| 12 | **Applications & Approval State Machine** | `public.applications` + `public.agent_tasks` + deterministic state machine + approval snapshot + sensitive-question blocker + `AUTOMATION_SUBMIT_ENABLED` kill switch | `lib/applications/*`, `lib/apply/*`, `app/api/applications/**/route.ts` |
| 13 | **Background Jobs, Cron & Workers** | `vercel.json` (5 scheduled `CRON_SECRET`-gated endpoints) + `lib/agent/pipeline.ts` + isolated worker entrypoints (`workers/*`) | `vercel.json`, `app/api/cron/*/route.ts`, `lib/agent/pipeline.ts`, `workers/*` |
| 14 | **Admin Console, Security & Vault** | `public.admin_users` (`requireAdminUser`), fail-closed PII audit (`requireAuditEvent`), AES-256-GCM credential vault (`ENCRYPTION_MASTER_KEY`), TOTP MFA | `lib/admin.ts`, `packages/security/crypto.ts`, `app/admin/**`, `app/api/admin/**/route.ts` |
| 15 | **Observability, CI/CD & Deployment** | `lib/observability.ts` (`x-request-id`, error classification, redacted JSON logs), `public.audit_logs`, GitHub Actions (`ci.yml`, `security-scan.yml`), Vercel (`modernjob`) | `lib/observability.ts`, `lib/audit.ts`, `app/api/health/route.ts`, `.github/workflows/*.yml` |

---

## 3. Server vs. Client Component Discipline

- **Server Components by default**: Authenticated pages (`app/(dashboard)/dashboard/page.tsx`, `app/settings/page.tsx`, `app/admin/**/page.tsx`) fetch data on the server using `requireUserOrRedirect` and pass serialized plain-JSON props into interactive client islands.
- **Explicit `'use client'` boundaries**: Any component importing `useState`, `useEffect`, `useRouter`, `useSearchParams`, or Framer Motion hooks (`components/dashboard/DashboardView.tsx`, `components/site/GoogleButton.tsx`, `app/**/error.tsx`) MUST declare `'use client';` at line 1.
- **No Server Actions for mutations**: Mutations flow through explicit, rate-limited, Zod-validated `app/api/**/route.ts` handlers rather than implicit Server Actions, ensuring uniform rate limiting, auth auditing, and mobile Bearer-token compatibility.
