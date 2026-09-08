# Implementation status

This repository now contains the implementation scaffold, executable SQL migration, core API routes, authentication UI, billing UI, admin UI, entitlement/security services, encrypted credential service, and isolated worker entrypoints for the agreed product.

## Included
- Profession-agnostic multi-tenant workspace creation on signup.
- Free forever: 2 AI career/document credits/day.
- 7-day automation trial with 15 total application capacity represented in the product architecture.
- Basic ₦5,000/month, 10 automated applications/day.
- Premium ₦10,000/month, 20 automated applications/day.
- Flutterwave checkout and webhook verification path.
- Per-user encrypted OpenRouter/Hugging Face credentials.
- No Gmail inbox access; application email is just a user-provided field.
- Server-side entitlements, atomic quota reservation and idempotent applications.
- Supabase RLS and admin audit/termination architecture.
- IP rate-limit integration point using Upstash Redis.
- Playwright browser worker isolation and SSRF guard.
- Tally webhook integration point.

## Before production launch
1. Apply the Supabase migration.
2. Configure Flutterwave live plan IDs and webhook secret/hash.
3. Configure OpenRouter/Hugging Face credentials per user through an admin-only encrypted credential flow.
4. Finish the admin credential write/rotate UI.
5. Add full job-source connectors and site-specific Playwright form adapters.
6. Add PDF rendering/storage and CV upload scanning.
7. Add automated E2E, security, payment-sandbox and browser tests.
8. Configure Upstash Redis and verify all sensitive endpoints have rate limits.
9. Configure Render environment variables and separate web/agent/browser/scheduler services.
10. Run a production readiness review before enabling live autonomous submission.

## Wave 5 (tests & hardening) — in progress
- `tests/billing-webhook.test.ts` (11 tests): verif-hash timing-safe check (401 before any work), event filtering (`transfer.*`, failed tx, malformed JSON), server-side re-verification + amount/currency/email guards, replay/idempotency contract (`apply_verified_payment` + `payment_events` upsert with `ignoreDuplicates`).
- `tests/admin-security.test.ts` (9 tests): non-admin 403 on terminate/credential routes, terminate (related accounts + work-cancel + global sign-out + audit), suspend, sign-out-everywhere, credential add (ciphertext ≠ plaintext, key_version 1) / revoke / rotate (requires new key, revoke-then-issue with key_version+1).
- `tests/entitlements.test.ts` (9 tests): `assertEntitlement` account-status gate (`ACCOUNT_BLOCKED`) and automation entitlement gate; `createUsageMeter` reserve via `consume_ai_credit`, `AI_QUOTA_EXHAUSTED` → `AIGatewayError`, refund best-effort (never throws).
- Delivered as commit `d2472c8`; suite now 21 files / 203 tests (was 18 / 174), `tsc --noEmit` clean, `next build` clean, Vercel production deploy green.
- `tests/crypto.test.ts` (6 tests): AES-256-GCM round-trip, fresh-IV non-determinism, envelope shape (iv 12B / tag 16B / ciphertext), GCM tamper detection, malformed-payload rejection, cross-key decryption failure.
- `tests/rate-limit.test.ts` (7 tests): `requestIp` proxy-header parsing (first trimmed XFF entry, x-real-ip fallback, blank-XFF, unknown); `enforceRateLimit` fail-open default when Upstash unset, and sliding-window delegation (limit/window args, success mapping).
- `tests/automation-killswitch.test.ts` (12 tests): `AUTOMATION_SUBMIT_ENABLED` must be the exact string `'true'` — `'1'`/`'TRUE'`/whitespace/`yes` keep autonomous submission OFF.
- Delivered as commit `9e87c62`; suite now 24 files / 228 tests, `tsc --noEmit` clean, `next build` clean.
- `tests/middleware.test.ts` (4 tests): unauthenticated → `/login?next=…`, signed-in → `/dashboard` from auth pages, pass-through on protected pages, fail-open when Supabase env is missing.
- `tests/apply-task.test.ts` (14 tests): `processApplicationTask` re-checks every gate server-side (kill switch, pause, approval, entitlement, platform, expiry, package, truthfulness) before any browser call; SUBMITTED/STOP outcomes with owner-scoped application updates + audit events.
- `tests/preferences-agent.test.ts` (6 tests): agent pause/resume keyed on the server-derived user id (client-supplied `user_id` ignored), non-boolean body → 400, 429/500 paths.
- Delivered as commit `538bff7`; suite now 27 files / 252 tests, `tsc --noEmit` clean, `next build` clean.
- `tests/admin-users-list.test.ts` (3 tests): admin-only overview list; non-admin → 403.
- `tests/applications-service.test.ts` (17 tests): owner-scoped fetches/updates (cross-user → NOT_FOUND), `prepareApplication` idempotency + insert-race recovery, `approveApplication` gates (expiry/email/package), `requestAutoSubmit` kill-switch / entitlement / platform / idempotent task reuse / enqueue + event.
- `tests/applications-routes.test.ts` (14 tests): `AppActionError` → HTTP status mapping (404/403/409/422), body validation, 429 rate limiting, server-derived user id propagation.
- Hardening fix: `app/api/admin/users/route.ts` now returns `403 FORBIDDEN` for non-admins (was an uncaught throw → 500), matching sibling admin routes.
- Delivered as commit `ac4ec64`; suite now 30 files / 286 tests, `tsc --noEmit` clean, `next build` clean.

## Wave 6 — go-live enablement (2026-09-08)
- Supabase migrated to a new hardened project `cbxloutahmalorumaihc`: all 9
  migrations applied + new `010_lockdown_private_tables.sql` (RLS on every
  table, `security_invoker` + revoked grants on the two views). Closed 4 anon
  leaks found on the old project (subscriptions/workspaces rows; user PII via
  `v_workspace_entitlements`/`admin_user_overview`).
- Vercel cutover verified: client bundle bakes in the new project; production
  signup lands in the new DB with full provisioning; entitlements view +
  `consume_ai_credit` RPC verified via the new service-role key.
- `ENCRYPTION_MASTER_KEY` rotated (fresh 64-hex key in Vercel + .env.local).
- Browser worker hardened (`c39eb4e`): `workers/browser/auth.ts` fail-closed
  timing-safe secret gate; `POST /submit` requires `BROWSER_WORKER_SECRET`;
  `PORT ?? WORKER_PORT` for Render; `submitViaBrowser` sends the header;
  `render.yaml` Blueprint for one-click deploy. `BROWSER_WORKER_SECRET` set in
  Vercel. Suite now 32 files / 300 tests.
- Remaining: old-project deletion (needs a PAT from the other Supabase
  account), Render deploy of the worker + `BROWSER_WORKER_URL`, staging tests,
  then explicit approval to set `AUTOMATION_SUBMIT_ENABLED=true`.
