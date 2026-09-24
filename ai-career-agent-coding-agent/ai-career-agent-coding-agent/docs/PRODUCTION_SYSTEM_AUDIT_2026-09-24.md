# PRODUCTION SYSTEM AUDIT — 2026-09-24

Evidence-based integration map of the live Jobiest system. Every claim below
was verified on 2026-09-24 against production (curl, DB query, GitHub/Vercel
APIs, or CI runs). Commit at time of audit: bb129c5.

## WEB

- Production URL: https://jobiest.com (Vercel, project `modernjob`).
  www → apex redirect. jobiest.ai is DEAD (deleted from the .ai registry
  2026-09-24 ~16:33Z) and must never be used again.
- Public pages (200 verified): /, /about, /help, /how-it-works, /login,
  /signup, /pricing, /free-ats-resume-scanner, /portfolios (shareable by
  design), /blog.
- Protected pages (307 → /login?next=… verified unauthenticated):
  /dashboard, /onboarding, /profile, /settings, /documents, /applications,
  /billing, /generate, /mfa-verify, /complete-account.
- Auth: Supabase SSR cookies on web. Middleware gates protected paths;
  pages re-gate via requireUserOrRedirect (every auth outcome triaged:
  anonymous → login, MFA pending → /mfa-verify, suspended → signout+login).
  Auth acquisition is fail-soft: a throwing auth call reads as anonymous,
  never a 500.
- OAuth: Google + LinkedIn via Supabase; buttons build redirectTo from
  window.location.origin (domain-agnostic); first-hop authorize verified 302
  to both providers with jobiest.com/auth/callback accepted.
- Signup: POST /api/auth/signup (RL 5/h/IP), 6-digit email code via Resend,
  Supabase blocks tokens until email confirmed.

## ANDROID

- Repo: github.com/RareBeacon/jobiest-android (public), main = 2ee37e7,
  tree identical to the released v1.0.0 build (e3a5a92).
- applicationId com.jobiest.android; API base https://jobiest.com/api/;
  Supabase Auth URL + public anon key only (no service keys, no
  local.properties/keystore/google-services tracked; scanned).
- Auth: Supabase password signup/login + Bearer access token in
  Authorization header (AuthInterceptor); token in Android Keystore-backed
  SecureSessionManager; logging disabled for headers in release.
- Release v1.0.0 assets on GitHub (APK 2.78 MB, AAB 5.49 MB) — built from
  the same tree; unit tests green (gradle testDebugUnitTest).

## BACKEND (one source of truth for both clients)

- All routes under ai-career-agent-coding-agent/ai-career-agent-coding-agent/.
- API: ~75 routes. Mobile-consumed set (all verified 401 unauthenticated):
  auth/{signup,verify}, profile, profile/completeness, preferences,
  preferences/mode, jobs (q/location/source/page/limit, sanitized),
  saved-jobs, applications (+target/prepare/{id}/approve/auto-submit/submit/
  reject/withdraw), ats/scan, free-tools/generate, entitlements,
  billing/providers, billing/{paystack,flutterwave}/create,
  notifications (+preferences/register-token/unregister-token/test).
- Rate limits: jobs/saved-jobs/notifications 60/m, preferences 30/m,
  register/unregister 10/h, test 5/h, signup 5/h (auth runs before the
  limiter on gated routes, so anonymous floods get 401s, not 429s).
- DB: Supabase Postgres. RLS enabled on user tables (notifications table
  created 2026-09-24 migration 042 with user-scoped policies + forced RLS;
  profiles gained device_tokens/notification_preferences).
- Ownership: user_id always derived from the session (requireUser), never
  from client input; notifications/push lib queries .eq('user_id', …).
- Observability: audit_logs for auth/admin events, CLIENT_ERROR (client
  boundary) and SERVER_RENDER_ERROR (real server exception + user, added
  2026-09-24) — this capture found the dashboard root cause same day.

## INFRASTRUCTURE

- GitHub: RareBeacon/moderndayjob (web) + RareBeacon/jobiest-android.
  CI 3/3 green on bb129c5 (gitleaks, typecheck+tests+build, prod E2E).
- Vercel: production deploys from main; bb129c58 live and verified.
- VM (Oracle, 147.224.218.163): worker/api/ai.jobiest.com all healthz 200;
  401 gates verified; BROWSER_WORKER_SECRET/Ollama keys active.
- Render lifeboat: jobiest-browser-worker.onrender.com (200).
- Email: Resend via site jobiest.com (site_url verified); SPF/MX present.
- Payments: Paystack (+Flutterwave), geo two-currency (NGN/USD) live.
- Supabase auth: site_url https://jobiest.com; Google + LinkedIn enabled.

## DATA FLOW

```
WEB (cookies) ─┐
               ├─→ NEXT.JS API (requireUser: cookie or Bearer)
ANDROID (JWT) ─┘        ↓
                 SUPABASE POSTGRES (RLS + server-side user scoping)
                        ↓
        VM services (browser worker / AI) · Resend · Paystack
```

One identity system: web and Android authenticate against the same
Supabase user store; all ownership is server-derived.

## ISSUES FOUND & FIXED (2026-09-24)

| # | Issue | Root cause | Fix | Evidence |
|---|-------|-----------|-----|----------|
| 1 | Mobile API 404 in prod | PRs #5/#6 placed routes at repo root, outside the app | Relocated + hardened (commit 05027ac) | prod 401s on all endpoints; CI E2E |
| 2 | /dashboard crashed for every authenticated user since M7 (2026-09-23 12:54) | Promise.all destructure bound pipelineCounts to the PostgREST response object; for-of threw "(B ?? []) is not iterable"; an `as unknown as` cast silenced TypeScript | Destructure { data: pipelineCounts }, no casts (commit bb129c5) | SERVER_RENDER_ERROR capture showed exact message 4×; regression test added; 933 tests green |
| 3 | iOS crash misdiagnosed twice as auth/stale-cookie | Redacted client error hid the server exception | SERVER_RENDER_ERROR instrumentation (commit 5a73da9) | found #2 within hours of deploy |
| 4 | Auth failures could 500 pages | auth.getUser() throw propagated past UNAUTHENTICATED-only catch | Fail-soft auth + requireUserOrRedirect + middleware catch (5a73da9) | garbage/stale-cookie probes → clean 307 |
| 5 | Fabricated sample notifications | Table-missing fallback invented data | Honest empty list (05027ac) | code + tests |
| 6 | Android app pointed at jobiest.com (correct) — briefly changed to .ai in error, then reverted | Wrong assumption during .ai outage | Revert 2ee37e7 (tree == released build) | git diff empty |

## KNOWN LIMITATIONS (honest)

- Push notifications: server records tokens + history only; no real FCM
  send yet. In-app "test push" is a local demo.
- No authenticated-dashboard E2E (needs the dedicated test account, still
  pending from the owner). The M7 crash class was invisible to CI for this
  reason.
- Real-device Android QA (sideload, OAuth on device, offline behavior) and
  full Google/LinkedIn sign-in on jobiest.com need a human pass with real
  accounts.

## OUTSTANDING OWNER ACTIONS

1. Rotate the exposed full-scope GitHub PAT (plaintext in Antigravity
   scripts + chat) → fine-grained token for the two repos.
2. Have the iOS user open https://jobiest.com (not the dead .ai bookmark),
   log in, and load /dashboard; any failure now lands in SERVER_RENDER_ERROR
   with the real message.
3. Provide the dedicated e2e test account so authenticated flows can be
   continuously verified.
