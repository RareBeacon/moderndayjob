# Jobiest - Authentication, OAuth & Session Architecture

## 1. Authentication Providers & Status

| Flow | Endpoint / Entry | Status | Notes |
|---|---|---|---|
| **Email + Password Registration** | `POST /api/auth/signup` -> `/verify-email` -> `POST /api/auth/verify` | **Active** | Normalizes email, validates E.164 phone + password policy (`>=8` chars, number, special char), scores velocity/abuse risk, creates unconfirmed user, sends 6-digit code via Resend (`email_verification_codes`). |
| **Email + Password Login** | `/login` (`signInWithPassword`) -> `POST /api/auth/session` | **Active** | Unconfirmed password accounts redirect to `/verify-email`. Validated logins mint `jobiest_app_session` before navigating to `/mfa-verify` or `/dashboard`. |
| **Google OAuth (PKCE)** | `GET /api/auth/oauth?provider=google` -> `GET /auth/callback` | **Active** | Top-level navigation starter sets PKCE `*-code-verifier` + `jobiest_oauth_ctx` on the `302` response for the exact validated origin (`lib/auth/oauth-origin.ts`). |
| **LinkedIn OIDC (PKCE)** | `GET /api/auth/oauth?provider=linkedin_oidc` -> `GET /auth/callback` | **Conditional** | Code path fully wired with graceful fallback (`?error=provider_disabled&provider=linkedin`) when LinkedIn OIDC is not enabled in Supabase Auth settings. |
| **Password Recovery** | `POST /api/auth/forgot-password` -> `/reset-password` -> `POST /api/auth/reset-password` | **Active** | Supports GoTrue recovery link token or recovery cookie session; revokes global GoTrue sessions on completion. |
| **TOTP Two-Factor Auth (MFA)** | `/settings` (`MfaManager`) -> `/mfa-verify` | **Active** | Enforced in both `middleware.ts` and `requireUser()` whenever `aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'`. |
| **Mobile Bearer Auth** | `Authorization: Bearer <jwt>` in `lib/auth.ts` | **Active** | Verified server-side via `supabaseAdmin.auth.getUser(token)` + MFA factor check (`userHasVerifiedMfaFactor`). |

---

## 2. Session Policy (30-Minute Inactivity / 7-Day Absolute Lifetime)

Supabase Free tier does not expose custom GoTrue server-side idle/timebox settings, so Jobiest enforces its session policy server-side in `lib/session.ts` + `public.app_sessions` (`supabase/migrations/044_app_sessions.sql`):

| Parameter | Constant (`lib/session.ts`) | Value | Enforcement |
|---|---|---|---|
| Cookie Name | `APP_SESSION_COOKIE` | `jobiest_app_session` | `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`, session-scoped (no `Max-Age`) |
| Inactivity Timeout | `IDLE_TIMEOUT_MS` | `30 * 60 * 1000` (30 mins) | `now - last_active_at > 30m` -> `IDLE_EXPIRED` -> redirect `/login?next=<path>&expired=1` |
| Absolute Lifetime | `ABSOLUTE_TIMEOUT_MS` | `7 * 24 * 60 * 60 * 1000` (7 days) | `now > expires_at` or `now - created_at > 7d` -> `ABSOLUTE_EXPIRED` -> redirect `/login?next=<path>&expired=1` |
| Activity Sliding Touch | `TOUCH_THROTTLE_MS` | `60 * 1000` (60 secs) | Authenticated page/API activity updates `last_active_at` at most once per 60s |
| Storage Security | `public.app_sessions` | `SHA-256(token)` | Raw token exists only in the `httpOnly` cookie; DB stores `token_hash` with RLS enabled and zero anon/authenticated policies |
| Resilience Fallback | `v1.<payload>.<sig>` | HMAC-SHA256 | Used automatically if `public.app_sessions` returns `PGRST205`/`42P01`, preserving identical 30m/7d/`user_id` checks |

---

## 3. OAuth PKCE Reliability Invariants (`bad_oauth_state` Prevention)

1. **Single starter route (`GET /api/auth/oauth`)**: OAuth never initiates from `supabaseBrowser().auth.signInWithOAuth()` in client JS. Navigating top-level to `/api/auth/oauth` guarantees the PKCE `*-code-verifier` cookie and `redirectTo` (`${origin}/auth/callback`) use the exact same validated host (`resolveRequestOrigin` in `lib/auth/oauth-origin.ts`).
2. **Query-free `redirectTo`**: `redirectTo` is always `${origin}/auth/callback` (no `?next=` query string), matching strict Supabase Redirect URL allowlists; `{ next, from, provider }` rides in the 10-minute `httpOnly` `jobiest_oauth_ctx` cookie.
3. **Middleware exclusion**: `middleware.ts` immediately returns `NextResponse.next()` for `/auth/callback` and `/api/auth/oauth`, preventing `supabase.auth.getUser()` from running before `exchangeCodeForSession(code)` or clobbering `Set-Cookie` headers.
4. **Non-clobbering cookie accumulation**: `app/auth/callback/route.ts` accumulates all `@supabase/ssr` `setAll` cookie writes in `pendingCookies` (`Map`) and writes them alongside `jobiest_app_session` onto the final `302` redirect response with `Cache-Control: no-store`.
5. **Idempotent profile + credit initialization**: `/auth/callback` runs `ensureProfile(user)` (`lib/auth/profile.ts`) and `ensurePeriodGrants(user.id)` (`lib/credits.ts`) before redirecting to `/verify-email`, `/complete-account`, `/mfa-verify`, or `/dashboard`.
