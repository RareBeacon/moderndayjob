# JOBIEST — Security Audit

**Repository:** jobiest.com (Next.js App Router + Supabase + Upstash Redis + Vercel)
**Date:** 2026-09-10
**Scope:** Full-codebase security audit and hardening pass per `JOBIEST_SECURITY_IMPLEMENTATION.md` (§1–§54).

> Honesty rule: every control listed below **exists in code/configuration** and is verifiable. Anything not implemented is listed under *Known remaining risks* or *Not applicable*, never presented as done.

---

## 1. Security architecture

```
Browser ──HTTPS──▶ Vercel Edge (platform WAF/DDoS) ──▶ Next.js serverless functions
                                                          │
        ┌─────────────────────────────────────────────────┼───────────────────────────────┐
        │                                                 │                               │
  middleware.ts                                    route handlers                   Supabase (Postgres)
  (session gate for pages)                     (requireUser / admin guard)          RLS policies + service-role
        │                                                 │                           writes only
        ▼                                                 ▼                               │
  Supabase Auth (GoTrue)                          lib/rate-limit.ts                     ├─ public.* tables (RLS on)
        │                                      Upstash Redis (sliding window)           ├─ auth.users
        ▼                                                                               └─ public.audit_logs (deny-by-default)
  Device identity cookie (jobiest_dvc)         lib/security/* (risk scoring)
  + registration velocity counters             lib/ai/injection.ts (prompt defang)
                                               lib/ai/sanitize.ts (dash rule)
                                               lib/truthfulness/* (fact gate)
```

- **Server-only secrets** live in `lib/env.ts` (zod-parsed from `process.env.*`), never in client bundles.
- **No cross-origin API surface**: the app is single-origin (same-site Next.js), so no CORS middleware is needed or present.
- **Writes** to sensitive tables (audit, admin, document persistence) go through the Supabase **service-role key on the server only**; clients use the anon key behind RLS.

---

## 2. API inventory (44 route handlers)

| Area | Routes |
|---|---|
| Auth | `signup`, `signout`, `confirm`, `forgot-password`, `reset-password` |
| AI | `resume`, `analyze-job`, `match`, `interview-questions`, `career-paths`, `followup-email`, `profile-copy`, `salary-insights` |
| ATS | `ats/scan` |
| Documents | `documents`, `documents/generate`, `documents/generated`, `documents/[id]/download`, `documents/[id]/export` |
| Applications | `applications`, `applications/prepare`, `applications/[id]`, `[id]/submit`, `[id]/approve`, `[id]/reject`, `[id]/withdraw`, `[id]/auto-submit` |
| Billing | `billing/flutterwave/create`, `billing/flutterwave/webhook` |
| Admin | `admin/users`, `admin/users/signout`, `admin/users/suspend`, `admin/users/terminate`, `admin/credentials`, `admin/ingest` |
| Preferences | `preferences`, `preferences/agent` |
| Profile | `profile`, `profile/completeness` |
| Jobs | `jobs` |
| Entitlements | `entitlements` |
| Tasks | `tasks/[id]/cancel` |
| Cron | `cron/daily-pipeline` |
| Tally (webhook) | `tally/webhook` |
| Health | `health` (internal, non-sensitive) |

**Auth coverage:** 35 route handlers call `requireUser()`. The remaining routes are either public-by-design (`health`, auth endpoints, webhooks) or protected by webhook signature verification (Flutterwave `verif-hash`, timing-safe compare).

---

## 3. Authentication protections

- **Session auth** via Supabase GoTrue; `lib/auth.ts` → `getUser()` validates the session cookie server-side on every protected call.
- **`requireUser()`** additionally rejects accounts whose `profiles.account_status` is `SUSPENDED` or `TERMINATED` (suspension/termination revokes practical access on API requests). Graceful fall-through on infra hiccup.
- **Signup hardening** (`app/api/auth/signup/route.ts`):
  - Strict per-IP rate limit (`auth:signup:<ip>` = 5 / 1 h).
  - Server-issued device cookie + registration-velocity risk score.
  - Admin-API account creation with `email_confirm: false` + a signup confirmation link issued and emailed via Resend — **mandatory email verification** (account is locked until the owner clicks the link).
