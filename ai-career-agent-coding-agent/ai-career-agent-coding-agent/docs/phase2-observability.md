# Phase 2 — observability, ledgers and abuse controls

Date: 2026-09-16 · Spec: `JOBIEST_MASTER_IMPLEMENTATION_PACKAGE.md` Part VII (§10) + Phase 2 backlog (B-060…B-074).
Builds on: `docs/discovery-phase0.md`, `docs/security-baseline-findings.md` (Phase 0/1).

## What shipped

### B-061 — AI usage ledger (P0)
- **`supabase/migrations/023_observability_ledgers.sql`** creates `ai_usage` (RLS on, no policies, service-role
  only, revoked from anon/authenticated; indexes for user/day, feature/day, global day and a partial ip_hash/day
  index backing the abuse budgets). One row per generation — provider-backed **or** deterministic — with feature,
  provider, model, tokens (when the provider reports them), latency, status (`ok|error|timeout|blocked`),
  error_code, prompt_version and a 16-char content hash. **Never prompt or completion text.**
  `user_id` is nullable + `on delete set null` because the free tools are anonymous (ip_hash keyed) and because
  ledger rows outlive account deletion (retention/audit beats cascade).
- **Wiring:** `AIGateway.run` now takes an optional `ledger` callback (pure, injected; emits exactly one event per
  run: ok / error / blocked, with task id + version, provider, model, tokens). `lib/ai/usage.ts` provides
  `trackGeneration` (route-level wrapper used by all 11 generation surfaces) and `withUsageLedger` (gateway
  wrapper for when provider-backed generation is enabled). Features recorded:
  `document.cv|cover_letter|answers`, `resume-studio.cv`, `ai.resume`, `ai.analyze-job`, `ai.match`,
  `ai.interview-questions`, `ai.followup-email`, `ai.career-paths`, `ai.salary-insights`, `ai.profile-copy.*`,
  `ats.scan`, `free-tool.*`.
- Quota-blocked attempts are recorded too (`status='blocked'` from the meter reserve path, and
  `AI_QUOTA_EXHAUSTED`) — demand above quota is exactly what the cost dashboard needs to see.

### B-060 — audit trail upgrade
- `audit_logs` gains `outcome` (`allow|deny|error`), `request_id`, `ip_hash`, `ua_hash` (nullable; indexed for
  user/day and ip/day lookups). `lib/audit.ts` extends `AuditInput`; `auditEvent` stays best-effort, and a new
  **`requireAuditEvent` is fail-closed** — used where an unlogged disclosure is the harm (admin PII reads).
- Signup now persists `ip_hash` on `USER_SIGNUP` rows, enabling the durable 24h signup-velocity signal.
- **Rate-limit trips land in `security_events`** (`RATE_LIMIT_TRIP`, WARN, ip_hash) — `enforceRateLimit` takes an
  optional `ip` argument; the IP-keyed routes (signup, jobs, free tools) pass it. Trip logging is best-effort and
  never blocks the 429.

