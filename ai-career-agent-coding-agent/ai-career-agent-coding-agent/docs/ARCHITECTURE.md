# AI Career Agent, Architecture

## 1. System Overview

The system is a multi-tenant SaaS-style web application with an asynchronous agent pipeline.

```text
Users
  |
  v
Next.js / Vercel
  |
  +--> Supabase Auth
  |
  +--> Supabase Postgres
  |
  +--> Supabase Storage
  |
  +--> OpenAI-compatible endpoints (user credentials, encrypted)
  |
  +--> Ollama (server, optional)
  |
  +--> Job Source Adapters
  |
  +--> Browser Worker
```

## 2. Core Architectural Principle

Separate:
- User interface.
- Orchestration.
- AI reasoning.
- deterministic business rules.
- external integrations.
- browser automation.
- persistence.

The AI must never be the sole authority for security, identity, authorization, truthfulness, quotas, or submission state.

## 3. Request Flow

```text
Browser
  ↓
Next.js server route
  ↓
Authentication
  ↓
Authorization
  ↓
Service layer
  ↓
Database / external adapter
```

## 4. Agent Flow

```text
Scheduler
  ↓
Create agent_run
  ↓
Load active users
  ↓
Load profile/preferences
  ↓
Discover jobs
  ↓
Normalize
  ↓
Deduplicate
  ↓
Filter
  ↓
AI match
  ↓
Shortlist
  ↓
Generate package
  ↓
Truthfulness validation
  ↓
Application gate
  ↓
Submit/approve
  ↓
Verify
  ↓
Persist
  ↓
Notify
```

## 5. Job Source Architecture

```text
JobSourceAdapter
  ├── discover()
  ├── normalize()
  ├── get_details()
  └── health_check()
```

Each adapter returns the same normalized Job object.

## 6. Application Adapter Architecture

```text
ApplicationAdapter
  ├── can_handle()
  ├── inspect()
  ├── map_fields()
  ├── fill()
  ├── upload_documents()
  ├── submit()
  └── verify()
```

Adapters must return structured statuses.

## 7. AI Architecture

```text
AIService
  |
  +--> OpenAICompatProvider
  |
  +--> OllamaProvider
  |
  +--> FutureProvider
```

Tasks:
- profile extraction
- user job-target analysis (the user brings the job; there is no listings pool)
- CV tailoring
- cover letter
- application answers
- truthfulness check
- email classification

Each task has a versioned prompt and JSON schema.

## 8. Email Architecture (no inbox access)

Per decision D-001 there is NO Gmail access, no inbox OAuth, and no mailbox
reading. Email in Jobiest means exactly two things:

1. The user's application email (profiles.application_email), the address
   applications are sent from during assisted handoff or auto-submit.
2. Notification emails Jobiest sends to the user (transactional provider).

There is no Gmail API integration, no email classification pipeline, and no
interview detection from inboxes. Interview status changes are entered by the
user on the applications dashboard.

## 9. Scheduler Architecture

MVP:
- Vercel daily cron.
- Cron creates agent runs.
- Work should be resumable.

Future:
```text
Cron
 ↓
Queue
 ├── AI workers
 ├── Application workers
 └── Email workers
```

## 10. Storage

Postgres:
- business data.

Object storage:
- CVs.
- generated documents.
- optional evidence.

Never put secrets in object storage.

## 11. Observability

Every agent run gets:
- run ID.
- user ID.
- start/end.
- status.
- events.
- errors.
- counts.

Never log:
- OAuth tokens.
- API keys.
- full private emails.
- sensitive CV data unnecessarily.

Client-side observability: unhandled errors hit `app/error.tsx`, which reports
(bounded, rate-limited) to `/api/client-error`; rows land in `audit_logs` with
action `CLIENT_ERROR` for weekly review (`docs/runbook.md` §5).

Delivery surfaces: the web app (jobiest.com) is also an installable PWA
(manifest + service worker with offline fallback page, `public/sw.js`).
(The Capacitor mobile shells were retired on 2026-09-17 by owner decision;
the product is web-only.)

## 12. Scaling Path

### V1
Vercel + Supabase.

### V2
Dedicated queue/worker.

### V3
Separate AI, browser, and email workers. (Job discovery workers were retired
with the listings feature on 2026-09-20; users bring their own job targets.)

### V4
Provider abstraction and paid/fallback AI providers.

## 13. Failure Isolation

Each external dependency is isolated.

If:
- A user AI provider fails → next provider in the gateway.
- one application fails → other applications continue.
- browser crashes → application returns to retryable state.
