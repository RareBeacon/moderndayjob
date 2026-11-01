# Jobiest Cybersecurity, User Data Protection & Admin Panel Audit Report

- **Date:** November 1, 2026 (Africa/Lagos)
- **Target Launch Window:** November 2, 2026
- **Branch:** `arena/18473c9c-moderndayjob` (`main` untouched pending Production Authorization Gate)
- **Verification Status:** `113/113` Vitest suites passed (`1,103` passing tests, `0` failures), `tsc --noEmit` (`0` errors), `next build` (`145/145` pages compiled cleanly, `0` secret leaks in `.next/static`)

---

## 1. Executive Summary

A full-depth security review was conducted across three pillars of `jobiest.com`:
1. **Cybersecurity Controls** (authentication, session lifecycle, MFA enforcement, cryptography, SSRF/XSS/CSRF/injection defenses, rate limiting, webhooks, cron security, HTTP headers, error hygiene, and tamper-evident audit trails).
2. **User Data Protection & Privacy** (Postgres Row-Level Security across migrations `001` through `052`, storage bucket isolation, CV/recording signed URLs, credential ciphertext isolation, B-063 PII masking, and Talent Pool 6-purpose consent & employer isolation).
3. **Admin Panel & Admin APIs** (`12` SSR pages under `app/admin/**` and `23` API route files under `app/api/admin/**`).

During this audit, **8 concrete security vulnerabilities (`6` High/P1, `2` Medium/P2)** were discovered and **100% remediated** in code, database migration `052_cybersecurity_admin_and_userdata_hardening.sql`, and automated regression suite `tests/cybersecurity-userdata-admin.test.ts`.

---

## 2. Vulnerabilities Discovered & Remediated

