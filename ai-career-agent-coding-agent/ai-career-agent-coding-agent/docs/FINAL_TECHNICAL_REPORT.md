# Jobiest Full Upgrade: Final Technical Report

Date: 2026-09-10 · Status: Deployed to production (jobiest.com)

This report covers the Ollama-first AI upgrade plus the remaining hardening
items: ATS, prompt-injection defenses, audit logging, password reset, health
checks, and the automation-hosting decision. It states what was actually
implemented and tested. It does NOT claim the system is immune to attack.

---

## 1. What changed (this phase)

- `packages/ai/providers.ts` — `OllamaProvider` + native `/api/chat` transport
  (Ollama's `format: json` for reliable JSON mode).
- `lib/ai/server.ts` — `buildGatewayForUser` is Ollama-first: strong model
  (priority 0), local fallback (priority 1), then user-stored credentials.
- `lib/env.ts` — central Zod env: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`,
  `OLLAMA_FALLBACK_MODEL`, `OLLAMA_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`.
- `lib/ai/sanitize.ts` — `stripDashes`/`hasDash` enforce the no-em/en-dash rule
  on all user-facing generated content.
- `lib/ai/injection.ts` (new) — prompt-injection defenses: length cap, pattern
  neutralization, untrusted-data delimiters.
- `lib/audit.ts` + `supabase/migrations/011_audit_logs.sql` (new) — service-role
  only audit trail; wired into signup, password reset, and AI resume generation.
- `lib/email/resend.ts` — welcome, password-reset, and verification emails
  (best-effort, never throw, no em/en dashes).
- `app/api/auth/forgot-password/route.ts` (new) — recovery-link issuance,
  rate-limited, no account-enumeration leakage.
- `app/reset-password/page.tsx` (new) — client reset page (verifyOtp + updateUser).
- `app/api/health/route.ts` (rewritten) — component health (database, AI
  gateway, email) without leaking internals.
- `app/api/ai/resume/route.ts` — gateway-based, dash-sanitized, injection-
  defanged, audit-logged.
- `lib/apply/client.ts` — `BROWSER_WORKER_URLS` failover with health probes.
- `docs/RENDER_VS_ORACLE_AUTOMATION_STUDY.md` — hosting decision.

## 2. Ollama model selected and why

Primary `qwen2.5:7b` (~4.7 GB) — the strongest model that runs reliably on
2 OCPU / 12 GB aarch64 with ~2.5 tok/s measured warm. Fallback `llama3.2:3b`
for high-volume or simple tasks. Routing is env-configurable, never hard-coded.

## 3. Ollama benchmark results

Measured on the Oracle A2 VM (CPU only): qwen2.5:7b ~2.5 tok/s warm; load
latency dominates the first request (~28 s cold load, sub-second warm).
Ollama is containerized on the compose network behind a secret-gated gateway;
it is never published to the internet (UFW allows only 22/80/443).

## 4. AI architecture

Browser → Jobiest API (Vercel) → `AIGateway` (`buildGatewayForUser`) →
`ai.jobiest.com` (Caddy, TLS, Bearer secret) → ai-gateway (Node) → Ollama.
The gateway handles provider fallback, Zod schema validation, quota reserve/
refund, and error codes. The frontend never reaches Ollama or carries secrets.

## 5. Resume builder features

Profile-driven CV generation, cover letter, and interview answers through the
gateway; deterministic ATS scanner (`lib/ats/scan.ts`); AI job analysis with
deterministic skill comparison; job-targeted tailoring; no fabricated
achievements (truthfulness system prompt + `lib/truthfulness/verify`).

## 6. ATS scoring methodology

Deterministic, no model: weighted rubric over length, contact info, core
sections, dates, action verbs, first-person usage, special characters, and
keyword overlap (frequency extraction, stopword-filtered). Scored 0-100 with
explicit per-check findings and tips. AI ATS analysis routes through the
strongest practical model.

## 7. Email / authentication implementation

Supabase Auth for sessions. Signup auto-confirms (see 12 for the verification
toggle). Resend delivers welcome and password-reset emails. Forgot-password
issues a short-lived recovery link via `admin.generateLink`; the reset page
verifies the OTP and updates the password; old sessions are superseded by the
password change. Responses never reveal whether an account exists.

## 8. Supabase security / RLS

RLS enabled on all user tables with ownership policies; `010_lockdown_private_
tables.sql` hardened private tables and revoked anon/authenticated access to
`v_workspace_entitlements`; new `audit_logs` has no policies (service-role
only). Cross-user access tests are in the suite and pass.

## 9. API security controls

Bearer-API-key gateway (timing-safe, fail-closed), per-key rate limiting,
AI-route rate limiting (Upstash) + daily credit quotas (`consume_ai_credit`
FOR UPDATE), SSRF re-checks in the browser worker, secret-gated AI gateway,
Zod validation on all bodies, security headers (existing middleware).

## 10. Firewall / network changes

UFW on the VM: 22/80/443 only. Ollama (11434) removed from public exposure;
it lives on the compose network. `ai.jobiest.com`, `worker.jobiest.com`,
`api.jobiest.com` terminate TLS via Caddy (Let's Encrypt) and reverse-proxy to
the isolated services.

## 11. Tests performed and results

`tsc --noEmit` clean · 316 Vitest tests passing · `next build` clean.
New this phase: prompt-injection defenses, audit redaction/sanitization,
browser-worker failover, em/en-dash sanitizer. Live checks: VM healthz for
api/worker/ai (200, strict TLS), worker auth gate (401), SSRF/allowlist guard
(DOMAIN_NOT_ALLOWLISTED), AI gateway generation on both models.

## 12. Remaining external configuration

1. Apply `supabase/migrations/011_audit_logs.sql` (dashboard SQL editor or
   `supabase db push`). Until then `auditEvent` no-ops gracefully.
2. Enable email verification if you want mandatory verification: Supabase →
   Authentication → Providers → Email → "Confirm email" ON, then flip signup to
   use `email_confirm: false` + `sendVerificationEmail` (currently auto-confirm).
3. Confirm the Render standby's `BROWSER_WORKER_SECRET` equals the Vercel value
   (no Render API key in this session to verify programmatically).
4. Rotate the temporary OCI API key and enable 2FA when convenient.

## 13. Production deployment steps

Push to `main` on GitHub (auto-deploys to Vercel). DNS: apex + wildcard to
Vercel, `api`/`worker`/`ai` A-records to the VM. VM stack via
`deploy/docker-compose.yml` (caddy, api, browser, ai, ollama). Kill-switch cron
warns before trial end (~2026-10-07); A1 retry loop targets the permanent-free
migration.

## 14. Known limitations

- qwen2.5:7b is CPU-bound (~2.5 tok/s); resume generation takes tens of seconds.
- A2 trial expires ~2026-10-07; A1 free capacity is still "Out of host
  capacity" (retry loop active).
- Email verification is not mandatory yet (see 12.2).
- Flutterwave close-loop: keys set, but a real/test payment has not completed,
  so key acceptance + hash equality remain unproven.
- No vendor SLA at the $0 budget; uptime is maximized via dual-host failover,
  not guaranteed.

## 15. Recommended next improvements

- Apply the audit migration and verify events in the dashboard.
- Add external uptime monitoring (UptimeRobot/cron-job.org) on the three healthz
  endpoints; the pinger also keeps the Render standby warm.
- Migrate to A1.Flex the moment capacity frees; consider a 3b/1b model for
  extraction tasks to cut latency.
- Complete a Flutterwave test-mode payment to prove the billing close-loop.
