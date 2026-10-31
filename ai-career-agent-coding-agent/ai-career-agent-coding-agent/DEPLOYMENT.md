# Jobiest - Deployment Safety, Preview Gates & Rollback Guide

## 1. Deployment Topology

| Component | Target | Trigger & Integration |
|---|---|---|
| **Web App & API (`Next.js 15`)** | Vercel project `modernjob` (`https://jobiest.com`) | GitHub-integrated: branch pushes build **Vercel Preview** deployments; merges to `main` build **Vercel Production**. |
| **Scheduled Pipelines (5 Crons)** | Vercel Cron (`vercel.json`) | Authenticated via `Authorization: Bearer $CRON_SECRET` (`daily-pipeline`, `security-digest`, `security-scan`, `seo`, `first-win-email`). |
| **CI & Security Workflows** | GitHub Actions (`.github/workflows/ci.yml`, `security-scan.yml`) | Runs Gitleaks, `npm audit`, TypeScript, Lint, Vitest, `next build`, post-build `B-003` bundle secret scan, Semgrep, Playwright E2E smoke, and OWASP ZAP baseline. |
| **Database & Storage** | Supabase PostgreSQL + Auth + Storage | Managed via forward-only SQL migrations (`supabase/migrations/001..046`). |

---

## 2. Mandatory 8-Stage Pre-Deployment Gate

**NO PRODUCTION DEPLOYMENT WITHOUT PRIOR VERIFICATION.**  
Production deployment (merging to `main`) is permitted **only** after all 8 stages succeed:

1. **Static verification**: `npm run typecheck` and `npm run lint` pass with `0` errors.
2. **Dependency & secret scan**: `npm audit --omit=dev --audit-level=high` (`0` high/critical) and Gitleaks pass.
3. **Automated test suite**: `npm test` (`vitest run`) passes `100%` of unit, integration, route-auth, RLS-guard, session-policy, and billing tests.
4. **Production build & client bundle scan**: `npm run build` succeeds across all routes AND post-build `npx vitest run tests/security-baseline.test.ts` confirms zero secrets/unexpected JWTs in `.next/static`.
5. **Database migration review**: Any SQL migration is additive/backward-compatible, enables RLS, pins `search_path` on `SECURITY DEFINER` functions, and has owner approval before execution against production Supabase.
6. **Vercel Preview deployment**: Branch is pushed (`origin/<branch>`) and the Vercel `Preview` deployment reaches `READY` (`state: success`).
7. **Preview E2E / smoke verification**: Critical public, auth-redirect, OAuth starter, and health checks pass against the preview deployment (via `.github/workflows/ci.yml` `workflow_dispatch` `base_url` or Playwright).
8. **Explicit release authorization**: Project owner authorizes merging the verified PR into `main`.

---

## 3. GitHub & Vercel Protection Checklist

Repository settings recommended on `RareBeacon/moderndayjob` (`Settings -> Rules -> Rulesets -> New branch ruleset` targeting `main`):
- **Restrict deletions** and **Block force pushes** on `main`.
- **Require a pull request before merging** (`1` approving review from owner; dismiss stale approvals on new commits).
- **Require status checks to pass before merging**:
  - `Secret scan (gitleaks)`
  - `Typecheck · Tests · Build`
  - `Semgrep static analysis`
  - `Vercel` (Preview deployment ready)
- **Vercel Environment Separation**:
  - Keep live payment webhook secrets (`FLW_SECRET_*`, `PAYSTACK_SECRET_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`), `CRON_SECRET`, and `AUTOMATION_SUBMIT_ENABLED` scoped appropriately between `Preview` and `Production` in Vercel Project Settings.

---

## 4. Rollback & Incident Recovery Plan

### A. Application Rollback (Stateless / Instant)
1. **Via Vercel Dashboard**: Open `modernjob -> Deployments`, locate the last known healthy `Production` deployment (verified via `/api/health` `.commit`), and click **Instant Rollback**. Traffic switches within seconds without rebuilding.
2. **Via Git Revert**: Run `git revert <bad-merge-sha>` on a branch, verify CI + Preview, and merge the revert PR to `main` so Git history matches live production.

### B. Database Migration Recovery (Separated from App Rollback)
- **Never roll back application code past an incompatible schema change without checking compatibility.**
- All Jobiest migrations MUST follow **expand-and-contract**:
  1. Add nullable columns, new tables (with RLS), `CREATE OR REPLACE FUNCTION`, or additive indexes first (`IF NOT EXISTS`).
  2. Deploy application code that tolerates both pre- and post-migration states (for example, `lib/session.ts` HMAC fallback when `app_sessions` is absent, and `lib/credits.ts` fallback when `046` RPC is absent).
  3. Never run `DROP TABLE` / `DROP COLUMN` in the same release as an application change. If a migration introduces a faulty RPC or policy, ship a forward-fixing `047_*.sql` migration restoring the prior function/policy definition rather than mutating historical migration files.
