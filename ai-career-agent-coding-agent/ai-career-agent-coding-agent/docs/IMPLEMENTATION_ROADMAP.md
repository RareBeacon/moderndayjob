# ModernJob, Implementation Roadmap

Source of truth for the build, grounded in the **actual** repository state (commit `de6d9e4`, deployed to jobiest.com).
Statuses: ✅ done · 🟡 partial · ⬜ todo. Supabase migrations present: `001`-`024` (all applied to production). Test suite: 578 passing tests / 60 files. **No Gmail/inbox access** (application email only), see `DECISIONS.md D-001`.

## Principles
- Profession-agnostic (the profession is user data).
- Truthful applications only, never fabricate; traceable to source facts.
- Server-authoritative: entitlements, quotas, ownership, payments are never trusted from the browser.
- Never bypass CAPTCHA / bot protection / logins / site terms.
- Build → typecheck → tests → migration → deploy, in that order.

## Phase 0, Foundation & design system ✅ (this increment)
- Design tokens (color, type, radius, shadow, focus ring) in `globals.css`.
- Inter/system type, accessible focus states, reduced-motion, responsive grids.
- Shared `components/site/{Header,Footer,AuthShell}.tsx`.
- Hardened root `layout.tsx` (metadata, OG, viewport, skip link).

## Phase 1, Marketing site & auth UX ✅ (this increment)
- Full profession-agnostic landing page (hero, features, how-it-works, pricing, CTA, footer).
- Redesigned `/login` and `/signup` (branded auth card, show/hide password, loading, friendly errors, `?next=` redirect, email-confirmation handling).
- **Infra fix:** middleware now protects `/profile`, `/documents`, `/applications`, `/billing` (was open); `?next=` honored.

## Phase 2, Onboarding wizard 🟡
- Progressive wizard matching `USER_JOURNEY_FLOW` + `UIUX_BRIEF §4`: identity → locations → target roles/keywords → background (CV upload + manual) → application email → mode (Draft/Assist/Approval/Auto) → daily target → activate.
- Server-validated steps; resumable; profile completeness drives next step.

## Phase 3, Profile & documents ✅ (partial)
- ✅ Profile editor, prefill, validation, application email, export, delete (`ada0894`).
- ✅ Master-CV PDF upload (private bucket, MIME + `%PDF-` signature, 5 MB, SHA-256, signed URLs).
- ⬜ Generated document-version model (immutable versions, source-fact references).
- ⬜ Profile completeness → drives onboarding/dashboard guidance.

## Phase 4, Job discovery & matching ✅
- ✅ Adapter interface with injectable fetch, 10s timeout, no retries, per-source error isolation (`lib/jobsources/`).
- ✅ Greenhouse + Lever + Ashby adapters, no generic scraper. Registry-driven from `job_sources` (migration 024) with compliance metadata, per-source kill switch and a circuit breaker (3 failures = 1h cooldown).
- ✅ Two-tier dedupe: unique(source, external_id) upserts + query-time duplicate_key collapse (earliest listing wins, nothing deleted); freshness window (30 days unseen = out of search/matching); content_hash on every upsert.
- ✅ Prompt-injection isolation for job text (`lib/ai/injection.ts` + corpus tests), deterministic explainable matching (`lib/matching/`).
- ✅ Per-source compliance record: `docs/compliance-matrix.md`.

## Phase 5, Application intelligence ✅
- ✅ Deterministic CV / cover letter / answers generation from **verified profile facts only** (no AI hallucination path for documents).
- ✅ Truthfulness guard with source facts; approval/assist state machine with server-side gates (duplicate, expiry, required fields, authorization, entitlement, platform support).
- ✅ Approval snapshots (B-181): approval bound to the exact package hash + email, 24h window, stale/expired approvals revert to AWAITING_APPROVAL and nothing is submitted.
- ✅ Sensitive-question policy (B-184): salary, work authorization, demographic, criminal, legal and disability questions are never auto-answered.
- ✅ Timeout reconciliation (B-186): unknown submit results surface as UNKNOWN, never auto-retried.
- ✅ Full audit timeline (application events + audit_logs). Approval is default; **auto-submit stays behind the AUTOMATION_SUBMIT_ENABLED kill switch (default off) until launch gates pass.**

## Phase 6, Billing (Flutterwave) 🟡
- ✅ Plans, entitlements, atomic AI-credit + application-slot reservation.
- 🟡 OAuth token acquisition + secret-hash webhook validation exist.
- ⬜ Validate the **real** Flutterwave charge/verify contract from official docs; implement checkout → redirect → verify → idempotent entitlement update; sandbox tests for Basic & Premium. Never grant paid access from a redirect alone.

## Phase 7, AI provider layer 🟡
- ✅ AES-256-GCM credential vault (`ENCRYPTION_MASTER_KEY`), service-role-only writes (`ai_credentials`).
- ✅ Provider abstraction: OpenAI-compatible provider (any base URL, egress-guarded per B-223) + Ollama strong/fallback models; gateway failover; usage metering + ai_usage ledger.
- 🟡 User-facing credential management UI (currently admin-managed); prompt versioning.

## Phase 8, Workers & scheduling 🟡
- ✅ Lease-based agent task lifecycle; idempotent daily discovery enqueue; single pipeline implementation shared by the free production path (Vercel Cron `/api/cron/daily-pipeline`) and the always-on worker.
- ✅ SSRF-hardened, shared-secret-authenticated browser worker code (isolated Playwright host), healthz + failover client.
- ⬜ Deploy the browser worker + scheduler to a paid host (blocked on account budget). Auto-submit stays off until then.

## Phase 9, Trust, admin, security ✅ (core)
- ✅ Application event timeline, status transitions, audit log with outcome/request-id/hashed client signals (B-060), admin dashboards (users, credentials, analytics, seo) with PII-safe admin views.
- ✅ Kill switches: global AUTOMATION_SUBMIT_ENABLED, AGENT_DRY_RUN, per-user agent pause, per-source job_sources.enabled.
- ✅ Capability policy engine (deny-by-default, audited denials), egress allowlist (B-223), injection corpus in CI (B-221), SSRF guards.
- ✅ RLS on every table (production audit D1/D2 clean), quota-race tests (atomic RPCs), duplicate webhook tests, idempotency tests.
- ⬜ Flutterwave payment sandbox E2E (tracked in Phase 6).

## Phase 10, Launch gates 🟡
- ✅ Unit/integration: 578 passing tests incl. security suites (admin, gateway, SSRF, injection corpus, state machine, gates).
- ✅ Production live-verification passes on jobiest.com (design probes, API behavior, approval snapshot cycle, sensitive-question gate, DB RLS audits).
- 🟡 E2E (onboarding/document/application) browser suite not yet built; error monitoring is healthz-level only.
- ⬜ Backup/rollback drill, staging environment. Autonomous submission stays off until all gates pass.

## Deployment
- Web on Vercel (Next.js). Workers on Render (when budget allows). DB/Auth/Storage on Supabase. Billing on Flutterwave. AI via user-supplied OpenAI-compatible endpoints + optional server Ollama.
- Vercel project: `rootDirectory` = `ai-career-agent-coding-agent/ai-career-agent-coding-agent`, `nodeVersion` = `20.x`, Git-linked; pushes to `main` auto-deploy (jobiest.com).
- Build gate before every deploy: `npm run typecheck` && `npm test` && `npm run build` (typecheck requires `npm ci` first).
