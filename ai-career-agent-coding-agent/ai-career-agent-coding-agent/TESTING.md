# Jobiest - Automated Testing & Verification Guide

All commands below run from `ai-career-agent-coding-agent/ai-career-agent-coding-agent/`.

---

## 1. Verification Commands

| Check | Command | What It Verifies |
|---|---|---|
| **Install (clean CI)** | `npm ci --include=dev` | Deterministic lockfile install including TypeScript, Vitest, and Playwright |
| **TypeScript** | `npm run typecheck` | Strict `tsc --noEmit` across `app/`, `components/`, `lib/`, `packages/`, `workers/`, and `tests/` |
| **Lint** | `npm run lint` | Compiler & type-safety verification |
| **Unit / Integration / Security** | `npm test` | Runs all `107` Vitest suites (`1,060+` tests) with mocked/isolated boundaries (never mutates live services) |
| **Production Build** | `npm run build` | Compiles all `126` App Router pages, API routes, and Edge `middleware.ts` |
| **Post-Build Bundle Scan (`B-003`)** | `npx vitest run tests/security-baseline.test.ts` (after `npm run build`) | Scans `.next/static` for leaked keys, `service_role`, `postgres://`, or unexpected JWTs |
| **Playwright E2E Suite** | `E2E_BASE_URL=https://<preview-or-prod> npm run e2e` | Runs Chromium `desktop` + `mobile` (`Pixel 7`) suites in `tests/e2e/` |

> **Local Post-Build Scan Note**: `vitest.config.ts` sets dummy env vars (`NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'`). When testing the post-build `B-003` bundle scan locally without `.env.local`, build with a non-JWT placeholder (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key SUPABASE_SERVICE_ROLE_KEY=test-key npm run build`), run `npx vitest run tests/security-baseline.test.ts`, and remove `.next` afterward if needed.

---

## 2. Test Layers & Authoritative Suites

1. **Source-Level Security & RLS Guards (`tests/security-baseline.test.ts`)**:
   - `D1`: Every table created in `supabase/migrations/*.sql` has RLS enabled.
   - `D2`: Zero permissive `USING (true)` or `WITH CHECK (true)` policies exist.
   - `D6`: Every `SECURITY DEFINER` SQL function pins `search_path`.
   - `B-024`: Every `app/api/**/route.ts` enforces `enforceRateLimit` and carries a server auth marker or reviewed `PUBLIC_ROUTES` entry.
   - `B-005 / F-002 / F-003`: `next.config.mjs` preserves CSP, HSTS, COOP/CORP, and `Cache-Control: no-store` on auth and workspace routes.
   - `B-003`: Post-build `.next/static` client bundle secret scan.
2. **Authentication, OAuth & Session Policy Suites**:
   - `tests/session-app.test.ts`: 30-minute idle timeout, 7-day absolute lifetime, 60s touch throttle, `USER_MISMATCH`, `REVOKED`, HMAC fallback tamper rejection.
   - `tests/oauth-flow.test.ts`, `tests/google-email-verification.test.ts`, `tests/linkedin-email-verification.test.ts`: PKCE cookie/origin preservation, middleware bypass, social verification/completion gates.
   - `tests/middleware.test.ts`, `tests/middleware-routing.test.ts`, `tests/bearer-auth.test.ts`, `tests/auth-signup-route.test.ts`, `tests/auth-verify-route.test.ts`, `tests/reset-password-route.test.ts`.
3. **Billing, Quotas & Multi-Tenant Isolation Suites**:
   - `tests/billing-paystack.test.ts`, `tests/billing-webhook.test.ts`, `tests/billing-dodo.test.ts`, `tests/coupons.test.ts`, `tests/credits.test.ts`, `tests/credits-auto-apply.test.ts`, `tests/entitlements.test.ts`, `tests/admin-subscriptions.test.ts`.
4. **Product, Dashboard Resilience & Observability Suites**:
   - `tests/dashboard-resilience.test.ts`, `tests/observability.test.ts`, `tests/audit.test.ts`, `tests/documents-export.test.ts`, `tests/resume-photo-export.test.ts`, `tests/applications-service.test.ts`, `tests/applications-state-machine.test.ts`, `tests/apply-sensitive.test.ts`, `tests/ssrf.test.ts`.
5. **Playwright E2E Suites (`tests/e2e/`)**:
   - `smoke.spec.ts`: Homepage CTA contrast, mobile zero-overflow, `/api/jobs` 401 gate, stale-cookie `/` public invariance, `/login`, `/dashboard` anonymous bounce, `/pricing`, `/api/health`, plus credential-gated login + sensitive-question gate.
   - `template-auth.spec.ts`: All 30 CV templates pagination + modal preview, mocked signup delivery-failure recovery, manual vs emailed OTP verification behavior.
   - `reliability-matrix.spec.ts`: `/signup`, `/tools`, `/free-ats-resume-scanner`, `/login?expired=1` notice, protected workspace/admin redirects, Google OAuth PKCE `302` + cookie contract, anonymous API `401`/`403` enforcement, `/api/health` `x-request-id` correlation echo, and credential-gated session reload + navigation + sign-out invalidation.

---

## 3. Test Data Safety & Honest Reporting Rules

- **Never mutate or delete real user records** during automated testing.
- Unit and integration tests mock Supabase/external HTTP boundaries deterministically and require zero live credentials.
- Live authenticated Playwright E2E tests (`E2E_EMAIL` / `E2E_PASSWORD`) execute only idempotent or test-account-scoped checks and skip cleanly when credentials are not supplied.
- Every verification report MUST classify each check honestly as **`Passed`**, **`Failed`**, **`Blocked`** (with exact environment/permission blocker), or **`Not tested`** - never report skipped or blocked checks as passed.
