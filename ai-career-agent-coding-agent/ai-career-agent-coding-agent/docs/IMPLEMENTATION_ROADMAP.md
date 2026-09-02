# ModernJob, Implementation Roadmap

Source of truth for the build, grounded in the **actual** repository state (commit `ada0894`).
Statuses: ✅ done · 🟡 partial · ⬜ todo. Supabase migrations present: `001`-`005`. **No Gmail/inbox access** (application email only), see `DECISIONS.md D-001`.

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

## Phase 4, Job discovery & matching ⬜
- Adapter interface (`health`, `normalize`, `dedupe`, rate-limit handling, error isolation).
- Greenhouse → Lever → Ashby adapters. No generic scraper.
- Canonical URLs, content-hash dedupe, deterministic filtering, explainable scoring.
- Prompt-injection isolation for job text.

## Phase 5, Application intelligence ⬜
- Personalized CV / cover letter / answers from **verified profile facts only**.
- Truthfulness guard + source references; approval/assist state machine.
- Duplicate / expiry / required-field / authorization gates; full audit timeline.
- Approval is default; **no external submission until all gates + tests pass.**

## Phase 6, Billing (Flutterwave) 🟡
- ✅ Plans, entitlements, atomic AI-credit + application-slot reservation.
- 🟡 OAuth token acquisition + secret-hash webhook validation exist.
- ⬜ Validate the **real** Flutterwave charge/verify contract from official docs; implement checkout → redirect → verify → idempotent entitlement update; sandbox tests for Basic & Premium. Never grant paid access from a redirect alone.

## Phase 7, AI provider layer ⬜
- AES-256-GCM credential vault (`ENCRYPTION_MASTER_KEY`), admin-only write/rotate.
- OpenRouter adapter + Hugging Face fallback; prompt versioning; Zod output validation; token accounting; provider fallback/retry.

## Phase 8, Workers (Render) & scheduling 🟡
- 🟡 Lease-based agent task lifecycle; idempotent scheduler; SSRF-hardened browser worker.
- ⬜ Health endpoints, graceful shutdown, deploy scheduler/agent/browser workers. Do **not** deploy browser worker until source adapters + tests exist.

## Phase 9, Trust, admin, security ⬜
- Application event timeline, status transitions, audit log UI, admin kill switch.
- RLS user-A/user-B + anonymous tests; payment sandbox; duplicate webhook; quota-race; SSRF; idempotency.

## Phase 10, Launch gates ⬜
- Unit, integration, E2E (onboarding/document/application), security audit, error monitoring, backup/rollback, staging deploy. Autonomous submission stays off until all gates pass.

## Deployment
- Web on Vercel (Next.js). Workers on Render. DB/Auth/Storage on Supabase. Billing on Flutterwave. AI via OpenRouter/HF.
- Vercel project `modernjob`: `rootDirectory` = `ai-career-agent-coding-agent/ai-career-agent-coding-agent`, `nodeVersion` = `20.x`. Project is **not** Git-linked, deploys are API-triggered (or link the repo for auto-deploy).
