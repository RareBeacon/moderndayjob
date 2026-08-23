# Modern Job — End-to-End Execution Plan

**Source of truth:** `RareBeacon/moderndayjob` architecture and security rules.

## Product decisions locked

- Product is a profession-agnostic, multi-tenant career workspace.
- No Gmail inbox access, Gmail OAuth, mailbox monitoring, or stored email passwords.
- Users provide an application email address only.
- Free: 2 AI career/document credits daily, no autonomous applications.
- Automation trial: 7 days, 15 total applications.
- Basic: NGN 5,000/month, 10 automated applications daily.
- Premium: NGN 10,000/month, 20 automated applications daily.
- Flutterwave is the payment provider. Subscription access is granted only after server-side verification.
- Vercel hosts the public web application. Render hosts durable agent, browser, and scheduler workers. Supabase provides Auth, PostgreSQL, RLS, and private storage.
- Approval/assist is the initial application mode. Autonomous submission is disabled until every operational and security gate passes.

---

## Definition of done

The product is ready for controlled production launch only when:

1. Authentication, onboarding, profile editing, document storage, jobs, applications, plans, and account controls are functional.
2. All user-owned data is protected by Supabase RLS and tested against cross-user access.
3. Free-tool and automation quota enforcement happens server-side and is race-safe.
4. Flutterwave test payment, verified webhooks, idempotency, entitlement activation, cancellation, and error flows pass.
5. AI outputs are schema-validated, source-traceable, and passed through truthfulness checks.
6. Job-source adapters, application adapters, agent tasks, retries, logs, and kill switches are operational.
7. Browser workers are isolated, URL navigation is SSRF-protected, and CAPTCHA/anti-bot challenges stop the workflow.
8. Automated tests, security tests, staging smoke tests, monitoring, backups, and deployment rollback checks pass.
9. Live autonomous submissions remain disabled until an explicit final go-live approval.

---

## Phase 0 — Architecture, repository, and deployment safety

### Deliverables
- Repository structure aligned with web, packages, workers, migrations, docs, and tests.
- Stable pinned Node, Next.js, TypeScript, Supabase, and worker dependencies.
- Safe environment template and secret hygiene.
- Vercel production deployment and health endpoint.
- Implementation decisions recorded.

### Exit gate
- Typecheck, tests, production build, and deployment pass.
- No production secret is in the repository, client bundle, logs, or docs.

**Status:** complete for the current foundation.

---

## Phase 1 — Identity, tenant isolation, and workspace onboarding

### Deliverables
- Email/password signup, login, session refresh, sign-out, and protected routes.
- One workspace/profile/subscription created on signup.
- Account status checks for active, suspended, and terminated accounts.
- Profession-agnostic onboarding.
- Profile CRUD for name, target roles, headline, summary, skills, work experience, education, projects, portfolio links, and application email.
- Profile completeness calculation.

### Security requirements
- Server-side user verification on every protected route.
- RLS tests for user A/user B and anonymous access.
- Email verification required before premium/automation actions.

### Exit gate
- A new user can create an account, complete a profile, sign out/in, and only view their own data.

**Status:** auth, core workspace onboarding, basic profile data, and protected routes complete. Structured background editing is next.

---

## Phase 2 — Private document management

### Deliverables
- Private Supabase Storage buckets.
- PDF CV upload, MIME/size/signature validation, file hashing, and signed download URLs.
- Document metadata, ownership, and lifecycle records.
- Master CV selection and later generated-document versioning.
- Optional malware scanning integration before production launch.

### Exit gate
- A user can upload/download only their own valid CV. Private objects are inaccessible cross-user and anonymously.

**Status:** private master-CV upload and expiring signed download links complete. Generated documents/versioning remain pending.

---

## Phase 3 — Career workspace and application tracking

### Deliverables
- Dashboard populated from real records only.
- Manual application tracking with state transitions.
- Application timeline, source URL, outcome, error, and audit event records.
- Application lifecycle: draft, queued, submitted, interview, rejected, withdrawn, failed.
- Idempotency and duplicate prevention.

### Exit gate
- A user can track their own real applications and never sees fabricated data or another user’s history.

**Status:** manual application tracking and real dashboard counts complete. Full state machine/audit UI pending.

---

## Phase 4 — Entitlements, quotas, billing, and administration

