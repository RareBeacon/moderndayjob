# JOBIEST MOBILE — RESTART: RESEARCH, FINDINGS & IMPLEMENTATION PLAN

**Date:** 2026-09-17 · **Status:** COMPLETE PLAN — say "GO" and I start Phase 1
**Companion document:** `docs/mobile-flutter-audit.md` (the full audit this plan is built on)

---

# PART A — RESEARCH & FINDINGS

## A1. What was studied

1. **The entire web codebase** — every API route (47 route files), request/response shapes, error codes, rate limits, entitlement gates.
2. **The database** — all 27 migrations, table shapes, RLS posture.
3. **Authentication** — Supabase Auth flows (password, Google, TOTP MFA, reset), cookie vs native-client paths.
4. **The design system** — the canonical brand kit v5.2 (colors, type, shape, motion, mobile UX standards) copied verbatim from the live product CSS.
5. **The current APK** — a Capacitor WebView shell pointing at jobiest.com (`com.jobiest.app` v1.0.0). It is exactly the "website inside an APK" that must be replaced.
6. **The build environment** — three full toolchain attempts (Flutter SDK + Android SDK + JDK 21, ~5 GB each) in this sandbox; each was destroyed by a sandbox recycle before a build completed. **Root cause found and fixed in this plan (§C2).**

## A2. Key findings

**F1 — The backend is already mobile-ready.** Deployed commit `bc0ca35` added everything a native client needs (this is done, tested with 618 passing tests, live):
- `Authorization: Bearer <token>` accepted across all 35 product API routes (cookie/web behavior unchanged).
- `/api/saved-jobs` (GET/PUT/DELETE, idempotent, rate-limited) + `saved_jobs` table.
- `jobiest://auth/callback` registered on Supabase for the mobile Google sign-in return. Google Cloud needs **no** change (Google only ever redirects to the Supabase callback, already registered).
- The website is untouched and live (verified 200).

**F2 — Complete API contract exists for every planned feature** (full table in the audit doc): jobs, saved jobs, applications (+ timeline + 6 actions), profile, career profile, preferences, agent on/off, AI match, 7 AI tools, ATS scan, resume studio (draft/AI/generate), documents (list/upload/download/generated), entitlements, Flutterwave create+verify, support. **Features with no backend were identified and are excluded** (push notifications, web-side saved jobs, AI key vault) — nothing will be faked.

**F3 — The build loop had a fixable cause.** This sandbox recycles between conversation turns and wipes installed toolchains. The fix: **GitHub Actions builds the APK** (repo already on GitHub Actions). I write code + tests here; CI runs analyze → test → build and attaches the APK for download. Zero toolchain downloads here, reproducible builds, no more lost days.

**F4 — What survived the aborted starts (kept, reviewed):** project config (pubspec with 9 justified dependencies), Plus Jakarta Sans fonts (5 weights), brand images, and 4 foundation files (app config, typed error hierarchy, API client, data-state model). Everything else will be written fresh in the phases below.

## A3. Constraints stated honestly

| Constraint | Consequence | Handled by |
|---|---|---|
| No physical Android device here | Real-device testing must be done by you | I deliver APK + 10-point test checklist (P10) |
| No macOS here | iOS cannot be compiled | iOS config ships ready + a documented build path for when you have a Mac/Apple Developer account |
| Play Store account still pending ($25) | Store upload waits on you | App + signed AAB + store pack ready the moment you have it |
| Closed-testing rule (12 testers × 14 days) | Production listing timing | Started as soon as you upload |

---

# PART B — WHAT WE ARE BUILDING (PRODUCT SPEC)

A genuine Flutter app. **Zero WebViews.** Bottom navigation: **Home · Jobs · Agent · Applications · Profile**. Jobiest brand (teal `#0aa9a6`, paper `#faf8f3`, petrol ink `#0c2a2e`, Plus Jakarta Sans, 48px touch targets, ≥16px body text). Every screen has loading / loaded / empty / error / offline states. Every number is real backend data.

### Screen-by-screen specification

