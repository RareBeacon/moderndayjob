# AI Career Agent — Architecture

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
  +--> OpenRouter
  |
  +--> Hugging Face
  |
  +--> Gmail API
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
  +--> OpenRouterProvider
  |
  +--> HuggingFaceProvider
  |
  +--> FutureProvider
```

Tasks:
- profile extraction
- job matching
- CV tailoring
- cover letter
- application answers
- truthfulness check
- email classification

Each task has a versioned prompt and JSON schema.

## 8. Gmail Architecture

```text
Google OAuth
  ↓
Encrypted token storage
  ↓
Gmail Watch
  ↓
Webhook
  ↓
Email normalizer
  ↓
Classifier
  ↓
Application matcher
  ↓
Interview detector
  ↓
Notification
```

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
 ├── Discovery workers
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

## 12. Scaling Path

### V1
Vercel + Supabase.

### V2
Dedicated queue/worker.

### V3
Separate job discovery, AI, browser, and email workers.

### V4
Provider abstraction and paid/fallback AI providers.

## 13. Failure Isolation

Each external dependency is isolated.

If:
- one job source fails → other sources continue.
- OpenRouter fails → fallback provider.
- one application fails → other applications continue.
- Gmail fails → job automation continues, email monitoring retries.
- browser crashes → application returns to retryable state.
