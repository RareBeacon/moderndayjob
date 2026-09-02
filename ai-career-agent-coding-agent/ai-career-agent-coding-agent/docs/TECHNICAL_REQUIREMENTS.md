# AI Career Agent, Technical Requirements

## 1. Technology Baseline

- Frontend: Next.js + TypeScript.
- UI: Tailwind CSS + accessible component system.
- Hosting: Vercel for MVP.
- Database/Auth/Storage: Supabase.
- AI gateway: OpenRouter.
- AI fallback: Hugging Face Inference Providers.
- Email: Gmail API + Google OAuth.
- Browser automation: Playwright in a worker-capable environment when required.
- Validation: Zod or equivalent schema validation.
- Testing: unit, integration, end-to-end.
- Observability: structured logs, agent-run records, error tracking.

## 2. Runtime Separation

The application must distinguish:
1. Browser/client code.
2. Server-only code.
3. Background jobs.
4. Browser automation workers.
5. AI provider adapters.
6. External integration adapters.

Secrets must never be exposed to client bundles.

## 3. Authentication

- Supabase Auth.
- Email/password and/or Google sign-in.
- Session-based authorization.
- Server-side authorization checks.
- Every protected resource must be scoped to the authenticated user's ID.

## 4. Multi-Tenancy

All user-owned records must contain `user_id` directly or be reachable through a user-owned parent.

Supabase Postgres Row Level Security must be enabled for exposed tables. Policies must enforce ownership. Never rely only on frontend filtering.

Service-role/database-secret access is server-only.

## 5. Professional Profile

Store structured data for:
- Identity.
- Contact information.
- Target roles.
- Skills.
- Work experience.
- Projects.
- Education.
- Certifications.
- Achievements.
- Portfolio links.
- Preferences.
- Exclusions.
- Compensation.
- Work authorization information where voluntarily provided.

The master CV is an input source, not the canonical truth by itself.

## 6. Job Model

Normalized job records must include:
- source
- source_job_id
- canonical URL
- company
- title
- description
- location
- remote_type
- employment_type
- seniority
- salary data when available
- skills
- requirements
- posted_at
- discovered_at
- closing/expiry data when available
- application URL
- source metadata
- content hash

## 7. Job Deduplication

Deduplicate using:
- source + source_job_id when available.
- Canonical URL.
- Normalized company + title + location.
- Description/content fingerprint.

## 8. AI Gateway

Create one internal AI service:

`ai.generate(task, input, schema, options)`

It must support:
- Provider selection.
- Model selection.
- JSON/schema output.
- Retry with exponential backoff.
- Rate-limit handling.
- Provider fallback.
- Token/request accounting.
- Prompt versioning.
- Output validation.

Do not scatter direct OpenRouter calls throughout the codebase.

## 9. Free AI Strategy

OpenRouter free usage is currently limited to 50 requests/day unless the account meets its higher free-model quota condition. The product must therefore minimize AI calls and maintain usage counters.

Recommended pipeline:
1. Deterministic filtering.
2. Batched AI scoring.
3. Generate materials only for finalists.
4. Cache results.
5. Use Hugging Face as a fallback.
6. Never assume a specific free model will remain available.

The free-model router can change models over time, so task outputs must be validated against schemas.

## 10. Truthfulness Guard

All generated claims must be traceable to verified profile facts.

The application generator must:
- Reject unsupported claims.
- Flag ambiguous claims.
- Never invent years of experience.
- Never invent employers.
- Never invent degrees/certifications.
- Never invent quantified achievements.

## 11. Application Automation

Use an adapter pattern:
- Greenhouse adapter.
- Lever adapter.
- Ashby adapter.
- Workday adapter where technically feasible and permitted.
- Generic browser-assisted adapter.

The generic adapter must be conservative.

Stop conditions:
- CAPTCHA.
- Anti-bot challenge.
- Authentication challenge.
- Unrecognized high-risk action.
- Missing required information.
- Truthfulness violation.
- User approval required.
- Website terms/policy that disallow the intended automation.

## 12. Gmail

Use Google OAuth.

Required access must be minimal and clearly disclosed.

Store refresh tokens securely server-side.

Do not store Gmail passwords.

Gmail events should be normalized into:
- recruiter
- interview
- assessment
- rejection
- application update
- other

Email-to-application matching should use:
- sender/domain
- company
- job title
- known application URL/domain
- message content
- thread identifiers

Never auto-classify a critical event with no confidence threshold.

## 13. Scheduling

MVP:
- One daily Vercel Cron job starts eligible agent runs.
- Cron creates work records; it should not attempt to perform the entire multi-step workload in one request.

Because Vercel Hobby cron runs once per day and timing is approximate, application work should be resumable and idempotent.

Future:
- Queue + dedicated worker.
- Per-user schedules.
- Concurrency control.

## 14. Idempotency

Every agent operation must have an idempotency key.

Examples:
- `job_discovery:{user}:{date}:{source}`
- `application:{user}:{job}`
- `email_event:{provider}:{message_id}`

Never submit the same job twice because of a retry.

## 15. Security

- Fine-grained secrets.
- Environment variables.
- Secret rotation.
- Encryption for OAuth tokens.
- No secrets in logs.
- No secrets in prompts.
- No secrets in Git.
- Input validation.
- Rate limiting.
- CSRF protection where applicable.
- SSRF protection for URL fetching.
- Domain allowlists for browser automation where practical.
- Audit logging.

## 16. Testing

Required:
- Unit tests.
- Database policy tests.
- AI schema tests.
- Provider fallback tests.
- Job dedupe tests.
- Application idempotency tests.
- Gmail webhook/event tests.
- Browser adapter tests with fixtures.
- Full user E2E test.

## 17. Deployment

MVP deployment:
- GitHub repository.
- Vercel project.
- Supabase project.
- Environment variables configured manually.
- OAuth credentials configured manually.
- OpenRouter/Hugging Face keys configured manually.

Never let the coding agent commit production secrets.

## 18. Configuration

All user-adjustable values must be database configuration, not hard-coded:
- Daily target.
- Minimum match score.
- Preferred locations.
- Salary.
- Employment type.
- Search roles.
- Exclusions.
- Application mode.

## 19. Performance

The dashboard should load without waiting for agent work.

Agent work is asynchronous and represented by statuses.

The UI must show:
- queued
- running
- waiting
- succeeded
- partially succeeded
- failed

## 20. Reliability

A failed source must not stop all sources.

A failed application must not stop other applications.

A provider rate limit must trigger backoff/fallback.

A browser crash must be recoverable.

Every run must be resumable.
