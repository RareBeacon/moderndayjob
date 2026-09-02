# AI Career Agent, Implementation Plan

## Phase 0, Repository and Safety

Deliver:
- README.
- docs directory.
- architecture.
- environment example.
- gitignore.
- license.
- CI.
- linting.
- formatting.
- test runner.

Acceptance:
- Clean install.
- Typecheck passes.
- Test suite runs.
- No secrets in repository.

## Phase 1, App Shell

Build:
- Next.js.
- authentication.
- protected routes.
- dashboard shell.
- navigation.
- responsive design.

Acceptance:
- User can sign up/sign in/sign out.
- Protected routes work.

## Phase 2, Database

Build:
- migrations.
- tables.
- indexes.
- RLS.
- policies.
- seed/dev data.

Acceptance:
- User A cannot read User B data.
- CRUD works through server layer.
- migrations are reproducible.

## Phase 3, Professional Profile

Build:
- onboarding.
- role selector.
- CV upload.
- CV extraction.
- structured profile editor.
- skills/experience/projects/education.
- target roles.
- preferences.

Acceptance:
- User can create AI Engineer profile.
- User can create Content Creator profile.
- No profession-specific hard coding.

## Phase 4, Job Discovery

Build:
- job source interface.
- first source adapters.
- normalization.
- dedupe.
- source health.
- job browser.

Acceptance:
- Jobs appear with canonical metadata.
- Duplicates are prevented.

## Phase 5, AI Gateway

Build:
- provider interface.
- OpenRouter provider.
- Hugging Face provider.
- fallback.
- usage counters.
- prompt versioning.
- schema validation.

Acceptance:
- AI call works.
- malformed output rejected.
- provider failure falls back.
- quotas enforced.

## Phase 6, Matching Engine

Build:
- deterministic filters.
- batched AI scoring.
- match explanation.
- configurable threshold.
- shortlist.

Acceptance:
- Job scores are explainable.
- Previously applied jobs are excluded.

## Phase 7, Application Intelligence

Build:
- personalized CV generator.
- cover letter generator.
- application answers.
- truthfulness checker.
- document versioning.

Acceptance:
- Generated materials contain only supported facts.
- Each application has immutable document references.

## Phase 8, Application Workflow

Build:
- application state machine.
- approval mode.
- assist mode.
- adapter interface.
- first supported ATS adapters.
- Playwright fallback only where appropriate.
- submission verification.
- idempotency.

Acceptance:
- Approval workflow works end-to-end.
- Duplicate submission impossible through retry.
- Unsupported/blocked pages stop safely.

## Phase 9, Gmail

Build:
- Google Cloud OAuth setup instructions.
- Gmail connection.
- encrypted tokens.
- mailbox event processing.
- classification.
- application matching.
- interview detection.

Acceptance:
- User can connect Gmail.
- A test email is classified.
- Interview event appears on dashboard.

## Phase 10, Daily Agent

Build:
- daily Vercel cron.
- active-user selection.
- agent runs.
- resumable steps.
- per-user quotas.
- activity feed.

Acceptance:
- Daily run starts.
- Partial failure does not destroy entire run.
- User can pause agent.

## Phase 11, Analytics

Build:
- application counts.
- response rate.
- interview rate.
- source performance.
- role performance.
- CV performance.

Acceptance:
- Metrics are derived from real application records.

## Phase 12, Hardening

Build:
- rate limits.
- security headers.
- SSRF protection.
- secret scanning.
- audit logs.
- error monitoring.
- backup strategy.
- retry policies.
- kill switch.

Acceptance:
- Security checklist passes.
- No known critical vulnerabilities.

## Phase 13, Production Deployment

Checklist:
- Supabase production project.
- Vercel production project.
- environment variables.
- OAuth redirect URIs.
- cron secret.
- database migrations.
- storage policies.
- RLS verification.
- domain.
- health checks.
- smoke tests.

## Phase 14, Worker Upgrade

Only after MVP usage proves the need:

```text
Vercel
  ↓
Queue
  ↓
Dedicated worker
  ├── AI
  ├── Job discovery
  ├── Playwright
  └── Email
```

Do not prematurely add paid infrastructure.

## Recommended Build Order

1. Security foundation.
2. Auth.
3. Database/RLS.
4. Profile/onboarding.
5. Job discovery.
6. AI gateway.
7. Matching.
8. Document generation.
9. Approval workflow.
10. Gmail.
11. Daily automation.
12. Browser adapters.
13. Analytics.
14. Production hardening.

## Definition of 10/10

A 10/10 implementation is:
- multi-user.
- profession-agnostic.
- secure.
- resumable.
- observable.
- truthful.
- idempotent.
- cost-aware.
- mobile-friendly.
- extensible.
- tested.
- deployable.
- capable of adding worker infrastructure later without redesigning the domain model.
