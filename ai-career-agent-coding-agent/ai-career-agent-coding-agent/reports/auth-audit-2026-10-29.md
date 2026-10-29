# Jobiest Auth Audit — 2026-10-29

**Scope:** Inspect existing repo before rebuild. Preserve Supabase Auth users, profiles, RLS, production data.

## Current Files (auth-relevant)

- **Pages:** `app/login/page.tsx`, `app/signup/page.tsx`, `app/verify-email/page.tsx`, `app/auth/callback/page.tsx` (client Suspense), `app/complete-account/page.tsx`, `app/mfa-verify/page.tsx`, `app/reset-password/page.tsx`
- **Initiation:** `components/site/GoogleButton.tsx`, `components/site/LinkedInButton.tsx` — both call `supabaseBrowser().auth.signInWithOAuth({ provider: 'google'|'linkedin_oidc', redirectTo: ${origin}/auth/callback })`
- **Clients:** `lib/supabase-browser.ts` (createBrowserClient anon), `lib/supabase.ts` (admin + anon helpers), `lib/auth.ts` (server getUser, bearer, MFA), `lib/session.ts` (app_sessions 30m idle/7d absolute, session-only cookie `jobiest_app_session`), `lib/auth-oauth.ts` (issue/confirm 6-digit code, google/linkedin gates)
- **Middleware:** `middleware.ts` — creates Supabase server client via `createServerClient` with `getAll/setAll`, does manual `exchangeCodeForSession` if `?code` on `/auth/callback` or `/`, handles app-session validation, social gates, redirects to `/verify-email` or `/complete-account` or `/login` + MFA gate. Matcher includes 10+ routes.
- **APIs:** `app/api/auth/signup/route.ts` (admin.createUser email_confirm:false → issue code), `app/api/auth/verify/route.ts`, `app/api/auth/google/verify/route.ts` (GET/POST), `app/api/auth/linkedin/verify/route.ts`, `app/api/auth/session/route.ts` (POST create app_session), `app/api/auth/signout/route.ts`, `app/api/auth/mfa/*`, `app/api/auth/reset-password/route.ts`, `app/auth/callback/page.tsx` does NOT have server route handler
- **DB tables implied:** `profiles` (user_id, email_verified_at, phone, password_set_at, full_name), `app_sessions` (token_hash, created_at, last_active_at, expires_at), `email_verification_codes` (via auth-oauth)

## Current Flow (as-code)

1. **Manual signup:** POST /api/auth/signup → admin.createUser → issue 6-digit code → 200 mustVerify=true → redirect /verify-email?email= → verify-email page fetches `GET /api/auth/google|linkedin/verify` *or* directly handles `?email=` param in passwordMode=true → POST /api/auth/verify action=confirm code → if VERIFIED set email_verified_at → create app_session → /dashboard
2. **Google OAuth:** GoogleButton signInWithOAuth redirectTo /auth/callback → middleware sees ?code on /auth/callback, tries exchangeCodeForSession (idempotent check) → client CallbackInner useEffect waits getSession() auto-exchange (detectSessionInUrl) → fetches GET /api/auth/google/verify to decide requiresVerification → if true push /verify-email else POST /api/auth/session → /dashboard
3. **LinkedIn OAuth:** Same as Google but provider linkedin_oidc, gate via /api/auth/linkedin/verify
4. **Login:** /login signInWithPassword → if email_not_confirmed → redirect /verify-email?email= ; else check MFA → POST /api/auth/session → /dashboard. OAuth login same as signup but existing verified user should skip verify gate (verified flag in profiles)
5. **Middleware gates:** PROTECTED = dashboard/onboarding/profile/settings/documents/applications/billing/generate/mfa-verify/complete-account. AUTH_PAGES = login/signup. Verifies Supabase user + app_session. Redirects unconfirmed password user (email_confirmed_at) to verify-email; social verified via profiles.email_verified_at; needsCompletion → /complete-account; MFA aal check; touchAppSession

## Bugs / Risks Found

**Root cause of `bad_oauth_state — OAuth state has expired`:**

