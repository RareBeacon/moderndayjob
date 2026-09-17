# Jobiest Mobile — Phase 1 Audit (Flutter rebuild)

Audit date: 2026-09-17 · auditor: engineering agent · commit at audit: `bc0ca35`

## 1. Existing architecture summary

- **Web app**: Next.js 15.5 (App Router, RSC) at `apps/web` (repo path `ai-career-agent-coding-agent/ai-career-agent-coding-agent`), deployed on Vercel at **jobiest.com**. Deploy = `git push main` (CI: typecheck → vitest → build).
- **Workers**: Render web services (`jobiest-browser-worker` visible via Render API; agent/api/scheduler/browser workers in the codebase at `workers/`).
- **Storage**: Supabase project `cbxloutahmalorumaihc` (Postgres + Auth + Storage bucket `career-documents`).
- **State**: React server components + client islands; no SPA state library. Styling: single `app/globals.css` design system (see §6).

## 2. Backend / API summary

All product APIs are Next.js route handlers under `/api/*`. JSON in/out, error shape `{ error: CODE }` (+ optional `message`, `issues`), status codes: 400 invalid, 401 unauth, 404 missing, 429 rate/entitlement, 500 infra. Rate limits per IP/user (Upstash Redis sliding window).

Mobile-relevant surface (auth-gated unless noted):

| Endpoint | Method(s) | Purpose |
|---|---|---|
| `/api/jobs` | GET | Public job pool, ≤50 rows, dedup + 30-day freshness. No pagination params yet. |
| `/api/saved-jobs` | GET/PUT/DELETE | Saved jobs (NEW, migration 027; idempotent; 30/min). |
| `/api/applications` | GET/POST | List with `.job` normalized; POST manual track or automated (`{jobId,email}` → agent `taskId`). |
| `/api/applications/[id]` | GET | `{application, package, timeline, automationEnabled}`. |
| `/api/applications/[id]/{approve,reject,withdraw,submit,auto-submit}` | POST | Agent application actions. |
| `/api/applications/prepare` | POST | Idempotent application create/return. |
| `/api/tasks/[id]/cancel` | POST | Cancel an agent task. |
| `/api/profile` | GET/PUT/DELETE | profiles + career_profiles (headline, summary, skills, experience, education, projects, links). |
| `/api/profile/completeness` | GET | `{percent, next[], checks[]}` — the real "score" (9 checks). |
| `/api/preferences` | GET/PUT | job_preferences (remote_types, locations, employment_types, salary_min, currency, application_mode, daily_target, active). |
| `/api/preferences/agent` | POST | Agent on/off (`{active}`). |
| `/api/ai/match` | POST | Explainable job matching (entitlement-gated, deterministic fallback). |
| `/api/ai/resume|analyze-job|interview-questions|followup-email|salary-insights|career-paths|profile-copy` | POST | AI tools (entitlement-gated, metered). |
| `/api/ats/scan` | POST | ATS CV scan. |
| `/api/resume-studio/draft` | GET/PUT | Multi-step CV draft (autosave). |
| `/api/resume-studio/ai` | POST | Draft AI assistance. |
| `/api/resume-studio/generate` | POST | Generate CV (truthfulness-checked; 422 with report if unsupported facts). |
| `/api/documents` | GET/POST | CV library (PDF-only upload, ≤ MAX_BYTES, sha256). |
| `/api/documents/generated`, `/api/documents/generate` | GET/POST | Generated documents. |
| `/api/documents/[id]/{download,export}` | GET | Download/export. |
| `/api/entitlements` | GET | Plan entitlements (tool uses, applications remaining). |
| `/api/billing/flutterwave/{create,verify}` | POST | Checkout create (returns `tx_ref` + hosted payment data) / server-side verify. |
| `/api/support` | POST | Support intake (public, rate-limited, stores + relays). |
| `/api/health` | GET | Public health. |

**Do not call from mobile**: `/api/admin/*` (admin-gated), `/api/cron/*` (secret-gated), webhooks (`tally`, `flutterwave/webhook`), `/api/free-tools/*` (marketing surfaces), `/api/credentials` (AI key vault — web settings only; excluded from the app by design).

## 3. Authentication summary

- Provider: **Supabase Auth** (GoTrue). Web: `@supabase/ssr` cookie sessions; MFA (TOTP) enforced via middleware + `requireUser` (`MFA_REQUIRED`).
- Methods: email/password (signup pre-confirms — documented product decision), Google OAuth (web redirect flow + 6-digit email code gate for new google identities), TOTP MFA (enroll/verify/unenroll), password reset via emailed action link.
- **Native-client gap (fixed in `bc0ca35`)**: routes previously authenticated only via cookies. Now `Authorization: Bearer <supabase access token>` is accepted when no cookie session exists; the token is validated provider-side (admin `getUser`) and the MFA gate derives from the token's `aal` claim. Cookie behavior is bit-for-bit unchanged (test-covered).
- OAuth return for mobile: `jobiest://auth/callback` added to Supabase `uri_allow_list` (management API). Google itself only ever redirects to the Supabase callback URL, which is already registered in the Google OAuth client — **no Google Cloud change needed**.

## 4. Database summary