- **Verification resend** (`app/api/auth/resend-verification/route.ts`): rate-limited (3/h per IP), never reveals account existence, no side effects for unknown emails (verified empirically against GoTrue). The legacy auto-confirm route (`/api/auth/confirm`) was **removed** — it would have defeated verification.
- **Password reset** (`forgot-password` / `reset-password`): GoTrue recovery tokens are hashed (SHA-256, lowercase hex) via `lib/auth/recovery.ts` and delivered through Resend; reset links are one-time and short-lived (GoTrue policy).
- **Account enumeration mitigation**: signup returns a generic 409 for existing emails (no field-level detail beyond "sign in instead"); login/forgot-password/resend-verification responses are generic.

---

## 4. Authorization model

- **User scoping (IDOR safety):** every user-facing data route filters by the authenticated `user.id` (e.g. document export uses `.eq('user_id', user.id)`; applications/documents/preferences are all user-scoped).
- **Admin guard:** `admin_users` table membership checked server-side; non-admins get `403 FORBIDDEN`. Admin user lists read through the RLS-gated `admin_user_overview` security view.
- **RLS is the backstop:** even if an app-level guard were bypassed, Postgres row-level security restricts row access to `auth.uid() = user_id` (see §5).

---

## 5. Database / RLS protections

- Supabase migrations `001`–`011` in `supabase/migrations/`.
- **RLS enabled** on user-data tables (profiles, applications, documents, generated_documents, preferences, payments, etc.) with `auth.uid() = user_id` select/insert policies; no `UPDATE` policy on append-only tables (generated_documents).
- **`generated_documents`** is append-only + versioned with a `content_hash` (SHA-256) for immutability/verifiability, plus `source_facts` for traceability.
- **`public.audit_logs`** (migration `011`, **applied 2026-09-10 via Management API**): RLS enabled, **no policies** — deny-by-default, so neither `anon` nor `authenticated` can read/write; only the service role (server) writes. Verified live: a real signup produced a `USER_SIGNUP` row.
- Service-role key exists **only** in server env; never shipped to the client.

---

## 6. Security headers (`next.config.mjs`)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

---

## 7. CORS configuration

**Not applicable / intentionally absent.** The application has no cross-origin API consumers: the browser talks same-origin to Next.js, and Next.js server code calls Supabase/Resend/Ollama/Flutterwave server-side (no browser CORS preflight). Adding a permissive CORS middleware would widen attack surface for zero benefit; if a future native/mobile client is added, CORS should be allow-listed then, not now.

---

## 8. Rate limits

Upstash Redis `@upstash/ratelimit` sliding-window, applied server-side with a shared prefix `aca`. **Fails open** (allows) when Redis is not configured so the site never self-blocks.

| Bucket | Limit |
|---|---|
| `auth:signup:<ip>` | 5 / 1 h |
| Per-AI route (`ai:…:<uid/ip>`) | per-route limits (resume, analyze, match, etc.) |
| Application action routes (`approve`/`reject`/`submit`/`withdraw`/`auto-submit`/`prepare`) | per-user limits |
| `ats:scan` | per-user limit |
| `billing/flutterwave/create` | per-user limit |
| `forgot-password` / `reset-password` | per-IP limit (brute-force mitigation) |
| `preferences/agent` | per-user limit |

`requestIp()` reads `x-forwarded-for` → `x-real-ip` (Vercel-provided), never trusting a client-set header when the platform provides one.

---

## 9. WAF / edge protection

**Platform WAF with custom firewall rules (configured 2026-09-10 via the Vercel API).** No custom WAF module was created (the spec explicitly forbids fake WAF UI); JOBIEST uses Vercel's edge firewall with two project rules, verified live (`/.env` → 403, `/wp-admin` → 403, `sqlmap` UA → 403, homepage → 200):