- **Competing exchanges:** Middleware does `exchangeCodeForSession(code)` *and* browser client `detectSessionInUrl` auto-exchanges same code. First wins, second gets `flow_state_already_used` / `bad_oauth_state`. Current code tries to paper over with retries and sessionStorage flags, but race persists, especially on slow mobile / in-app browsers.
- **Middleware matcher:** Includes `/auth/callback` — means every callback hits middleware exchange *before* page load, consuming PKCE verifier cookie. If Supabase stored verifier as `sb-<ref>-auth-token-code-verifier` cookie with `SameSite=Lax`, cross-site redirect from Google → Jobiest is `Lax`-allowed for top-level GET, but if middleware re-creates `NextResponse.next({request})` without preserving `secure`/`sameSite` correctly, verifier may be dropped.
- **No server Route Handler:** Official Supabase Next.js docs require `app/auth/callback/route.ts` (Route Handler, not Page) that does `createServerClient` + `exchangeCodeForSession` + redirect. Using a Client Page with auto-exchange is legacy pattern (supabase-js v1) and breaks PKCE `code_verifier` stored as httpOnly cookie — client cannot read it.
- **Debounce/sessionStorage band-aid:** `lastClickRef 1500ms` + `jobiest_oauth_in_progress` flag suggests team saw duplicate clicks cause overwritten state — but Supabase PKCE stores verifier in cookie *per initiation*; rapid double-click creates second verifier overwriting first.
- **Redirect URL:** `redirectTo = ${origin}/auth/callback` — correct if Supabase Site URL + Allowlist includes `https://jobiest.com/auth/callback` and `https://modernjob.vercel.app/auth/callback`. If Site URL is still `modernjob.vercel.app` while user starts on `jobiest.com`, PKCE cookie Domain mismatch could expire state.
- **Multiple identities:** `isSocialProvider` checks `app_metadata.providers` but Supabase may not include provider until profile created; new OAuth user may appear as password provider initially → mis-route to wrong verify gate.
- **Account linking:** No check — if same email exists as password user, `signInWithOAuth` will auto-link per Supabase `identity linking` setting (could create duplicate or merge unexpectedly). Current code claims “don’t auto-link by email alone” but does not enforce — relies on Supabase default.
- **Profile creation:** `handle_new_user` DB trigger copies user_metadata.full_name/phone into profiles — if trigger fails, `profiles` missing → `socialGates` returns needsVerification=true forever → loop.

## Environment Checks Needed (manual, cannot invent)

- Supabase Dashboard → Auth → Providers: Google enabled? Client ID/Secret valid? LinkedIn OIDC enabled? Permissions `openid email profile`?
- Supabase → Auth → URL Configuration: Site URL = `https://jobiest.com` (not vercel.app), Redirect URLs include `https://jobiest.com/auth/callback`, `https://modernjob.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` for dev
- Google Cloud Console → OAuth 2.0 Client: Authorized redirect URIs include `https://<project>.supabase.co/auth/v1/callback` (Supabase handles, not Jobiest), Authorized JS origins include `https://jobiest.com`
- Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` must match project where providers configured; `SUPABASE_SERVICE_ROLE_KEY` present for admin API; `NEXT_PUBLIC_APP_URL=https://jobiest.com`

## Security Invariants (preserve)

- 30m idle / 7d absolute via `app_sessions` + `jobiest_app_session` session-only cookie (no maxAge) — currently implemented correctly via `validateAppSession` + `touchAppSession` throttled 60s. Must remain server-enforced, not client-decided.
- Do not store service_role in browser, do not expose via client, RLS intact.
- Email verification: custom 6-digit code validated server-side via `confirmEmailVerificationCode`, rate limited 12/h, cooldown 60s, hashed storage — keep if secure, else align with Supabase OTP.
- MFA via `mfa.getAuthenticatorAssuranceLevel()` → gate to `/mfa-verify` — keep.

## What Must Change (rebuild, not patch)

1. **Single authoritative callback:** Delete client Page exchange, create `app/auth/callback/route.ts` Route Handler that does server-side PKCE exchange, resolves account, creates profile idempotently, decides verification, establishes app_session, redirects. Middleware must NOT exchange code — only refresh session via `getUser()`.
2. **Unified routing decision:** One function `resolveAuthDestination(user)` → {new, unverified, needsCompletion, verified} based on Supabase `email_confirmed_at` + `profiles.email_verified_at` + `user.identities` — not `app_metadata.providers` alone.
3. **Profile provisioning idempotent:** `profiles` upsert by `user.id` with `ON CONFLICT DO NOTHING`, using `supabaseAdmin` + DB uniqueness on `user_id`.
4. **Session creation:** Only in callback Route Handler or login server action — not client fetch `/api/auth/session` that can be called unauthenticated.
5. **Clean initiation:** Google/LinkedIn buttons use Server Action that calls `supabase.auth.signInWithOAuth` via server client (httpOnly PKCE cookie), not browser client — eliminates XSS verifier theft and double-click race.
6. **No bypass:** New OAuth user never goes direct to /dashboard if `email_verified_at` null; unverified password user cannot access protected routes; duplicate prevention via `user_id` PK, not email.
7. **Remove obsolete:** `app/auth/callback/page.tsx` client logic, middleware code-exchange block, duplicate `flow_state_already_used` handlers, sessionStorage oauth flag, `?code` on `/` handling.

## Tests to Cover (25 cases per brief)

Flows A-F, G-H central routing, I rebuild, J state-expiration root, K verification, L linking, M sessions, N UI, O tests (list verbatim from prompt), P deployment, Q done.

## Next Step

Present architecture doc for approval, then implement smallest safe change: callback Route Handler + middleware cleanup + initiator Server Actions, keep existing users/data.
