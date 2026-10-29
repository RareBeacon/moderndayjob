# Auth Rebuild — Architecture Proposal (Supabase as Source of Truth)

**Principle:** Supabase Auth = identity + email_confirmed_at; Jobiest = profile completion + app_sessions (30m/7d session-only) + routing. No duplicate session stores.

## 1. New Structure

```
/lib/supabase/
  server.ts         // createServerClient for Route Handlers + Server Actions + Middleware
  client.ts         // createBrowserClient for public pages only (no OAuth initiation)
  middleware.ts     // helper: updateSession(request) → refresh Supabase cookies via getUser()
/lib/auth/
  session.ts        // reuse existing createAppSession/validateAppSession/touchAppSession (server only)
  routing.ts        // NEW: resolveAuthDestination(supabase, user) → Destination
  profile.ts        // NEW: ensureProfile(user) idempotent upsert
  oauth.ts          // NEW: startOAuth(provider) server action, isSafeRedirect(next)
  verify.ts         // keep issue/confirm code, wrap with rate limit
/app/auth/callback/route.ts  // NEW single Route Handler — all OAuth lands here
/app/(auth)/login/page.tsx   // keep UI, replace submit with server action for password, OAuth via startOAuth
/app/(auth)/signup/page.tsx  // same
/app/verify-email/...        // keep UI, server verify
/middleware.ts     // slim: call updateSession(), then app_session + routing gates ONLY (no exchange)
/components/site/GoogleButton.tsx + LinkedInButton.tsx → Server Action form buttons
```

## 2. Callback Route Handler (authoritative)

```ts
// app/auth/callback/route.ts
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null

  const supabase = createServerClient(/* cookies from req */)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return redirect(`${origin}/login?error=${encode(errorCode(error))}`)
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect(`${origin}/login?error=oauth_failed`)

  await ensureProfile(user) // idempotent
  const dest = await resolveAuthDestination(supabase, user) // checks email_confirmed_at || profiles.email_verified_at
  if (dest.requiresVerification) {
    // Google already verified? Supabase email_confirmed_at true → mark profiles verified, skip second code
    if (user.email_confirmed_at && dest.providerVerified) await markVerified(user.id)
    else await issueCodeIfNeeded(user)
    return redirect(`${origin}/verify-email`) // OAuth user, session exists, pre-dashboard gate
  }
  if (dest.needsCompletion) return redirect(`${origin}/complete-account`)
  await createAppSessionForUser(user.id, req) // server-side, httpOnly session-only
  return redirect(`${origin}${safeNext || '/dashboard'}`)
}
```

Key: PKCE `code_verifier` stays httpOnly cookie set by server `signInWithOAuth` → exchanged by server, never exposed to client. Solves `bad_oauth_state`.

## 3. Initiation (no more browser OAuth)

Server Action in `lib/auth/oauth.ts`:

```ts
'use server'
export async function startOAuth(provider: 'google'|'linkedin_oidc', next?: string) {
  const supabase = await createServerClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback${next?`?next=${encodeURIComponent(next)}`:''}`
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, queryParams: { prompt: 'select_account' } } })
  if (error) throw error
  redirect(data.url)
}
```

Buttons become `<form action={startOAuth}>` — no debounce, no sessionStorage, no double state. Two rapid clicks = two redirects but second verifier overwrites first safely because only last callback succeeds; first code then fails with `bad_code` → login retry (not stale state).

## 4. Routing Rule (single)

```
resolveAuthDestination(user):
  if user.email_confirmed_at == null && !isSocial(user): requiresVerification=true
  else if isSocial(user):
     profile = profiles(user.id)
     if !profile.email_verified_at:
        if user.email_confirmed_at && provider email verified (google) → mark verified, requiresVerification=false
        else if linkedin && email missing → ask user to supply email → verify
        else requiresVerification=true
  else requiresVerification=false
  needsCompletion = requiresVerification==false && (!profile.phone || !profile.password_set_at) && isSocial