### Deliverables
- Server-side plan/entitlement service.
- Atomic daily AI-credit reservation.
- Atomic daily application reservation.
- Flutterwave checkout creation.
- Signed webhook validation, server-side transaction verification, payment idempotency, and subscription activation.
- Billing history, cancellation, and plan-change UI.
- Admin dashboard for account status, risk flags, credential management, subscription actions, and emergency termination.

### Required configuration
- `FLW_SECRET_KEY`
- `FLW_SECRET_HASH`
- Flutterwave test plan IDs and webhook URL

### Exit gate
- Test payments cannot grant access from client redirects alone. Duplicate webhooks and quota races are covered by tests.

---

## Phase 5 — AI career tools

### Deliverables
- Provider adapter interface: OpenRouter primary, Hugging Face fallback.
- Encrypted credential vault using AES-256-GCM and key versioning.
- Admin-only credential write/rotate flow; full keys never return to UI.
- Input/output Zod schemas and JSON validation.
- Prompt versions, token accounting, retries, backoff, cache, and provider fallback.
- Resume feedback, job-description analysis, ATS analysis, and career document drafting.
- Truthfulness guard: all claims mapped to verified profile facts; unsupported claims rejected.

### Required configuration
- `ENCRYPTION_MASTER_KEY`
- Provider credentials through the admin vault
- Optional OpenRouter/Hugging Face account configuration

### Exit gate
- Daily free credits are enforced server-side. Malformed/unsupported AI output is rejected and provider errors do not expose secrets.

---

## Phase 6 — Job discovery and matching

### Deliverables
- Normalized job model.
- Adapter interface with health checks and source-specific error isolation.
- First permitted adapters: Greenhouse, Lever, Ashby.
- Dedupe by source ID, canonical URL, and content fingerprint.
- Deterministic pre-filter plus explainable match scoring.
- Match explanations and user-specific shortlist decisions.

### Security requirements
- Treat job content as untrusted; isolate prompt injection.
- Validate outbound URLs and block private/internal IPs.
- Respect provider/source terms, rate limits, and technical restrictions.

### Exit gate
- Discovery is resumable and idempotent. One failed source cannot block others.

---

## Phase 7 — Application intelligence and controlled workflow

### Deliverables
- Immutable resume/cover-letter/application-answer versions.
- Fact-source mapping and truthfulness verification.
- Application state machine and approval/assist workflow.
- Duplicate, expired-job, required-field, entitlement, and authorization gates.
- Submission confirmation capture and audit events.

### Exit gate
- Default approval flow works end-to-end. Retrying never sends a duplicate application.

---

## Phase 8 — Workers and controlled automation

### Deliverables
- Render web/agent/browser/scheduler services.
- Worker task claiming, retries, backoff, leases, logs, cancellation, and idempotency.
- Isolated Playwright contexts with no cross-user cookies.
- Domain allowlists, SSRF guard, no arbitrary file/shell access.
- Site-specific ATS adapters only.
- CAPTCHA, login challenge, unclear action, unsupported form, truthfulness issue, or policy restriction = stop and request user action.
- Kill switch for admin and user.

### Required configuration
- Render service configuration
- Queue/worker configuration
- `CRON_SECRET`
- Optional Upstash Redis for rate limits/queue support

### Exit gate
- Browser isolation, cancellation, CAPTCHA stop behavior, and controlled staging submission tests pass.

---

## Phase 9 — Quality, observability, and launch

### Deliverables
- Unit, integration, RLS, billing, quota-race, AI-schema, browser-adapter, SSRF, and end-to-end tests.
- Error monitoring, structured worker logs, health checks, backups, and incident runbook.
- Admin security review, dependency audit, and secret rotation plan.
- Staging environment and controlled beta program.

### Launch stages
1. Public marketing site
2. Auth/onboarding/private document beta
3. Free AI-tool beta
4. Billing beta with Flutterwave test/live verification
5. Job discovery beta
6. Approval-only application preparation beta
7. Controlled assisted browser workflow beta
8. Explicit approval before any autonomous-submission release

---

## Delivery cadence

Every implementation increment must:

1. Add or update migration(s) and RLS where data changes.
2. Validate client input and authorize server-side.
3. Include loading, empty, error, and retry states in the UI.
4. Add relevant unit/integration tests.
5. Pass typecheck, test, and production build.
6. Deploy to Vercel only after gates pass.
7. Report what is live, what is inactive, and which secrets/configuration remain required.