Supabase Postgres; migrations in `supabase/migrations/` (001–027). Core tables: `profiles`, `career_profiles`, `job_preferences`, `jobs` (source, company, title, url, location, metadata jsonb, duplicate_key, last_seen_at), `applications` (status enum-ish set: DRAFT, PREPARING, AWAITING_APPROVAL, APPROVED, QUEUED, SUBMITTED, INTERVIEW, REJECTED, WITHDRAWN; error, submitted_at, idempotency_key), `agent_tasks` (agent activity timeline via APPLICATION_EVENT rows), `documents`, `subscriptions`, `support_messages`, `app_config`, **`saved_jobs` (new)**. All client access is service-role through API routes; RLS everywhere.

## 5. Existing Jobiest features (real, backend-backed)

Job pool browse (dedup/fresh), profile completeness score, career profile editing, job preferences, AI matching, AI tools (CV tailor, analyze job, interview questions, follow-up email, salary insights, career paths, profile copy), ATS scan, resume studio (draft → truthfulness-checked generation), documents library, application tracking with agent timeline + approval flow, Flutterwave billing (BASIC/PREMIUM/MAX, Naira), support intake, transactional email, TOTP MFA, onboarding guide.

**Not present (do not fabricate)**: saved jobs *on web* (mobile-first addition), notifications/push, career "score" beyond completeness+ATS (the mobile "Career readiness" experience is built on `/api/profile/completeness` — real data, real actions).

## 6. Design system

Canonical tokens (from `app/globals.css`, documented in `/home/user/jobiest-brand-kit/DESIGN_SYSTEM.md` v5.2):
- **Brand**: teal `#0aa9a6` (primary), `#067a7c` (strong), petrol ink `#0c2a2e`, soft `#e8f7f5`.
- **Neutrals**: paper `#faf8f3` bg, white cards, ink `#0c2a2e`/`#243b40`, muted `#51676b`/`#7c8c8e`, lines `#e4eceb`/`#eff4f3`.
- **Accents**: mint `#2fd9a8`, cobalt `#2f4cff`, coral `#ff6a4d`; success/warning/danger sets.
- **Type**: Plus Jakarta Sans (400–800); body never below 16px; kickers uppercase 800 +0.12em.
- **Shape/motion**: radii 8/14/20/28/36; soft petrol shadows; expo-out easing; 0.2s micro.
- Logo geometry: rising line (4,16)→(9,9)→(13,13)→(20,5) + goal dot, from `jobiest-brand-kit/` (SVG + PNGs).

## 7. Current APK architecture

`apps/mobile` = **Capacitor 8 shell** (`com.jobiest.app` v1.0.0) whose `server.url` is `https://jobiest.com` — a hardened WebView. Debug APK `jobiest-v1.0.0-debug.apk`; release gated on CI secrets; store pack in `apps/mobile/store/`; release keystore `~/jobiest-release.keystore`. **This is the "website inside an APK" the master prompt replaces.**

## 8. What can be reused

- The entire backend (all APIs above), Supabase Auth + MFA, billing, AI, email.
- Brand assets (kit), design tokens, copy voice, truthfulness rules.
- `com.jobiest.app` application id (store continuity), release keystore, store pack listing content.
- Capacitor app stays in-repo (unpublished anywhere; retired once the Flutter app ships).

## 9. What must be rebuilt

Everything client-side: a real Flutter app (`apps/mobile_flutter/`) with native navigation (bottom bar: Home / Jobs / Agent / Applications / Profile), Material 3 theme from the tokens, repository layer over the API table above, secure token storage, native flows for auth (incl. MFA step + Google via system browser), jobs, applications, resume studio, profile/completeness, agent workspace, billing hand-off.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Breaking the website | Backend changes are additive; cookie path proven unchanged by tests; web untouched otherwise. |
| Token leakage on device | supabase_flutter session persisted in `flutter_secure_storage` (Keystore/Keychain); never logged. |
| Duplicate submissions | Idempotency keys exist server-side; UI disables CTAs while submitting; no auto-retry of consequential POSTs. |
| Offline confusion | Cached reads + explicit offline banners; never fake success. |
| Entitlement bypass | All gating stays server-side; the app only renders what APIs return. |
| Play Store continuity | Same application id + keystore; store pack updated. |

## 11. Proposed Flutter architecture

`apps/mobile_flutter/` — feature-first:
`lib/app` (MaterialApp, go_router, theme) · `lib/core` (config, http API client with Bearer + error mapping, typed models, async-state sealed classes, shared widgets) · `lib/features/{auth,home,jobs,job_details,applications,resume,profile,agent,billing,settings}` (controller + repository + widgets per feature) · `test/` (unit + widget).

Dependencies (minimal): `supabase_flutter` (auth/session), `go_router` (routing/deep links), `provider` (state), `http` (API client), `flutter_secure_storage` (session persistence), `url_launcher` (job links, checkout), `share_plus` (share), `intl` (formatting). Fonts bundled (Plus Jakarta Sans) — no runtime font fetch.

## 12. Migration plan

Backend enablers (done, `bc0ca35`) → scaffold + theme + auth → home → jobs → job details → applications → resume studio → profile/completeness → agent workspace → billing → deep links → tests → analyze/test/apk → release build + store pack → docs.
