# AI Career Agent v10

Production-oriented multi-tenant AI career/job-application SaaS foundation.

**Start with `START_HERE.md`.** Coding agents should then read `AGENTS.md` and `docs/CODING_AGENT.md`.

## Product model
- Free forever: 3 AI documents in total (not daily), 10 career-tool uses/day, manual apply only.
- Basic: NGN 5,000/month, 3 AI documents/day, 2 lifetime auto-apply trial uses, 50 tool uses/day.
- Premium: NGN 10,000/month, 10 AI documents/day, 10 auto-apply slots/day (agent mode), unlimited tools.
- Max: NGN 20,000/month, 20 AI documents/day, 20 auto-apply slots/day (agent mode), unlimited everything.
- Flutterwave payments.
- Per-user/workspace OpenRouter and Hugging Face credentials, encrypted at rest.
- User-supplied application email only; no Gmail/inbox access.
- Render deployment with separate web, agent, browser and scheduler services.

## Important
This repository is an implementation foundation. Site-specific browser adapters, production provider configuration, complete E2E coverage and live autonomous submission must be completed and tested before enabling real-world automated applications.

## Product surface (2026-09-23 go-live)

- Monthly credit system (owner decision D1): FREE 5 documents a month (plus 5 auto-applies after a one-time free card verification), BASIC 10 documents / 20 auto-applies, PREMIUM 15/30, MAX 100 (disclosed fair-use cap) / 50. Credits never expire and each month's grant adds to the balance. Enforced by the credit ledger (`ENTITLEMENTS_LEDGER`, armed by default; `false` disarms for observation mode).
- Free auto-apply activation: Paystack zero-amount card verification (purpose=ADD_CARD, no recurring consent, card can never be charged through us). See `/auto-apply/activation`.
- Auto-Apply 2.0: explicit submission verification per adapter (no SUBMITTED without a confirmation signal), extended application statuses (checking send / needs you), per-(user, job) deduplication enforced by a unique partial index, and the admin pilot scorecard at `/admin/applications`.
- Resume Studio: profile-aware prefill that skips completed sections, no watermarks on any of the 70 templates, and editing/downloading never consumes a credit.
- Portfolio Studio: plan-limited portfolios (1/5/10/26), public pages at `/portfolio/<slug>` with permanent rename redirects, sanitized HTML and PDF export. See `/portfolios`.
- Honest scope: `/supported-systems` lists exactly what the engine can submit to (generated from the adapter registry).

## Operations quick facts

- Migrations 001 through 040 are applied to production (Supabase ref `cbxloutahmalorumaihc`).
- The daily pipeline cron (06:30 UTC) issues period grants and drains agent tasks.
- Kill switches: `ENTITLEMENTS_LEDGER=false` (credit enforcement), `AUTOMATION_SUBMIT_ENABLED` (automated submissions), `AGENT_DRY_RUN` (browser worker dry-run).
