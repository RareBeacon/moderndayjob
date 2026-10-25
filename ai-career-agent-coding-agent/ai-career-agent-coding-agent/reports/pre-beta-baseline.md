# Pre-Beta Baseline — Jobiest 2026-10-21

**Commit:** `5339c46380d4` (origin/main = 5339c46, worktree fix/signup-verification-cv-previews-20261019)
**Date:** 2026-10-21 UTC
**Author:** Philip <tobi@jobiest.ai>
**Domain:** jobiest.com **Tagline:** THE AGENT THAT WORKS OVERNIGHT
**Status:** Baseline established before comprehensive audit — no destructive changes.

## 1. Architecture Inventory

### Frontend
- **Framework:** Next.js 15.5.25 App Router, React 19.1.1, TypeScript, Sharp for images, docx + pdf-lib for exports.
- **Routes (app/):** `/`, `/templates` (30 Dribbble-inspired CV library), `/generate` (Resume Studio 2.0 wizard), `/login`, `/signup`, `/verify-email`, `/reset-password`, `/dashboard` (Command Deck), `/applications`, `/portfolios`, `/portfolio/[slug]`, `/settings`, `/pricing`, `/billing/*`, `/admin/*` (users, coupons, seo, security, applications, usage), `/free-*` tools (ATS scanner, cover letter, etc.), `/blog`, plus marketing pages.
- **Layouts:** `app/layout.tsx` (MarketingShell), `components/site/AppShell` (logged-in), `marketing-shell`, `ScrollReveal` entrance animations (`[data-animate]` opacity 0 until IntersectionObserver).
- **CV Rendering:** `lib/resume-studio/templates` (100 ALL, 30 CURATED), `lib/resume-studio/dribbble30.ts` (30 distinct palettes/layouts), `DribbbleResume` + `ResumeDocumentPreview` with `miniViewport`/`fullViewport` (container-type inline-size, aspect-ratio 210/297 cqw scaling), A4 `max-width 794px`, `print-color-adjust: exact`.

### Backend
- **Framework:** Next.js API Routes (serverless) — 60+ routes under `app/api/` including:
  - `api/health` (ok degraded commit time checks database ai_gateway email)
  - `api/auth/*` (signup, verify, google/verify, linkedin/verify, forgot-password, reset-password, signout, mfa)
  - `api/resume-studio/*` (draft, generate, ai, photo 2MB JPEG/PNG)
  - `api/documents/*` (generate, export pdf/docx, download)
  - `api/jobs` (search, filter), `api/applications` (create, [id]/approve/reject/submit/auto-submit/withdraw), `api/entitlements`, `api/billing/*` (flutterwave/dodo/paystack create/verify/webhook, coupon/validate, providers)
  - `api/admin/*` (users, analytics, seo, credentials, purge), `api/cron/*` (daily-pipeline 06:30 UTC, first-win-email, security-digest/scan, seo), `api/free-tools/*`, `api/ai/*`, `api/geo`, `api/portfolios`, `api/notifications`
- **Workers:** `workers/agent`, `workers/browser`, `workers/api`, `workers/scheduler` (tsx entrypoints).

### Database
- **Provider:** Supabase Postgres (ref cbxloutahmalorumaihc, migrations 001-040 applied production).
- **Migrations repo:** `supabase/migrations/` 44 files (001_initial → 020_seo_content_calendar +). Additional migrations 012_pricing_tiers, 013_entitlement_quotas_v2, 014_seo_agent, 015_resume_studio_2, 016_free_tools_2, etc.
- **Key tables (inferred):** profiles, audit_logs, pricing_tiers, entitlements_ledger, seo tables, resume drafts/documents, generated_documents, portfolios, jobs, applications, coupons, admin users.
- **Indexes/Constraints:** Unique partial index per-(user,job) deduplication (Auto-Apply 2.0), FKs implied.

### Authentication & Email Verification
- Supabase SSR (`@supabase/ssr 0.5.2`, `@supabase/supabase-js 2.58.0`), `lib/auth.ts` (getUser serverClient, cookies), `lib/env.ts` lazy Zod validation (SUPABASE_URL/ANON/SERVICE_ROLE required). Email verification via Supabase + Resend (`RESEND_API_KEY`, `RESEND_FROM hello@jobiest.com`). Google OAuth via `GOOGLE_CLIENT_ID/SECRET`, LinkedIn OAuth, MFA notify. `app/(dashboard)` likely protected via onboarding-gate.

### Authorization / Roles
- `lib/admin.ts` admin checks, `app/admin/*` dashboard (users, applications pilot scorecard, seo, usage, security). Role via Supabase claims.