### B-062 — agent run ledger: verified already complete
The package's `agent_runs`/`agent_run_steps` tables map onto the repo-native pattern: `applications` (state
machine, §19) + `agent_tasks` rows of `type='APPLICATION_EVENT'` written on **every** transition
(`PREPARED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `SUBMITTED`, `SUBMISSION_REQUESTED`, `AUTO_SUBMIT_STOPPED`).
`getApplication` returns the timeline and the applications page renders it. No new tables needed; documented here
as the mapping decision.

### B-063 — admin workspace
- **`/admin/usage`** (nav "AI usage"): 30-day cost dashboard — runs, errors, quota-blocks, anonymous share,
  avg latency, per-day volume bars, per-feature table. Data twin: **`GET /api/admin/analytics/usage`**
  (admin-gated JSON, same aggregates) for programmatic monitoring.
- **`/admin/users/[id]`** (linked from the users list): one-page investigation — plan, status, lifetime usage,
  last 15 generations, applications, audit history, security signals — **without PII by default**.
- **PII gate:** the list view no longer exposes emails — migration 023 recreates `admin_user_overview` with
  `email_domain` instead of `email`. The full email requires **password re-authentication**:
  `POST /api/admin/users/reveal` verifies the admin's password against Supabase's token endpoint server-side and
  issues a 5-minute, admin-bound, HMAC-signed reveal token (`lib/security/reveal.ts`, stateless, constant-time
  verify). `GET /api/admin/users/[id]?reveal=…` returns the email only after a **fail-closed** audit row
  (`ADMIN_USER_PII_READ`) is written; both the reveal issuance and every PII read are audited.
- Existing suspend/terminate/signout actions unchanged (they already write `admin_actions`).

### B-073 — abuse ladder (multi-signal, reversible, appealable)
`lib/security/abuse.ts`, wired into signup and free-tools:
1. **Baseline:** existing per-minute/hour rate limits (unchanged).
2. **Soft:** per-IP daily generation budget — default **60/day**, env `GEN_IP_DAILY_BUDGET` (0 = off).
3. **Hard:** global anonymous daily budget — default **2000/day**, env `GEN_ANON_GLOBAL_DAILY_BUDGET` (0 = off).
   Both backed by the `ai_usage` ledger (counted at request time), reset daily at UTC midnight, return a 429 with
   `Retry-After`, a plain-language message and the support email (appeal path), and log
   `ABUSE_BUDGET_BLOCKED` to `security_events`.
4. **Signup signals (non-blocking — instant-access is a product decision):** disposable-domain list (28 entries),
   machine-generated local-part heuristics, and durable 24h per-IP signup velocity from `audit_logs`.
   Elevated/high → `SIGNUP_ABUSE_SIGNAL` in `security_events` → daily digest → admin review
   (suspend/terminate already exist).
5. **Reversibility:** every rung is a row or an env var — nothing permanent, nothing silent.

### Daily digest extension
`lib/security/digest.ts` now includes an AI-usage section (runs/errors/blocks/anonymous + top features) and two
§10.4 anomaly flags: AI error rate >10% over ≥20 runs, and anonymous volume ≥800/24h (approaching the global
budget). Degrades silently if the ledger query fails. The existing cron (`/api/cron/security-digest`) drives it.

### Disproved package assumptions (recorded)
- **A-07 wrong:** the ten `/free-*` tools are deterministic templates, not anonymous LLM spend. Budgets still
  apply (they bound ALL anonymous generation, cost or not).
- **W-04 partially stale:** the agent is approval-gated and request-scoped; `agent_tasks` + `audit_logs` +
  `security_events` already cover the run ledger (B-062 mapping above).

## Tests (36 new assertions across 6 files)
`tests/ai-usage.test.ts` (hashIp, ledger shape, ok/error/blocked, failure tolerance) ·
`tests/gateway-ledger.test.ts` (ok/error/blocked events, tokens, ledger-throw swallowed, no-providers) ·
`tests/abuse-ladder.test.ts` (disposable, machine-generated, risk levels, budget decisions + disable) ·
`tests/reveal-token.test.ts` (round-trip, admin-binding, expiry, tamper) ·
`tests/digest-usage.test.ts` (summarize, renders, error-rate + anonymous flags, degrade) ·
`tests/audit.test.ts` (+fail-closed variant + new columns). Gate: tsc 0, **459/459**, build clean.

## Owner actions
1. **Apply migration 023** in the Supabase SQL editor (idempotent; run with/after 022 if not yet applied).
2. Optional env tuning: `GEN_IP_DAILY_BUDGET`, `GEN_ANON_GLOBAL_DAILY_BUDGET`, `LOG_HASH_KEY` (falls back to
   `ENCRYPTION_MASTER_KEY` if unset).
3. `ADMIN_ALERT_EMAIL` (existing) enables the digest incl. the new usage section.

## Deferred (backlog, unchanged)
B-073's later rungs (device binding, CAPTCHA-on-abuse as defence of our own service), AI-spend auto-disable
(§10.4 >4× rule — needs cost_usd population once a metered provider is live), retention jobs (12-month ai_usage
pruning, Phase 12/B-352), admin MFA step-up (B-032, after owner TOTP enrollment).
