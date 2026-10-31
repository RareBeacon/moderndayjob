# Jobiest - Coding Agent Operating Rules

Read this document and the six companion authority documents before changing any code:
- `ENGINEERING_STANDARDS.md` - 20 permanent engineering standards
- `ARCHITECTURE.md` - System domains and sources of truth
- `AUTHENTICATION.md` - Auth, OAuth PKCE, MFA, and 30m/7d session lifecycle
- `DATABASE.md` - Live PostgreSQL schema (`001`..`046`), RLS, RPCs, and storage
- `TESTING.md` - Verification commands, security regression guards, and E2E matrix
- `DEPLOYMENT.md` - 8-stage pre-deployment gate, Vercel preview workflow, and rollback plan

## Non-Negotiable Rules

1. **Read before writing**: Inspect relevant modules, migrations, and tests before modifying code. Never overwrite or rewrite working production flows without a demonstrated defect.
2. **Untrusted frontend**: Never trust client-supplied `user_id`, plan, role, price, quota, or entitlement state. Authorize every protected and paid operation server-side.
3. **Database truth & RLS**: Enforce multi-tenant isolation via PostgreSQL Row-Level Security (`RLS`) on every `public` table (`tests/security-baseline.test.ts`). Never disable RLS or add `USING (true)` / `WITH CHECK (true)` policies.
4. **Live schema alignment**: `public.profiles` uses `user_id` as its primary key (`full_name`, `email`, `phone`, `target_roles text[]`, `account_status`), NOT `id` or `display_name`. Always verify column names against `DATABASE.md` and `supabase/migrations/`.
5. **Secrets hygiene**: Never place secrets, service-role keys, payment keys, encryption keys, or tokens in source code, Git, client bundles (`.next/static`), logs, or plaintext DB columns.
6. **No inbox access**: Never add Gmail inbox access or email-reading OAuth scopes (`D-001`).
7. **Preserved runtime invariants**:
   - `/` (homepage) must NEVER be added to `middleware.ts` `matcher` or `PROTECTED`.
   - `/auth/callback` and `/api/auth/oauth` must NEVER be intercepted by `middleware.ts`.
   - `components/dashboard/DashboardView.tsx` must retain `'use client';` at line 1 (uses `useRouter`).
   - Every `app/api/**/route.ts` must call `enforceRateLimit(...)` and carry either a server auth marker (`requireUser`, `requireAdminUser`, webhook HMAC, `CRON_SECRET`) or an explicit entry in `PUBLIC_ROUTES` in `tests/security-baseline.test.ts`.
   - Every `SECURITY DEFINER` SQL function must pin `set search_path = public` (or `'public'`).
   - Do not export non-route helpers from `app/api/**/route.ts` (breaks Next.js 15 route typegen); place shared helpers under `lib/`.
   - Source files under `app/`, `components/`, `lib/`, `packages/`, and `workers/` must contain zero `\u2014` characters and zero prohibited terms (`tests/copy-guard.test.ts`).
   - Zod 4 (`^4.6.7`) is used across the workspace; prefer `z.guid()` for UUID validation.
8. **Governance & approval**:
   - Never run destructive database migrations or modify production records without explicit owner approval.
   - Never introduce paid third-party infrastructure without explicit owner approval.
   - Never deploy to production (`main`) without passing all mandatory checks (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, post-build `security-baseline`, Vercel Preview verification) AND explicit release authorization.
