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
