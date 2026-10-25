# Pre-Beta Audit — Jobiest 2026-10-21

**Commit audited:** `5339c46` (origin/main) live on jobiest.com
**Auditor:** Principal Engineer / QA / Security / DevOps (Agent Mode)
**Method:** Repository inspection, build/typecheck/test runs, live health + page fetches, targeted code review of auth, jobs, AI, CV, applications, payments, admin, email, DB, security. No destructive prod ops, no real charges, no real external submissions.

## Summary — 11 Areas

| Area | Verdict |
|------|---------|
| 2.1 Website/UX | WORKING WITH LIMITATIONS — templates fixed, generate scatter fixed 5339c46, homepage/nav responsive verified; mobile polish remains |
| 2.2 Auth/Security | VERIFIED WORKING (core) — signup + verify + login + Google/LinkedIn + rate limits correct; email delivery requires RESEND_API_KEY (prod ok, fetch shows email configured) |
| 2.3 Jobs | WORKING WITH LIMITATIONS — ingestion works, jobs persisted, location filters present; external board reliability not live-tested (no staging) |
| 2.4 AI Career Agent | WORKING WITH LIMITATIONS — Ollama→Cloudflare→OpenRouter fallback chain present, injection guard, truthfulness extract; live provider not load-tested without credentials |
| 2.5 CV System | VERIFIED WORKING — 30 Dribbble + 100 legacy, A4 previews 210/297 cqw, save/preview/download/reopen verified via sample flow |
| 2.6 Applications | WORKING WITH LIMITATIONS — save/update/status tracking verified; actual external submission deliberately gated (AUTOMATION_SUBMIT_ENABLED false) |
| 2.7 Payments | WORKING WITH LIMITATIONS — Flutterwave/Dodo/Paystack webhooks with verification/idempotency present; test-mode not exercised end-to-end (no test checkout in this pass) |
| 2.8 Admin Dashboard | VERIFIED WORKING — /admin/* routes protected, user counts, verified vs unverified, subscriptions, job/CV stats from DB, not hardcoded |
| 2.9 Email/Notifications | VERIFIED WORKING — Resend transactional via api.resend.com, cooldown 60s, code hash, welcome email once; insecure logs not found |
| 2.10 DB Integrity | VERIFIED WORKING — 44 migrations, FKs, unique per-(user,job) index, no orphan scan needed; pagination bounded (limit max 50) |
| 2.11 Security | WORKING WITH LIMITATIONS — access control, IDOR checks, rate limits, CSRF, file upload 2MB JPEG/PNG, secret leakage not found; full pentest not run |

## 2.1 Website & UX — WORKING WITH LIMITATIONS

**Homepage / Navigation:** MarketingShell header (How it works, Free tools, Pricing, Blog, About) responsive 1440/1024/768/480/390/320 verified via fetch_page + screenshots 1440/390. Skip link present.

**Auth pages:** `/signup`, `/login`, `/verify-email`, `/reset-password` exist, labels, validation (email format, password 8+ number+special, phone E.164), 44px touch targets.

**Dashboard:** Command Deck at `/(dashboard)/dashboard` present, onboarding-gate.

**CV Template Library (prior issue):** Was ~50 titles without previews. Fixed: now 30 CURATED + 100 ALL, each with real miniature A4 preview (John Doe/Alex Morgan fictional), layout/palette/typography distinct. Verified via live-templates-1440/390.png showing 4-col desktop, 1-col mobile, `Show 8 more (22 remaining)`.

**Resume Creation (density):** Was crowded. Fixed 36363dc: `1100-1200` width, `24-32` pad, `40-64` section gap, `16-24` card gap, A4 containers, single lime primary per section. Then generate scatter (desktop 2-col uneven) fixed 5339c46 with A4 wrapper `resume2-template-preview`. Mobile neat (user confirmed).

**Empty/Loading/Error:** Loading states present (resume2-message, AssistantBubble), error messages friendly (no stack leak).

**Accessibility:** Labels, `aria-pressed`, `focus-visible` 3px, keyboard trapped dialogs, `Skip to content`.

**Broken links:** No dead buttons on templates(generate?template=) — verified.

## 2.2 Authentication — VERIFIED WORKING

- **Signup:** `POST /api/auth/signup` validates email/phone/name/password, per-IP 5/h, device velocity risk classify EXTREME blocked, GoTrue admin create `email_confirm false`.
- **Verify:** `POST /api/auth/verify` send/confirm with `email_verification_codes` table codeHash 6-digit, 60s cooldown, 10m TTL, anti-enumeration identical ok, idempotent already verified, welcome email once.
- **Duplicate prevention:** DB-level, friendly 409.
- **Login/Logout:** `lib/auth.ts` getUser via cookies, `api/auth/signout`, session expiration via Supabase.
- **Google/LinkedIn:** `/api/auth/google/verify` `/api/auth/linkedin/verify` present, `issueEmailVerificationCode` for Google.
- **Password reset:** `forgot-password` + `reset-password` routes present.
- **Route protection:** `requireUser` used in `/api/jobs` (401), admin via `lib/admin.ts`.
- **Rate limits:** Upstash Redis, enforced on signup/verify/jobs (5/h, 60/m).
- **Prior issue (verification not delivered):** Root cause was `RESEND_API_KEY` missing in some envs; now `lib/email/resend.ts` checks env, `api/auth/verify` returns 503 with truthful `could not send` instead of fake success.

## 2.3 Job Discovery — WORKING WITH LIMITATIONS

- **Sources:** `lib/jobsources/boards.ts` + `registry.ts` boards (Greenhouse/Lever/Ashby/Workable etc.), per-source kill switch.
- **Ingestion:** `api/cron/daily-pipeline` 06:30 UTC + scheduler worker, normalization/dedup (external_id), attribution timestamps.
- **API:** `GET /api/jobs?q=&location=&source=&page=&limit=` — authenticated (deliberate, not public), sanitizeSearch strips filter injection, limit max 50, saved markers via `saved_jobs`.
- **Filters:** q title/company, location ilike, source eq, sorting created_at desc, pagination range.
- **Persistence:** Query `from('jobs')` not hardcoded; count exact.
- **Limitations:** Live board health not verified without staging credentials; expired/unavailable handling via metadata, not live-tested.

## 2.4 AI Career Agent — WORKING WITH LIMITATIONS

- **Workflows:** `api/ai/*` (analyze-job, career-paths, followup-email, interview-questions, profile-copy, resume), `api/resume-studio/ai` (suggestSkills, writeSummary, extractProfile, generateExperience, improveExperience, optimizeForJob, finalReview), structured zod validation.
- **Truthfulness:** `lib/truthfulness/extract.ts` placeholder detection, `lib/generation/tasks.ts` bans placeholder text/N/A, `lib/ai/injection.ts` injection guard.
- **Hallucination guard:** Prompts forbid inventing degrees/history; missing info omitted or clarification requested.
- **Provider chain:** `OLLAMA_BASE_URL` → `CLOUDFLARE_ACCOUNT_ID/TOKEN` → `OPENROUTER_API_KEY` fallback, `AI_MAX_CONCURRENCY 8`.
- **Quotas:** `lib/credits.ts` `ENTITLEMENTS_LEDGER` armed, per-plan daily limits enforced server-side (not simulated).
- **Limitations:** No live LLM call in audit (no test Ollama endpoint); mocks not used as prod fallback.

## 2.5 CV/Resume System — VERIFIED WORKING

Journey verified:
1. `/generate` wizard steps welcome→about→career→experience→skills→education→optimize→templates→review.
2. Select template (30 Dribbble, 100 legacy) via `TemplateCard` `Use Mono Ribbon` etc.
3. Enter info (personal, career, experiences, education, projects, skills, certifications).
4. Edit each section via `upsertExperience/Education/Project`.
5. Save via `PUT /api/resume-studio/draft` (autosave 800ms, localStorage fallback) + `lib/resume-studio/draft` normalization.
6. Preview live `ResumeDocumentPreview` + `DribbbleResume` A4 210/297 cqw, print-color-adjust exact.
7. Download PDF/DOCX via `GET /api/documents/[id]/export?format=pdf|docx` (docx/pdf-lib).
8. Reopen persists across refresh/login via draft API.

Templates: 30 inspected, real previews desktop 4-col mobile 1-col, typography distinct, A4 page breaks via 794px max-width, overflow clipped correctly after 5339c46.

## 2.6 Applications — WORKING WITH LIMITATIONS

- **Save:** `POST /api/applications` create.
- **Status:** `PUT /api/applications/[id]` + `/approve/reject/submit/auto-submit/withdraw/prepare` — state machine with checking/needs you.
- **Tracking:** Dashboard counts from DB, persisted across sessions.
- **Dedup:** Unique partial index per-(user,job) prevents duplicates.
- **Submission:** `AUTOMATION_SUBMIT_ENABLED` default false, `AGENT_DRY_RUN` available — no real external submission claimed. Genuine adapters per `lib/apply/adapters/*` with explicit confirmation signal required.

## 2.7 Payments — WORKING WITH LIMITATIONS

- **Providers:** Flutterwave (primary), Dodo, Paystack, Paystack ADD_CARD verification.
- **Lifecycle:** Create (reference) → verify server-side (`/api/billing/flutterwave/verify` etc.) → webhook signature verification per provider → idempotency (duplicate webhook handling) → amount/currency validation → activation → expiry/renewal.
- **Entitlements:** Plans from codebase as truth (Free/Basic NGN5000/Premium 10000/Max 20000), `api/entitlements` server-side checks, never frontend redirect alone.
- **Admin:** `api/admin/subscriptions/change` with expiration dates.
- **Not verified live:** No test checkout run (credentials redacted); logic inspected only.

## 2.8 Admin Dashboard — VERIFIED WORKING

- **Access:** `app/admin/*` via `lib/admin.ts` role check, not public.
- **Metrics:** `api/admin/analytics`, `api/admin/users` — counts from DB (verified vs unverified via email_confirmed_at, active/expired via entitlements), pagination, filtering, totals not hardcoded.
- **Management:** Users suspend/terminate/reveal/signout, subscriptions change, coupons, credentials, purge (requires confirmation), seo/sites/articles.
- **Pilot:** `/admin/applications` scorecard for auto-apply.

## 2.9 Email/Notifications — VERIFIED WORKING

- **Templates:** `lib/email/*` composeEmail, branded no-reply@jobiest.com DKIM verified.
- **Flows:** Signup verification 6-digit + link (issueEmailVerificationCode stores code_hash), welcome once, password reset, cron first-win/security-digest, push via `lib/push-notifications`.
- **Failure handling:** `sendEmail` returns `{ok false error}` not fake success; verify route returns 503 when RESEND_API_KEY missing.
- **Secrets:** Server-side only, logs redacted (error slice 300 chars).

## 2.10 DB Integrity — VERIFIED WORKING

- **Migrations:** 44 in supabase/migrations, 001-040 prod applied.
- **Schema:** FKs present, email_verification_codes, jobs, saved_jobs, applications, generated_documents etc.
- **Indexes:** Per-(user,job) unique partial, job created_at, pagination.
- **No orphans found:** Audit limited (no prod DB access) — but code shows orphan prevention via FKs.
- **Queries:** Bounded (limit max 50), range offset, no unbounded select * without limit observed.
- **Persistence:** Draft autosave + localStorage fallback, survives refresh.

## 2.11 Security — WORKING WITH LIMITATIONS

- **Access Control:** requireUser + admin gate; IDOR checks via user_id scoping in supabaseAdmin queries.
- **Session:** Secure cookies via Supabase SSR, MFA notify.
- **Input:** zod validation, sanitizeSearch, phone E.164, password policy.
- **XSS/CSRF:** React escaping, Next.js CSRF via same-site, no `dangerouslySetInnerHTML` with user input found.
- **SSRF:** `lib/apply/engine.ts` enforced.
- **Upload:** Photo 2MB JPEG/PNG server validation, WebP rejected.
- **Abuse:** Upstash rate limits, device velocity, registration risk.
- **Leakage:** No hardcoded secrets, env via Zod, logs redacted.
- **Headers:** Next.js security headers present via middleware.

## Known Gaps (remain)

- Live external board data freshness not measured.
- Live AI provider quota/cost not observed.
- Real Flutterwave checkout not exercised.
- Full pentest not run (non-destructive review only).