| Rule | Action | Effect |
|---|---|---|
| Block sensitive-file and admin scanner paths (`.env`, `.git`, `wp-admin`, `wp-login`, `xmlrpc`, `phpmyadmin`) | deny | Stops config-exfil / scanner probes at the edge |
| Block obvious scanner and automation user-agents (`sqlmap`, `nikto`, `nmap`, `masscan`, `gobuster`, `dirbuster`) | deny | Stops common tooling at the edge |

> The OWASP CRS **managed rules** (xss/sqli/lfi/rfi/rce categories) are exposed by the API but the activation schema is not reliably honored via `PUT` (empirically the `crs` block resets to defaults). They should be enabled via the dashboard **Firewall → Managed Rules** tab — noted in §20.

---

## 10. DDoS strategy

- **Application layer:** sliding-window rate limits (see §8) on all abuse-prone endpoints; per-IP signup limit of 5/h; AI endpoints are entitlement- and rate-gated.
- **Platform layer:** Vercel edge absorbs volumetric traffic; Supabase/Upstash are managed services with their own protections.
- **Kill switch:** `automation-killswitch` exists for the auto-apply subsystem (stop conditions + STOP outcome), preventing runaway submission loops.
- No custom traffic-scrubbing or origin shield beyond Vercel — documented, not claimed.

---

## 11. Device-linking system

- `lib/security/device.ts` — `jobiest_dvc` cookie: server-generated 24-byte random id (`base64url`), `HttpOnly`, `SameSite=Lax`, `Secure`, `path=/`, `maxAge=1 year`. Deliberately **not** derived from userAgent+IP, and **not** treated as "one device = one human" (shared devices are common).
- Raw IPs and emails are **never stored** for this purpose: signals are one-way SHA-256 hashed before use as Redis counter keys.

---

## 12. Multiple-account detection

Registration-velocity scoring in `lib/security/risk.ts`, fed by Redis counters (`reg:ip:<hash>`, `reg:dev:<deviceId>`, 24 h TTL):

| Level | Condition | Action |
|---|---|---|
| `LOW` | default | allow |
| `MEDIUM` | device ≥ 2 or IP ≥ 5 | allow |
| `HIGH` | device ≥ 5 or IP ≥ 12 | allow + audited as elevated |
| `EXTREME` | device ≥ 15 or IP ≥ 30 | **block** (429) + audit `SUSPICIOUS_REGISTRATION` |

Thresholds are deliberately generous so families, offices, and cybercafes are not locked out. No CAPTCHA is used (per product decision — no automated CAPTCHA solving/bypassing; a human-in-the-loop handoff is the escalation path).

---

## 13. Free-trial protection

- **Entitlement engine** (`packages/security/entitlements.ts`): `assertEntitlement(user.id, 'ai')` checks remaining AI credits before any generation; zero credits ⇒ the request is refused before any model call.
- Daily credit pipeline (`cron/daily-pipeline`) and `plans` define credit budgets per plan.
- PAYG upgrade / real charges are **not** enabled without explicit authorization; billing is test-mode until authorized.

---

## 14. AI abuse protection

- **Prompt-injection defense** (`lib/ai/injection.ts`): untrusted user text (job descriptions, pasted resumes, notes) is length-capped (12 000 chars) and pattern-defanged (`ignore previous instructions`, role markers, exfiltration requests, "developer/dan mode", code fences) before interpolation; optionally wrapped in `<UNTRUSTED:…>` delimiters. Documented as defense-in-depth, not a claim of immunity.
- **Output safety rule** (`lib/ai/sanitize.ts`): em/en/figure dashes are stripped from user-facing generated text (spec §9); resume route applies `stripDashes` on output and `defangUntrustedText` on the job description.
- **Truthfulness gate** (`lib/truthfulness/`): generated documents must not fabricate experience/metrics/employers; `TRUTHFULNESS_FAILED` returns the draft + report rather than persisting a fabricated document.
- **Cost/resource control:** every provider call passes `maxTokens`; per-route rate limits and credit checks cap volume.
- Self-hosted **Ollama-first gateway** (Oracle VM) keeps the default path off paid third-party APIs.