| ID | Severity | Surface | Vulnerability Discovered | Remediation Applied |
|---|---|---|---|---|
| **SEC-P1-001** | **High (P1)** | User Data / RLS (`public.ai_credentials`) | Migration `010` left policy `ai_credentials_self` (`for select using (auth.uid() = user_id)`) active on `public.ai_credentials`, allowing a stolen user JWT or XSS payload to query `ciphertext` and full `base_url` directly via PostgREST, bypassing `/api/credentials` host-only masking. | Added `supabase/migrations/052_cybersecurity_admin_and_userdata_hardening.sql` dropping `ai_credentials_self` and revoking client writes while keeping RLS enabled (PostgREST returns `200 []` to `anon` and `authenticated`; only server-side `service_role` routes read/write and never return `ciphertext`). |
| **SEC-P1-002** | **High (P1)** | Admin Panel & Employer Portal (Stored XSS via URL fields) | Zod's `z.string().url()` delegates to `new URL(...)` and accepts `javascript:alert(...)` and `data:text/html,...`. Employer `website_url`, candidate `portfolio_url`, `credentialUrl`, `projects[].url`, and manual job `url` were rendered into `<a href={...}>` in `/admin/employers` and `/employer/candidates/[id]`. | Created `lib/security/safe-url.ts` (`isSafeHttpUrl`, `safeExternalHref`), enforced `http://` or `https://` at schema validation (`lib/talent-pool/schemas.ts`, `lib/schemas/profile.ts`, `app/api/applications/**`), added render-time `safeExternalHref` guards in Admin & Employer views, and added DB constraint `employer_organizations_website_url_http_chk` in migration `052`. |
| **SEC-P1-003** | **High (P1)** | Admin Credential Vault (`POST /api/admin/credentials`) | Unlike user-facing `/api/credentials`, the admin endpoint validated `baseUrl` only with `z.string().url()` without calling `assertPublicHttpsUrl(...)` (`B-223`), permitting loopback (`127.0.0.1`), RFC1918 private IPs (`10.0.0.0/8`), cloud metadata (`169.254.169.254`), or cleartext `http://` endpoints where workers send decrypted API keys. | Enforced `assertPublicHttpsUrl(b.baseUrl, { requireHttps: true })` (`422 BASE_URL_BLOCKED`) in `app/api/admin/credentials/route.ts` and sanitized `409` error bodies. |
| **SEC-P1-004** | **Critical / High (P1)** | Destructive Admin Endpoint (`POST /api/admin/purge`) | `/api/admin/purge` permanently deleted up to 5,000 non-admin users via `supabaseAdmin.auth.admin.deleteUser` with only a static confirmation string, no production environment lock, no password re-auth token, and no `audit_logs` record. | Locked `POST /api/admin/purge` behind `ALLOW_DESTRUCTIVE_ADMIN_PURGE === 'true'` in `production` (default `403 PURGE_DISABLED_IN_PRODUCTION`), required a valid 5-minute `revealToken` (`verifyRevealToken`), and gated execution behind fail-closed `requireAuditEvent` (`ADMIN_MASS_USER_PURGE`). |
| **SEC-P1-005** | **High (P1)** | Audit Engine (`lib/audit.ts`) | `insertAuditRow` awaited `supabaseAdmin.from('audit_logs').insert(...)` without checking `{ error }`; because Supabase resolves `{ data: null, error }` instead of throwing on DB failures, `requireAuditEvent` (guarding PII reveals) could silently succeed when `audit_logs` rejected writes. Also, `sanitizeMeta` only redacted top-level strings, skipping nested objects/arrays. | Updated `insertAuditRow` to throw when `res.error` is non-null (making `requireAuditEvent` genuinely fail-closed while keeping `auditEvent` best-effort) and upgraded `sanitizeMeta` to recursively redact secret keys and `Bearer` / `sk-` / JWT patterns across nested objects and arrays. |
| **SEC-P1-006** | **High (P1)** | Admin Account Controls (`terminate`, `suspend`, `signout`) | `terminate` and `suspend` checked `userId === admin.id` (`signout` did not), allowing one compromised admin account to suspend, terminate, or force-sign-out peer administrators or the primary platform owner. | Added `isPeerAdminTarget(...)` in `lib/admin.ts` and enforced both self-protection and peer-admin protection (`409 CANNOT_MODIFY_ADMIN_ACCOUNT`) across `terminate`, `suspend`, and `signout`. |
| **SEC-P2-001** | **Medium (P2)** | Admin PII Reveal & User Detail (`/api/admin/users/**`, `/admin/talent-pool/[id]`) | `/api/admin/users/reveal` allowed `60/min` password guesses per IP (`3,600/hr`) and left ephemeral GoTrue sessions open; `/api/admin/users/[id]` lacked `z.guid()` validation and returned unmasked emails inside `recentAudit`/`recentSecurity` metadata without a reveal token; `/admin/talent-pool/[id]` rendered raw candidate email outside B-063. | Capped `/api/admin/users/reveal` to `6` attempts per `10 m` per IP and per `admin.id`, added `8s` upstream timeout + immediate `/auth/v1/logout?scope=local` cleanup, added `z.guid()` validation + `503 AUDIT_UNAVAILABLE` fail-closed handling + nested metadata email masking (`maskEmailsInStructure`) on `/api/admin/users/[id]`, and masked candidate emails (`maskEmailAddress`) in Talent Pool admin views. |
| **SEC-P2-002** | **Medium (P2)** | Error Hygiene, Rate Limits, Crypto & Headers (`lib/admin.ts`, `crypto.ts`, `next.config.mjs`) | `adminErrorResponse` echoed raw `error.message` on `500`s and lacked explicit mappings for `MFA_REQUIRED`/`SESSION_*`/`ACCOUNT_*`; `GET /api/admin/coupons`, `GET /api/credentials`, and `GET /api/applications` lacked per-method `enforceRateLimit`; `decryptSecret` did not pre-validate IV/tag byte lengths; `/api/admin/*` lacked `Cache-Control: no-store` and `X-Robots-Tag` headers. | Hardened `adminErrorResponse` to return generic `{ error: 'INTERNAL_SERVER_ERROR' }` on `500`s; added `enforceRateLimit` on all three `GET` handlers; added strict `12`-byte IV / `16`-byte GCM auth-tag validation in `packages/security/crypto.ts`; added `no-store` + `X-Robots-Tag: noindex, nofollow, noarchive` rules in `next.config.mjs`. |

---

## 3. Verified Security Controls Matrix

### A. Cybersecurity Controls
- **Authentication & Session Lifecycle (`lib/auth.ts`, `lib/session.ts`, `middleware.ts`):**
  - Dual-layer verification: Supabase Auth JWT (`supabase.auth.getUser()`) + server-tracked `jobiest_app_session` (`HttpOnly`, `Secure` in prod, `SameSite=Lax`, SHA-256 hashed session token, **30-minute idle timeout**, **7-day absolute lifetime**).
  - Immediate enforcement of `profiles.account_status`: `SUSPENDED` and `TERMINATED` accounts are rejected on every authenticated request (`requireUser`) even before JWT expiry.
  - **Mandatory MFA Step-Up (`aal2`):** Any user or administrator with a verified TOTP factor is blocked from `aal1` API/SSR access (`MFA_REQUIRED` / redirect to `/mfa-verify`) until TOTP verification completes.
- **Cryptography & Secret Storage (`packages/security/crypto.ts`, `lib/security/reveal.ts`):**
  - User/admin AI provider keys are encrypted with **AES-256-GCM** (`96`-bit CSPRNG IV, `128`-bit authentication tag) keyed from `SHA-256(ENCRYPTION_MASTER_KEY)`.
  - Admin PII reveal tokens (`B-063`) use domain-separated **HMAC-SHA256** (`reveal-v1:<adminId>:<exp>`), bound to the issuing `adminId`, expiring in **300 seconds**, verified via `crypto.timingSafeEqual`.
