# Jobiest - Permanent Engineering Standards

These 20 standards are mandatory across all engineering work on Jobiest (`https://jobiest.com`).

---

## A. Code Quality
1. **Strict TypeScript everywhere**: Maintain `0` TypeScript errors (`npm run typecheck`). Avoid `any` in new modules; define explicit domain and API boundary types.
2. **Runtime validation at boundaries**: Validate all untrusted external inputs (HTTP bodies, query strings, webhooks, AI responses, uploaded file bytes) using Zod schemas and magic-byte checks before processing.
3. **Clear server/client separation**: Keep secrets, database clients (`supabaseAdmin`), and entitlement logic strictly on the server; add `'use client';` at line 1 of every component using React client hooks or browser APIs.
4. **Reusable error handling**: Funnel unexpected failures into structured server logs (`lib/observability.ts`) and user-safe fallback UI (`DashboardFallback`, `error.tsx`) with correlation reference IDs (`digest` / `x-request-id`).
5. **Minimal, cohesive modules**: Place shared logic in `lib/` or `packages/`; never export non-HTTP helper functions from `app/api/**/route.ts`.

## B. Authentication & Security
6. **Never trust client identity**: Derive caller identity exclusively on the server via `requireUser` / `requireAdminUser` / verified `supabase.auth.getUser()`; ignore client-supplied `userId`, `role`, or `plan` fields.
7. **Always enforce RLS**: Enable Row-Level Security on every `public` table, prohibit `USING (true)` / `WITH CHECK (true)` policies, and pin `SET search_path = public` on every `SECURITY DEFINER` function.
8. **Validate sessions server-side**: Enforce the 30-minute inactivity timeout and 7-day absolute session lifetime (`lib/session.ts` + `public.app_sessions`) across `middleware.ts` and `requireUser()`.
9. **Protect secrets strictly**: Never expose `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_MASTER_KEY`, payment secrets, or provider tokens in Git, logs, or `.next/static` bundles (`B-003` post-build scan).
10. **Validate redirects and callbacks**: Restrict `next` / `redirectTo` targets to relative single-slash paths (`!startsWith('//')`, no `://`) and resolve OAuth origins solely through `resolveRequestOrigin` (`lib/auth/oauth-origin.ts`).

## C. Reliability
11. **Graceful degradation**: Guard non-critical queries and advisory integrations (analytics, email delivery, AI fallbacks, period-grant checks) so partial subsystem failures degrade gracefully rather than crashing pages.
12. **Secret-free structured logging**: Emit structured logs with correlation IDs (`x-request-id`) and error categories (`AUTH`, `DATABASE`, `NETWORK`, `EXTERNAL_API`, `VALIDATION`, `RATE_LIMIT`, `ENTITLEMENT`, `INTERNAL`), redacting secret patterns via `redactSecrets()`.
13. **Idempotent initialization & webhooks**: Make user/profile creation (`ensureProfile`), credit grants (`credit_ensure_user_period_grants`), and payment webhooks (`apply_verified_payment`, `apply_quoted_payment`) safe to retry repeatedly without duplicate grants or data loss.
14. **Defensive query handling**: Scope all user queries with `.eq('user_id', user.id)`, use `.maybeSingle()` when a record may not exist yet, and sanitize free-text search inputs before `.or()` filters.
15. **Timeout & rate-limit protection**: Enforce `enforceRateLimit` on `100%` of API routes (`B-024`) and attach `AbortSignal.timeout(...)` to outbound HTTP calls (AI gateways, session REST calls, health checks, webhooks).

## D. Deployment Discipline
16. **Verify before deploy**: Run `typecheck`, `lint`, `npm audit`, `vitest`, `next build`, and post-build `security-baseline` before any deployment.
17. **Preview before production**: Validate changes on a branch/PR Vercel Preview deployment and CI checks before merging to `main`.
18. **Additive, reversible migrations**: Write forward-only, backward-compatible SQL migrations (`IF NOT EXISTS`, expand-and-contract) and obtain owner approval before running destructive schema changes.

## E. Change Management
19. **Inspect before editing**: Read existing implementations, tests, and authoritative docs (`AGENTS.md`, `ARCHITECTURE.md`, `AUTHENTICATION.md`, `DATABASE.md`) before proposing or writing changes.
20. **Preserve working production paths**: Do not rewrite working authentication, dashboard, billing, or RLS subsystems without a demonstrated defect, root-cause evidence, and regression test coverage.