---

## 15. Security logging

- `lib/audit.ts` — `auditEvent()` writes to `public.audit_logs` (service-role only). **Best-effort and never throws** so logging can't break a request.
- `sanitizeMeta()` + `redactSecrets()` strip anything matching secret-like patterns (`secret|token|password|api_key|authorization|…`) before write; metadata is size-capped and cycle-safe.
- Events: `USER_SIGNUP`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET_COMPLETED`, `AI_RESUME_GENERATED`, `RESUME_EXPORT`, `APPLICATION_SUBMITTED`, `SUSPICIOUS_REGISTRATION`, admin actions, etc.
- **Verified in production 2026-09-10:** a live signup wrote a `USER_SIGNUP` row (`resource=auth`, risk level recorded, user-scoped) into `audit_logs`.

---

## 16. Dependency / security scanning

- **`npm audit --omit=dev`** run on 2026-09-10 (latest pass): **0 vulnerabilities**.
  - `sharp` upgraded to `0.35.4` (libvips/libheif CVEs).
  - `postcss` forced to `8.5.28` via `overrides` (clears the stringify-XSS + source-map advisories without a breaking Next 16 major bump).
  - `@supabase/supabase-js` pinned to `2.58.0` (bundles patched `@supabase/auth-js@2.72.0` for GHSA-8r88-6cj9-9fh5 while keeping `realtime-js@2.15.5`, which is Node-20 compatible).
- **Secret scanning**: gitleaks runs in CI on every push/PR (`.github/workflows/ci.yml` + `.gitleaks.toml`). A manual full-history scan reports **0 findings**; CI also runs `npm audit --omit=dev --audit-level=high` as a gate.
- **Secret scanning** performed across source, git history, and the built client bundle: **no real secrets** found.

---

## 17. Tests performed

All run against the real code on 2026-09-10:

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx vitest run` | ✅ **349 passed** (40 files) |
| `npm run build` (Next production build) | ✅ succeeded |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** |
| gitleaks full-history scan | ✅ 0 findings |
| Live E2E: `GET /api/documents/[id]/export` | ✅ owner→200 `%PDF`/`PK`, anon→401, non-owner→404, bad format→400 |
| Live `jobiest.com` response headers | ✅ CSP + nosniff + DENY + referrer + permissions + HSTS present |
| Live `/api/health` | ✅ `ok: true`, database ok, AI gateway ok, email configured |
| Live audit trail (`audit_logs`) | ✅ migration applied; real signup wrote `USER_SIGNUP` row |
| Live email verification | ✅ signup → `verificationRequired`, unconfirmed sign-in blocked, resend OK, click link → sign-in works |
| Live Vercel Firewall | ✅ `/.env`→403, `/wp-admin`→403, `sqlmap` UA→403, homepage→200 |

**Security-relevant suites** (selected): `admin-security`, `admin-users-list`, `auth-signup-route`, `security-risk`, `rate-limit`, `ssrf`, `truthfulness`, `browser-worker-auth`, `apply-stop-conditions`, `automation-killswitch`, `billing-webhook`, `crypto`, `entitlements`, `plans`, `middleware`, `documents-export`, `resend-verification`, `api-gateway`.

New suites added this pass:
- `tests/documents-export.test.ts` — parses CV/cover-letter/answers content and asserts real output buffers (`%PDF` magic for PDF, `PK` zip magic for DOCX).
- `tests/security-risk.test.ts` — LOW/MEDIUM/HIGH/EXTREME classification and block-only-at-EXTREME behavior.
- `tests/resend-verification.test.ts` — verification-email resend: never reveals existence, no side effects for unknown emails, rate-limited.

---

## 18. Vulnerabilities discovered and fixed