### AI Models / Providers
- Ollama self-hosted first (`OLLAMA_BASE_URL`, `OLLAMA_MODEL qwen2.5:7b fallback llama3.2:3b`), then Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID/TOKEN` gpt-oss-120b), then OpenRouter disaster switch (`OPENROUTER_API_KEY`). `lib/ai/server.ts` concurrency `AI_MAX_CONCURRENCY 8`, gateway fallback chain. User-stored OpenRouter/HuggingFace credentials encrypted at rest (`ENCRYPTION_MASTER_KEY` AES-256-GCM).

### Job Aggregation
- `lib/jobsources/boards.ts` (Greenhouse/Lever/Ashby board tokens), ingestion/normalization/dedup via `api/cron/daily-pipeline` 06:30 UTC, `app/api/jobs`, attribution timestamps, rate limits via Upstash Redis (`UPSTASH_REDIS_REST_URL/TOKEN`).

### CV / Resume System
- 30 Dribbble templates + 100 legacy, `SAMPLE_PREVIEW_DRAFT` Alex Morgan fictional data (never persisted), `DribbbleResume` palette per template, `ResumeDocumentPreview` mini/full, photo upload 2MB, PDF/DOCX export `print-color-adjust: exact`, filename handling via export route.

### Application Tracking
- `api/applications` CRUD, status machine (checking send/needs you), `applications/[id]/prepare/submit/auto-submit`, dashboard counts, admin pilot.

### Payments
- Flutterwave (primary), Dodo, Paystack (ADD_CARD zero-amount verification for auto-apply activation at `/auto-apply/activation`), `api/billing/*` create/verify/webhook, `ENTITLEMENTS_LEDGER` armed, plans: Free (3 docs total, 10 tools/day, manual only), Basic NGN 5000 (3 docs/day, 2 trial auto-apply, 50 tools), Premium NGN 10000 (10 docs/day, 10 auto-apply), Max NGN 20000 (20 docs/day, 20 auto-apply).

### Email / Notifications
- Resend transactional, cron first-win-email, security-digest, in-app notifications, push via `lib/push-notifications.ts`, preferences.

### Scheduled / Background
- Cron daily-pipeline, security-scan/digest, seo, first-win-email; queues via scheduler worker; webhooks Flutterwave/Paystack/Dodo with signature verification.

### File Uploads / Storage
- Supabase Storage? Photo uploads to `/api/resume-studio/photo`, document exports via `/api/documents/[id]/export`, portfolio export.

### Analytics / Observability
- `api/admin/analytics`, `lib/audit.ts` audit logs, `api/client-error` reporting, security scan.

### Deployment
- Next.js on Vercel?/Render with OCI `deploy/oci`, domain jobiest.com, `NEXT_PUBLIC_APP_URL`, middleware proxy, envs via Zod.

### Mobile
- Responsive only (no native app) — globals.css 1440/1024/768/480/390/320 breakpoints.

### Third Parties
- Supabase, Resend, Flutterwave/Dodo/Paystack, OpenRouter, HuggingFace, Ollama Oracle VM, Cloudflare Workers AI, Google OAuth, LinkedIn OAuth, Upstash Redis.

## 2. Safe Baseline Checks (2026-10-21)

**Git:** branch fix/signup-verification-cv-previews-20261019 clean except untracked screenshots/gallery.html + deleted target/route.ts (restored before commits). HEAD 5339c46 fast-forward from 857233a (origin/main now 5339c46 after 2 pushes today). Earlier worktree had no origin remote, used token via https://$TOKEN@github.com.

**Build:** `npx next build` success — `templates 3.86kB` `generate 14.9kB` `First Load 103kB` `Middleware 71.8kB`. `tsc --noEmit` 0. `vitest run` 103 suites 1044 passed 1 skipped (~21s). `next` not found after snapshot purge required `npm ci` (162 packages).

**Health:** `GET https://jobiest.com/api/health` commit `5339c46380d4 ok true degraded false` database ok ai_gateway ok email configured.

**Tests available:** `npm run dev/build/start/typecheck/test/e2e/lint/agent/browser/api/ai/scheduler`. No lint separate from tsc.

**Uncommitted:** screenshots-gallery.html + live/screenshot-*.png (intentionally untracked).

**Destructive ops:** None performed. No DB reset, mass email, real charges, or external submission submissions.

## 3. Environments

- **Development:** Local worktree with dummy Supabase URL for screenshots (https://dummy.supabase.co) — templates render, generate redirects to login when signed out (expected).
- **Production:** jobiest.com (Vercel/OCi) — commit 5339c46 live.

## 4. Limitations

- Production DB not directly inspected (no credentials). Metrics assumed from migrations + admin pages.
- Real Supabase auth not exercised with live email delivery — baseline only checks API.
- Flutterwave test mode available but live credentials redacted — not exercised.
- Staging not identified — using local + production only.

## 5. Next

Proceed to Phase 2 comprehensive audit — verify each journey end-to-end, not via 200 alone.
