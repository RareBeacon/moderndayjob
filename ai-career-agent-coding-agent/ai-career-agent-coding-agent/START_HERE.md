# AI Career Agent — Coding Agent Start Here

Read this file first. Then read `AGENTS.md` and `docs/CODING_AGENT.md` before changing code.

## Product
- Profession-agnostic accounts/workspaces: AI Engineer, Content Creator, Developer, etc.
- User provides an application email address; the platform has NO Gmail/inbox access and NO inbox OAuth scope.
- Free forever: 2 AI career/document credits per day.
- Free tools: personalized CV/resume, ATS analysis, job-description analysis, matching, tracking and documented career tools.
- 7-day automation trial: 15 automated applications total.
- Basic: NGN 5,000/month, 10 automated applications/day.
- Premium: NGN 10,000/month, 20 automated applications/day.
- Flutterwave is the payment gateway.
- OpenRouter and Hugging Face credentials are admin-assigned per user/workspace and encrypted at rest.
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
