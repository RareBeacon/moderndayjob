# AI Career Agent — Coding Agent Start Here

Read this file first. Then read `AGENTS.md` and `docs/CODING_AGENT.md` before changing code.

## Product
- Profession-agnostic accounts/workspaces: AI Engineer, Content Creator, Developer, etc.
- User provides an application email address; the platform has NO Gmail/inbox access and NO inbox OAuth scope.
- Free forever: 3 AI documents in total (not daily), 10 career-tool uses/day, manual apply only.
- Free tools: personalized CV/resume, ATS analysis, job-description analysis, matching, tracking and documented career tools.
- Basic: NGN 5,000/month, 3 AI documents/day, 2 lifetime auto-apply trial uses, 50 tool uses/day.
- Premium: NGN 10,000/month, 10 AI documents/day, 10 auto-apply slots/day (agent mode), unlimited tools.
- Max: NGN 20,000/month, 20 AI documents/day, 20 auto-apply slots/day (agent mode), unlimited everything.
- Flutterwave is the payment gateway.
- AI providers: users can bring their own OpenAI-compatible endpoint credentials (encrypted at rest, egress-guarded); a server-side Ollama pair is optional. No Gmail/inbox access ever (D-001).
- Render is the deployment target.

## Non-negotiable security
- Browser/frontend is untrusted. Never trust client plan, role, quota, price, workspace or payment state.
- Every premium/automation action is authorized server-side.
- Supabase Auth + PostgreSQL RLS provide tenant isolation.
- Flutterwave webhooks must be signature-verified; transactions must be verified server-side; webhook processing must be idempotent.
- Use atomic quota reservation and application idempotency.
- Rate-limit signup, auth, AI, billing and automation endpoints.
- Duplicate-account detection is risk scoring; same name or same IP alone is not proof of identity.
- Admin can suspend/terminate accounts, revoke sessions, cancel tasks and use emergency kill switches.
- Never expose service-role, Flutterwave secret, OpenRouter/HF keys or encryption keys to the browser.
- Encrypt stored provider credentials with authenticated encryption and rotate keys.
- Browser workers are isolated and external URL navigation is SSRF-protected.
- Validate private file uploads.

## Current state (2026-09)
Live at jobiest.com. Phases 0-5 + 7 (core) + 9 (core) of `docs/IMPLEMENTATION_ROADMAP.md` are shipped: homepage, auth, profile/documents, job discovery (registry + circuit breaker + dedup + freshness), application agent (approval snapshots, sensitive-question policy), security (capability engine, egress allowlist, injection corpus), 24 migrations applied, 578 passing tests. Auto-submit remains behind the kill switch. Run `npm ci` before `npm run typecheck` (deps are not committed).

## Implementation order
1. Read all docs and inspect the existing scaffold.
2. Complete database migrations/RLS.
3. Auth, workspaces, profiles and onboarding.
4. Entitlements and usage/quota services.
5. Flutterwave billing/webhooks/verification.
6. Admin/security/risk/audit controls.
7. Encrypted AI provider credential vault and provider adapters.
8. Free career tools.
9. Job discovery/matching.
10. Agent queue and application state machine.
11. Isolated Playwright browser workers/site adapters.
12. UI/UX and dashboards.
13. Unit/integration/E2E/security tests.
14. Render staging deployment.
15. Production-readiness verification.
16. Only after all gates pass, enable live autonomous submissions.

## Secrets
Use `.env.example` only as a template. Real secrets belong in Render environment/secret storage. Never commit them. Use Flutterwave test credentials until payment tests pass.

## Definition of done
Do not claim production-ready until typecheck, lint, unit, integration, RLS, payment, entitlement-bypass, quota-race, duplicate-account, browser-isolation and SSRF tests pass; staging deploys successfully; controlled payment verification succeeds; and admin emergency controls work.

## New since v5.3 (production-grade pass, commit 7ea380e)

- Homepage buttons rethemed gold/navy (fixes black-on-black CTAs; all now 11.86-16.92:1 contrast, verified live).
- Billing reconciliation: `/api/billing/flutterwave/verify` + "Check payment status" on `/billing/success`.
- Bring-your-own AI provider: `/profile/ai` + `/api/credentials` (encrypted at rest, egress-guarded).
- PWA: installable manifest + service worker + `/offline` fallback; icon set in `public/icons/`.
- Native app shells: `apps/mobile` (Capacitor 6, wraps jobiest.com; see its README for Android/iOS builds).
- E2E smoke suite: `npm run e2e` (Playwright against production).
- Error monitoring: client errors land in `audit_logs` (`CLIENT_ERROR` action).
- Operations: `docs/runbook.md` (deploy, backup, rollback, monitoring, incidents, known gaps).

## Auth, Email, Support & Onboarding (2026-09)

Shipped and live:

- **Settings** (`/settings`, Profile -> Settings): Security (TOTP two-factor), Support links, Account (sign-out with confirmation).
- **TOTP MFA**: Supabase native MFA (`mfa.enroll/challenge/verify/unenroll`). Enrollment with QR (Google Authenticator) + manual key at Settings; login gains a real second step at `/mfa-verify` (middleware gates aal1 sessions with enrolled factors; `requireUser` throws `MFA_REQUIRED` for APIs). Disable requires a fresh valid code. Enable/disable send branded security emails via `/api/auth/mfa/notify` (server re-verifies factor state first; never fake alerts).
- **Branded transactional email** (`lib/email/templates.ts` + `lib/email/resend.ts`): email-safe table layout, logo `https://jobiest.com/images/email-logo.png`, sender `Jobiest <no-reply@jobiest.com>`. Verification code, welcome (once per account via `profiles.welcome_email_sent_at` marker), password reset, MFA security, support relay.
- **Onboarding guide**: public `/help/getting-started` (7 steps, real CTAs).
- **Support**: public `/support` form -> `/api/support` (rate-limited 5/h, zod-validated) -> stored in `support_messages` + relayed via Resend to the inbox configured in `app_config.support_inbox` (reply-to preserved). Until an inbox is configured, messages are stored and the response says so honestly.
- **Migration 026**: `profiles.welcome_email_sent_at`, `support_messages`, `app_config` (applied; RLS on, service-role only).
- `lib/site.ts` fallback is now `https://jobiest.com` (was the legacy vercel URL) so emails/canonicals can never point at the stale host.

Owner actions still pending: confirm philip/phlip + the two forwarding Gmail addresses; DNS (SPF, DMARC, MX + forwarder) at Vercel; set `app_config.support_inbox` once the support Gmail is confirmed.

## Google sign-in (deployed 2026-09-16)

- "Continue with Google" on /login and /signup (PKCE OAuth via Supabase).
- Google-created accounts must verify their email with a 6-digit code
  (/verify-email) before using the product; password accounts unchanged.
- Migration 025 (profiles.email_verified_at + email_verification_codes,
  service-role only) is applied to production.
- Google OAuth COMPLETE: provider enabled, redirect URI added, verified
  end to end live (button on /login -> accounts.google.com sign-in page,
  no errors). First real google sign-up goes through the /verify-email
  code gate. Cosmetic follow-up: set the consent-screen app name to
  Jobiest (docs/google-oauth-setup.md).