```

Never trust email without verification. Never create profile by email alone. Link identities only via `identities` table when user authenticated, not by matching email.

## 5. Middleware (slim)

Per Supabase docs, middleware should only `getUser()` to refresh cookies:

```ts
export async function middleware(req) {
  const { supabase, response } = await updateSession(req) // getAll/setAll
  const { data: { user } } = await supabase.auth.getUser()
  // then app_session + protected routing (existing logic, minus code exchange)
  // verify-email is NOT protected (allows pre-session); /complete-account allowed
  // login/signup redirect only if user && appSessionValid
}
```

Matcher: exclude `/auth/callback` from special handling; keep protected list but remove code param logic.

## 6. Email Verification (keep 6-digit, make consistent)

Keep `issueEmailVerificationCode` + `confirmEmailVerificationCode` (already rate-limited, hashed, 60s cooldown, audit logged) — it is secure and Supabase Auth email OTP is separate channel. Ensure:
- Manual signup: admin.createUser email_confirm:false → code
- OAuth new user: if Supabase says email_confirmed_at true and provider is trustworthy (google), mark `profiles.email_verified_at = now()` directly (no second code) — avoids annoying double verification
- LinkedIn without email: show “Enter email to verify” form → update auth email → send code → confirm
- All confirm actions update both `auth.users.email_confirmed_at` (via admin) + `profiles.email_verified_at`

## 7. Account Linking & Duplicates

- Do not auto-link by email. Supabase setting: `external email linking` disabled (verify in dashboard).
- `profiles.user_id` unique FK to auth.users.id — prevents duplicate profile on concurrent callbacks (ON CONFLICT DO NOTHING).
- If OAuth email matches existing password user but `identities` provider differs, do not merge — show “Account exists with this email. Sign in with password, then link LinkedIn in Settings.” (secure recovery, not silent duplicate)
- Provider check via `user.identities[].provider` not `app_metadata.providers`.

## 8. Session Security (preserve 30m/7d/session-only)

Keep `lib/session.ts` exactly — `createAppSession` on login/callback only on server, `validateAppSession` in middleware, `touchAppSession` throttled. Cookie `jobiest_app_session` httpOnly, secure, Lax, no maxAge (session-only). Verify idle actually enforced (already in validate). Add absolute check defense in depth (already).

## 9. Files Removed/Replaced

- **Deleted:** `app/auth/callback/page.tsx` client auto-exchange page
- **Replaced:** `middleware.ts` code-exchange block (≈50 lines) → `updateSession` helper
- **Replaced:** `GoogleButton.tsx` + `LinkedInButton.tsx` client signInWithOAuth → server action forms
- **Kept:** `lib/session.ts`, `lib/auth.ts`, `lib/auth-oauth.ts` core, signup/verify APIs (cleanup, not delete), profiles RLS, app_sessions table, all user data
- **Added:** `app/auth/callback/route.ts`, `lib/auth/routing.ts`, `lib/auth/profile.ts`, `lib/supabase/server.ts`

## 10. Tests (25) & Build Gates

Unit: routing matrix (new/unverified/needsCompletion/verified), profile idempotency, PKCE exchange success/failure, rate limits
Integration: OAuth callback 200 → session + redirect, verify code valid/expired, resend cooldown, duplicate profile, MFA gate
E2E: Supabase Auth Emulator or staging project with real Google test account (no prod creds in logs)
Build: `tsc --noEmit`, `vitest run`, `next build` must pass before deploy. All 9 `homepage-autopilot` old failures remain excluded (intentional redesign).

## 11. Deployment Checklist (manual actions)

1. Verify Supabase Site URL = https://jobiest.com, Additional Redirect URLs include callback, Google redirect URI = https://<ref>.supabase.co/auth/v1/callback
2. Deploy smallest safe change: callback route + middleware cleanup (can rollback by restoring page.tsx)
3. Poll /api/health, test Flows A-F in incognito with real Gmail + LinkedIn test, check app_sessions row created, idle timeout 30m via waiting, browser restart clears cookie
