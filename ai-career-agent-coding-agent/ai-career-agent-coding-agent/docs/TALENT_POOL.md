# Jobiest Talent Pool & Verified Employer Platform

This document describes the architecture, database schema, security controls, and external service configuration for the integrated **Jobiest Talent Pool** (`Stages 1-4`).

## 1. Architecture & Non-Duplication Principles

The Talent Pool is integrated directly into the existing Next.js 15 App Router + Supabase + `packages/ai` monorepo without introducing a second authentication system or duplicating user profiles:

- **Authentication & Sessions**: Reuses `lib/auth.ts` (`getCurrentUser`, `requireUser`), `lib/admin.ts` (`requireAdminUser`), and `middleware.ts` session enforcement (`Cache-Control: private, no-store, max-age=0, must-revalidate` on `/talent-pool/*`, `/employer/*`, `/admin/*`).
- **Candidate Onboarding Inspection**: `lib/talent-pool/onboarding-inspector.ts` inspects existing `public.profiles`, `public.resumes`, `public.job_preferences`, and `public.talent_candidate_intakes`. Missing fields are surfaced explicitly for candidate completion and are **never fabricated**.
- **Open Access Across Plans**: Open to every registered Jobiest user (`FREE`, `STARTER`, `PRO`, `MAX`) with **zero credit deduction** (`createAIGateway()` invoked without `creditLedger`).
- **Human-in-the-Loop Governance**: The AI Interview Intelligence Engine (`lib/talent-pool/interview-engine.ts`) produces structured evidence-backed recommendations (`STRONG_EVIDENCE`, `MODERATE_EVIDENCE`, `LIMITED_EVIDENCE`, `REASSESSMENT_SUGGESTED`) plus confidence and limitation disclosures. **AI never approves or rejects a candidate.** Only human administrators (`lib/talent-pool/admin-service.ts`) can issue `APPROVE`, `REJECT`, or `REQUEST_REASSESSMENT` decisions, with mandatory documented reasons for `REJECT` and `REQUEST_REASSESSMENT`.

## 2. Database Migrations & Rollback

Forward migrations live in `supabase/migrations/`:

1. `047_talent_pool_applications.sql`: `talent_pool_profiles`, `talent_applications`, `talent_application_snapshots`, `talent_consents`.
2. `048_talent_interviews_and_assessments.sql`: `talent_interview_sessions`, `talent_interview_questions`, `talent_interview_recordings`, `talent_interview_answers`, `talent_interview_transcripts`, `talent_assessment_reports`, `talent_assessment_dimensions`, `talent_admin_reviews`, plus private `talent-recordings` storage bucket.
3. `049_employer_and_recruiter_platform.sql`: `employer_organizations`, `employer_members`, `employer_verifications`, `employer_saved_candidates`, `recruitment_vacancies`, `employer_shortlists`, `employer_shortlist_candidates`, `recruitment_pipeline_entries`, `talent_placements`.
4. `050_talent_interactions_and_messaging.sql`: `talent_contact_requests`, `talent_conversations`, `talent_messages`, `talent_interaction_reports`.

Reversible rollback SQL is stored in `supabase/rollbacks/047_to_050_talent_pool.down.sql`.

## 3. Security, Privacy & Isolation Controls

- **6 Granular Consents**: Stored independently per purpose (`AI_ASSESSMENT`, `AUDIO_VIDEO_PROCESSING`, `INTERVIEW_RECORDING`, `HUMAN_ASSESSMENT_REVIEW`, `EMPLOYER_DISCOVERY_SHARING`, `DATA_RETENTION_WITHDRAWAL`) with policy version, IP hash, user agent, and revocation timestamps.
- **Explicit Recording Disclosure & Accessible Route**: Recording never starts silently; candidates must complete device precheck or choose the `ACCESSIBLE_TEXT_STRUCTURED` non-audio/non-video assessment route. Interrupted interviews remain `IN_PROGRESS` / `FAILED` / `CANCELLED` and never auto-complete.
- **6-Gate Recruiter Discovery Isolation**: `lib/talent-pool/recruiter-service.ts` enforces verified employer membership (`verification_status = 'VERIFIED'`) and filters candidates strictly to `status = 'APPROVED'`, `visibility_status = 'ACTIVE'`, active `EMPLOYER_DISCOVERY_SHARING` consent, non-withdrawn preferences, and domain blocklist checks.
- **Confidential Data Boundaries**:
  - Candidates receive `candidate_feedback` and `reassessment_instructions`, never `internal_confidential_notes`.
  - Employers receive sanitized professional summaries, verified scores, and `60s` signed CV URLs (only when `allow_cv_download = true`), never raw interview recordings, private transcripts, unapproved candidates, or private email/phone prior to accepted outreach.
  - Admin playback of recordings uses audited `90s` signed URLs (`GET /api/admin/talent-pool/recordings/[recordingId]`).

## 4. Required & Optional External Credentials

Configure the following environment variables in `.env.local` / production secrets:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Supabase project URL (Auth, Postgres RLS, Private Storage buckets `career-documents` and `talent-recordings`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Supabase public anon key for SSR session validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only Supabase admin client (`lib/supabase.ts`) |
| `OPENAI_API_KEY` | Recommended | Primary LLM for question generation, adaptive follow-ups, structured assessment reports (`packages/ai`), and server Whisper STT fallback (`/api/talent-pool/interviews/[id]/transcribe`) |
| `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY` | Optional | Multi-provider `AIGateway` failover for interview question generation and report synthesis |
| `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` | Recommended in Prod | Distributed sliding-window rate limiting across all `/api/talent-pool/*`, `/api/employer/*`, and `/api/admin/*` endpoints |
| `RESEND_API_KEY` / SMTP (`EMAIL_FROM`) | Recommended in Prod | Transactional notifications (`lib/notifications/dispatch.ts`) for application submission, admin decisions, and employer invitations |

### Browser Speech & Media Capabilities
- **Voice Output (TTS)** and **Live Speech Recognition (STT)** use native browser `window.speechSynthesis` and `SpeechRecognition` / `webkitSpeechRecognition` with automatic server-side `OPENAI_API_KEY` (`whisper-1`) fallback on `POST /api/talent-pool/interviews/[id]/transcribe`, plus full keyboard/text accessibility via `ACCESSIBLE_TEXT_STRUCTURED`.
- **Media Permissions**: `next.config.mjs` scopes `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` strictly to `/talent-pool/interview/:path*` while keeping camera and microphone disabled (`camera=(), microphone=()`) on every other route.
