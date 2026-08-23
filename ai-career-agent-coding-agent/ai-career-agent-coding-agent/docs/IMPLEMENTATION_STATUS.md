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