| # | Screen | Content & actions | Backend |
|---|---|---|---|
| 1 | **Login** | Email+password, Google button (system browser → returns via `jobiest://`), forgot password link, signup link | Supabase |
| 2 | **Signup** | Name, email, password → creates account through `/api/auth/signup` (welcome email, audit, abuse checks all stay identical) then signs in | `/api/auth/signup` |
| 3 | **MFA step** | 6-digit code entry after password when a factor is enrolled; "use another account" | Supabase MFA |
| 4 | **Reset password** | Request link by email → deep link returns to app → set new password | Supabase |
| 5 | **Home** | Greeting + avatar, hero "Your next opportunity is here.", search bar (→ Jobs), readiness ring (real %) with "improve" CTA, latest jobs (horizontal cards), recent applications, agent status card with contextual next step | jobs, applications, completeness |
| 6 | **Jobs** | Search, filter bottom sheet (remote, location, source, type), segments Latest / Saved, JobCards (company mark, title, company, location, remote chip, salary/skills when present, posted date, save heart), pull-to-refresh, skeletons | `/api/jobs`, `/api/saved-jobs` |
| 7 | **Job details** | Company, title, location, type, salary, description/skills when present, sticky actions: Apply · Save · Share · Open original; "Apply with AI" starts the agent flow | `/api/applications` |
| 8 | **Apply flow** | 3 steps: review job → confirm application email (your dedicated application address or account email) → confirmation with what the agent will do next (nothing sent without your approval) | `/api/applications` `{jobId,email}` |
| 9 | **Applications** | Filter chips by status; cards (job, company, date, status badge, next action); tap → detail | `/api/applications` |
| 10 | **Application detail** | Full status, package documents (view/download), agent timeline (completed ● / running ◐ / waiting ○ states — real events only), actions: Approve · Reject · Withdraw · Submit · Cancel | `/api/applications/[id]` + 6 action routes |
| 11 | **CV Studio** | Step editor: Personal → Career → Skills → Experience → Education → Projects → Certifications → Review → Generate. Autosave per step, add/reorder/edit cards, AI assist, truthfulness-guarded generation, generated docs library, PDF upload with progress | `/api/resume-studio/*`, `/api/documents*` |
| 12 | **Agent** | Status header ("needs your approval" when true — real), activity list from applications+timelines, agent on/off toggle, cancel running task | applications, `/api/preferences/agent`, `/api/tasks/[id]/cancel` |
| 13 | **Profile** | Readiness breakdown (9 real checks with "add X" actions), career profile edit (headline, summary, skills, experience, education, links), job preferences (remote types, locations, employment types, salary, daily target) | profile, preferences, completeness |
| 14 | **Billing** | Current plan + entitlements (real counts), plans BASIC/PREMIUM/MAX in Naira, checkout opens Flutterwave in browser, return → server-side verify, honest failed/pending states | `/api/billing/*`, `/api/entitlements` |
| 15 | **Settings** | Security: MFA enrollment (QR + manual key) and disable (fresh code required); Support (contact + link); Sign out with confirmation; About (version) | Supabase MFA, `/api/support` |

**Out of scope for v2.0.0 (documented, not faked):** push notifications (no backend; recommended v2.1 via Supabase + FCM), dark mode (paper theme is the brand), AI key vault (stays web-only).

---

# PART C — HOW IT WILL BE BUILT

## C1. Architecture (feature-first, boring on purpose)

```
lib/
├── main.dart                    # bootstrap: Supabase.init, providers, router
├── app/
│   ├── app.dart                 # MaterialApp, theme, router
│   ├── theme/app_theme.dart     # every design token → Material 3 ThemeData
│   ├── router/app_router.dart   # go_router, auth guard, jobiest:// deep links
│   └── main_shell.dart          # bottom navigation scaffold
├── core/
│   ├── config/app_config.dart   # --dart-define env (API/Supabase/versions)
│   ├── network/api_client.dart  # Bearer auth, typed errors, retry-on-GET-only
│   ├── errors/app_exception.dart
│   ├── state/async_state.dart   # Loading/Data/Empty/Error/Refreshing
│   ├── models/                  # typed models for every endpoint response
│   └── widgets/                 # AppButton, AppTextField, AppCard, JobCard,
│                                # StatusBadge, SectionHeader, EmptyState,
│                                # ErrorState, Skeleton, AppDialog, AppSheet
└── features/
    ├── auth/  home/  jobs/  job_details/  applications/
    ├── resume/  agent/  profile/  billing/  settings/
        # each: repository (API calls) + controller (ChangeNotifier) + screens
```