| Finding | Fix |
|---|---|
| `sharp` libvips/libheif CVEs (high/critical) | upgraded to `sharp@0.35.4` |
| No security headers on responses | full CSP + 5 hardening headers in `next.config.mjs` |
| Signup had no velocity control | per-IP rate limit + device cookie + risk scoring (EXTREME blocks) |
| AI prompts interpolated raw untrusted text | `defangUntrustedText` + delimiters + length cap |
| Em/en dash leaks in generated copy | `stripDashes` applied on resume output |
| Resume route missing `maxTokens` | gateway now passes `task.maxTokens` |
| No audit trail for security events | `lib/audit.ts` + `011_audit_logs.sql` |
| Health endpoint could leak internals | rewritten to report component status only, always 200, no secrets/hostnames |
| Auto-apply worker had single point of failure / no auth surfaced | multi-URL failover + `/healthz` probe + Bearer secret + authoritative HTTP-error handling |
| Documents not exportable by users | new `GET /api/documents/[id]/export?format=pdf|docx` (auth + ownership enforced) |
| Signup auto-confirmed accounts (no verification) | `email_confirm: false` + emailed confirmation link; legacy auto-confirm route removed; login resends instead |
| Flutterwave webhook had no size cap or replay short-circuit | 64 KB body cap (413) + early `event_id` dedup before external re-verification |
| `postcss` stringify-XSS / source-map advisories (build-time) | `overrides` pin to `postcss@8.5.28` (no breaking upgrade needed) |
| `@supabase/auth-js` ≤ 2.69.1 path-routing advisory | `@supabase/supabase-js@2.58.0` (bundles `auth-js@2.72.0`) |

---

## 19. Known remaining risks

1. **Device-linking is best-effort**: a user can clear cookies or switch browsers to evade device velocity. By design (no CAPTCHA); EXTREME/IP limits remain as backstop.
2. **OWASP CRS managed rules not yet active** — custom firewall rules are live, but the managed XSS/SQLi/LFI/RFI ruleset should be enabled in the dashboard WAF tab (the API activation schema was not reliably honored).
3. **Flutterwave is test-mode only** — the real-mode close loop (live keys + live webhook verification) is not activated pending authorization.
4. **Rate limits fail open** when Upstash is unreachable (availability over strictness) — acceptable for this scale, worth revisiting if abuse is observed.
5. **Oracle A1 self-hosted gateway** is not yet provisioned (Oracle "Out of host capacity"; background retry loop continues). AI falls back to user-stored credentials meanwhile.
6. **Verification email delivery depends on Resend**: if Resend is down, a new user is locked out until they resend from the login page (self-serve recovery exists). Acceptable trade-off for mandatory verification.

*Previously-open risks now resolved: Supabase migration `011_audit_logs.sql` applied + verified live; mandatory email verification enabled; `postcss`/`auth-js` advisories cleared (0 vulnerabilities).*

---

## 20. Recommended future hardening

1. Enable the OWASP CRS **managed rules** in the dashboard (Firewall → Managed Rules): xss/sqli/lfi/rfi/rce → deny, sd/ma/php → log. Custom rules are already live via the API.
2. Add Turnstile/hCaptcha to signup **only if** signup abuse is observed (human-in-the-loop handoff until then).
3. ~~Introduce structured log export/alerting on `audit_logs` (e.g. daily digest of `SUSPICIOUS_REGISTRATION`).~~ **Done in code 2026-09-10:** `GET /api/cron/security-digest` (CRON_SECRET-gated, Vercel Cron daily 07:00 UTC) aggregates the last 24h of `audit_logs` and emails counts + suspicious-registration/admin-action flags via Resend; skips gracefully while `ADMIN_ALERT_EMAIL` is unset; 11 unit tests green (suite now 374 passed). Live email pending: set `ADMIN_ALERT_EMAIL` in Vercel env.
4. Consider a `next@16` major upgrade on its own schedule (Turbopack default, `proxy.ts` rename) — no longer security-driven, since the `postcss` advisory is cleared via `overrides`.
5. Provision the Oracle A1 VM to make Ollama-first the default AI path and remove third-party API dependence.

---

*Generated by the implementation pass against the actual repository. No control is claimed here that does not exist in code/configuration.*