- **Webhooks, Cron Jobs & OAuth State:**
  - **Paystack** (`HMAC-SHA512`), **Flutterwave** (`verif-hash`), **Dodo Payments** (Standard Webhooks `HMAC-SHA256`), and **Tally** (`HMAC-SHA256`) enforce payload size caps (`64 KB`–`256 KB`), `crypto.timingSafeEqual` signature verification over raw request bytes, database replay deduplication (`payment_events`), and server-to-server transaction re-verification before granting entitlements.
  - **Cron routes (`/api/cron/**`)** enforce constant-time `CRON_SECRET` Bearer comparison (`timingSafeCronBearerMatch`).
  - **Admin Google SEO OAuth (`/api/admin/seo/oauth/**`)** binds an `HttpOnly` one-time `seo_oauth_state` cookie and deletes it immediately on callback.
- **Rate Limiting & Automated Self-Scan:**
  - **100% of API route files** enforce `enforceRateLimit` (Upstash Redis sliding window in production with in-memory fallback in local/test).
  - Daily automated self-penetration scanner (`lib/security/self-scan.ts`) continuously tests HTTPS redirect, HSTS/CSP/XFO/nosniff headers, anonymous PostgREST RLS (`profiles`, `ai_credentials`, `usage_daily`), tampered JWT claims (`role=service_role`, `alg=none`, forged `sub`), IDOR probes, and `/api/admin/**` blocks.

### B. User Data Protection & GDPR / Consent Governance
- **Row-Level Security & Database Isolation (`supabase/migrations/001..052`):**
  - Every table in `public` has RLS enabled (`D1`), zero `USING (true)` / `WITH CHECK (true)` policies exist (`D2`), and every `SECURITY DEFINER` function pins `set search_path = public` (`D6`).
  - Pre-retrieval candidate isolation on `talent_rag_chunks` (`WHERE user_id = $1 AND application_id = $2`) prevents cross-candidate prompt/context bleed during AI interviews.
- **Document & Recording Storage Isolation:**
  - Master CVs (`app/api/documents/route.ts`) enforce `5 MB` cap, `application/pdf` MIME check, `%PDF-` magic-byte verification, SHA-256 digest logging, and user-namespaced storage keys (`<user_id>/<uuid>-<safeName>`).
  - Resume photos (`app/api/resume-studio/photo/route.ts`) enforce `2 MB` cap and JPEG/PNG magic-byte verification before PDF embedding.
  - Candidate CVs (`/api/employer/candidates/[candidateId]/cv`) and interview recordings (`/api/admin/talent-pool/recordings/[recordingId]`) reside in private buckets and issue short-lived signed URLs (`60s`–`300s`) only after fail-closed `requireAuditEvent` logging and consent checks.
- **Talent Pool 6-Purpose Consent & Employer Isolation (`lib/talent-pool/recruiter-service.ts`):**
  - Candidates appear in employer search **only** when all 6 invariants hold simultaneously: (1) employer org is `VERIFIED`, (2) application is `APPROVED` by a human admin, (3) `talent_pool_profiles.visibility = 'ACTIVE'`, (4) `profiles.account_status = 'ACTIVE'`, (5) `EMPLOYER_DISCOVERY` consent is active and not withdrawn, and (6) employer's `business_email_domain` is not in the candidate's `blocked_employer_domains`.
  - Candidate names are masked to `First L.` in employer discovery, contact details remain hidden until the candidate accepts an employer contact request, and `/api/talent-pool/withdraw` immediately revokes employer visibility.

### C. Admin Panel & Admin APIs (`app/admin/**`, `app/api/admin/**`)
- **100% Server-Side Authorization:**
  - Every single SSR page under `app/admin/**/page.tsx` (`12/12`) executes `export const dynamic = 'force-dynamic'`, `requireUserOrRedirect(...)` (including MFA `aal2` when enrolled), and a server-side `admin_users` lookup before querying data or rendering markup.
  - Every single API handler under `app/api/admin/**/route.ts` (`23/23`) enforces `enforceRateLimit` + `requireAdminUser(req)` (`admin_users` table lookup — never client claims or env email lists).
- **Tamper-Evident Audit Trails:**
  - Every admin privilege action writes to `admin_actions` and/or `audit_logs` (`ADD_AI_CREDENTIAL`, `REVOKE_AI_CREDENTIAL`, `ROTATE_AI_CREDENTIAL`, `TERMINATE_ACCOUNT`, `SUSPEND_ACCOUNT`, `REVOKE_SESSIONS`, `ADMIN_PII_REVEAL`, `ADMIN_USER_PII_READ`, `ADMIN_COUPON_CREATED`, `ADMIN_TALENT_DECISION`, `ADMIN_EMPLOYER_VERIFICATION`, `ADMIN_MASS_USER_PURGE`).
  - Client roles (`anon`, `authenticated`) have `INSERT`, `UPDATE`, and `DELETE` revoked on `admin_users`, `admin_actions`, `audit_logs`, and `security_events`.