Flow: **Screens → Controllers (provider) → Repositories → ApiClient → existing backend.** No API calls inside widgets. Consequential POSTs are never auto-retried; CTAs disable while submitting (duplicate-submission safe).

**Dependencies (9, each justified in pubspec):** supabase_flutter (auth/session/MFA), go_router (routing+deep links), provider (state), http (API), flutter_secure_storage (session in Keystore/Keychain), url_launcher (job links/checkout), share_plus, qr_flutter (MFA QR), file_picker (PDF upload). Fonts bundled — no runtime font fetch, no secrets in code (only public publishable values).

## C2. Build & delivery system (the fix for the loop)

- **All Android builds on GitHub Actions** (new `.github/workflows/flutter.yml`): analyze → test → `flutter build apk` → APK attached as artifact on every push; release job builds the signed AAB/APK using the existing keystore through encrypted CI secrets (keystore never enters the repo).
- This sandbox: code + tests + docs only. Nothing to re-download, nothing to lose.
- Version 2.0.0+2 · `com.jobiest.app` (same id and keystore → your existing store listing updates when you publish).

## C3. Phases — each one ends in a working, committable state

| Phase | What ships | Acceptance gate (measured, not vibes) |
|---|---|---|
| **P1** Skeleton | Theme, router, shell, API client, all models, CI workflow | `flutter analyze` clean in CI; app boots to Login |
| **P2** Auth | Login, signup, Google, MFA step, reset, secure session | Real sign-in/up/out against production; MFA user forced through code step |
| **P3** Jobs | List, search, filters, saved, JobCard, all states | Browse + save + share on real data |
| **P4** Details + Apply | Details screen, apply flow | Apply creates a real application, duplicate-tap safe |
| **P5** Applications | Tracker, detail, timeline, all actions | Approve/reject/withdraw/submit verified |
| **P6** CV Studio | Full draft editor, generation, documents | CV created end-to-end on real account |
| **P7** Profile + Agent + Billing | All three areas | Reads/writes real data; agent toggle works |
| **P8** Settings + polish | MFA enroll QR, support, sign-out, animations, a11y labels | Full walkthrough clean |
| **P9** QA | Unit tests (models, client, auth) + widget tests (JobCard, login, jobs, applications) | `flutter analyze` + `flutter test` green in CI; debug APK artifact downloadable |
| **P10** Release | Signed release APK + AAB, store pack v2, install checklist | **You install the release APK on your phone and run the 10-point checklist** |

**Your part at P10:** install + test on your Android phone (checklist provided), then when ready: $25 Play account → upload AAB → closed testing 12 testers × 14 days → publish.

## C4. Quality gates (non-negotiable)

1. Every screen: loading / empty / error / offline states with the exact copy from the plan.
2. No fabricated data anywhere; backend error codes mapped to honest human messages.
3. `flutter analyze` clean, `flutter test` green — enforced in CI on every push.
4. Website regression: zero web code changes after `bc0ca35` (backend frozen for the app).
5. Security: session in secure storage; no tokens/passwords in logs; HTTPS only; no admin endpoints in the app.

## C5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sandbox recycles again | Certain | CI builds (C2) — no local toolchain dependency |
| Play Store package/signing mismatch | Low | Same app id + same keystore, verified locally before upload |
| Flutterwave checkout return flow | Medium | Verify is server-driven; app re-checks entitlements on return; pending state shown honestly |
| Google sign-in on device | Low | Supabase redirect registered; tested in P2 before building on top of it |
| Scope creep | Medium | This document is the scope; changes go through you |

---

# DECISIONS BAKED IN (you skipped the questions, so I chose the safe defaults — change any of them by reply)

1. **Full feature set in v2.0.0** (every endpoint exists; a leaner app would still cost the same architecture).
2. **GitHub Actions builds the APK** (ends the toolchain loop permanently).
3. **Keep `com.jobiest.app` + existing keystore** (store continuity).
4. **Three checkpoints** where I stop and show you: after P2 (working login), after P6 (core product), after P10 (release candidate). Between checkpoints I just build — no noise.

**Reply "GO" to start Phase 1, or tell me what to change first.**
