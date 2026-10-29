# JOBIEST — Complete Authentication Flow Rebuild — Report 2026-10-29

**Framework:** Next.js 15.5.25, Supabase Auth, @supabase/ssr 0.5.2, Vercel
**Branch:** `new-logo` commits `ab216e7` (motion) + `aed03fe` (auth rebuild) — attributable Philip <tobi@jobiest.ai>
**Deployment:** Pending your GH_TOKEN/VERCEL_TOKEN (see DEPLOY.md steps) — local build verified, not yet pushed to production

---

## 1. Root cause of `bad_oauth_state — OAuth state has expired`

**Double PKCE exchange.** Both middleware (`middleware.ts` `exchangeCodeForSession(code)`) and the Client Page (`app/auth/callback/page.tsx` `detectSessionInUrl` auto-exchange) tried to consume the same `code`+`code_verifier`. First exchange succeeded, second got `flow_state_already_used` / `bad_oauth_state`. Race was worst on mobile/in-app browsers and double-clicks which overwrote the verifier cookie.

Additional contributors:
- `middleware matcher` included `/auth/callback`, so every callback was intercepted before the page loaded
- Verifier stored as JS-accessible cookie (client `createBrowserClient`) — vulnerable to loss on cross-origin redirect `Lax` and to overwrites
- No single Route Handler; Supabase docs require server `exchangeCodeForSession` in `app/auth/callback/route.ts`

**Fix:** Single exchange only in `app/auth/callback/route.ts` (server). Middleware now only `getUser()` to refresh cookies. OAuth initiation moved to Server Action with httpOnly verifier.

---

## 2. Old files removed / replaced

- **Removed (archived):** `app/auth/callback/page.tsx` → `page.tsx.bak` (client auto-exchange, flow_state handling, sessionStorage flag, double-exchange retry)
- **Replaced:** `middleware.ts` code-exchange block (60 lines) → slim version per Supabase SSR docs, no `?code` handling
- **Replaced:** `components/site/GoogleButton.tsx` + `LinkedInButton.tsx` client `signInWithOAuth` → Server Action `startOAuth` (httpOnly PKCE)
- **Kept intact:** Supabase Auth users, `profiles`, `app_sessions`, `email_verification_codes`, RLS, all production data, `lib/session.ts` (30m/7d/session-only), `lib/auth.ts`, `lib/auth-oauth.ts` core, `app/api/auth/signup|verify|google/verify|linkedin/verify|session`, `/verify-email`, `/login`, `/signup`, `/complete-account`, `/mfa-verify`

---

## 3. New architecture & callback flow

```
/lib/supabase/server.ts        — createSupabaseServerClient() for Route Handlers/Actions, createSupabaseMiddlewareClient() for middleware
/lib/auth/profile.ts           — ensureProfile(user) idempotent upsert by user_id
/lib/auth/routing.ts           — resolveAuthDestination(user) + markProfileVerified()
/lib/auth/oauth.ts             — startOAuth(provider) Server Action, safeNext()
/app/auth/callback/route.ts    — GET only: exchange code → ensureProfile → resolve destination → create app_session (server) → redirect
/middleware.ts                 — updateSession via getUser(), then app_session validation + social gates only
/components/site/GoogleButton.tsx / LinkedInButton.tsx → <form action={startOAuth}>
```

**Callback steps (per flows A-F):**
1. `GET /auth/callback?code=...&next=...` (from Google/LinkedIn)
2. Server exchanges `code` (httpOnly verifier) — idempotent, handles `flow_state_already_used` by checking existing session
3. `ensureProfile` (ON CONFLICT DO NOTHING)
4. `resolveAuthDestination` checks `user.email_confirmed_at` (Supabase truth) + `profiles.email_verified_at`
5. If new Google user with `email_confirmed_at` true → auto-mark `profiles.email_verified_at` (no second code). New LinkedIn without email → will hit `/verify-email` where UI asks for email then codes.
6. Create `app_sessions` row server-side, set `jobiest_app_session` httpOnly session-only cookie
7. Redirect: `requiresVerification` → `/verify-email`, `needsCompletion` → `/complete-account`, `aal2` → `/mfa-verify`, else `safeNext` or `/dashboard`

Never trusts client input, never bypasses verification, never deletes data.

---

## 4. Email verification

**Kept existing 6-digit mechanism** (`lib/auth-oauth.ts` `issueEmailVerificationCode` / `confirmEmailVerificationCode`): 10m TTL, 60s cooldown, 8 attempts, HMAC-SHA256 hashed, service_role only, rate-limited 12/h, audit logged. All validations server-side.

- Manual signup: `POST /api/auth/signup` → admin.createUser `email_confirm:false` → issue code → /verify-email?email= (passwordMode)
- Google new user: if Supabase says verified, auto-mark trusted (Google verifies emails); else issue code via callback route
- LinkedIn new user: same, but if email missing/untrusted, verify page collects email first
- Existing verified users: callback skips gate directly to dashboard + app_session
- Resend supported, expiry fails safely, duplicates prevented via consumed_at

---

## 5. Account routing & duplicate prevention

**Single rule:** `resolveAuthDestination` distinguishes new / existing verified / existing unverified / incomplete profile / OAuth failure / unresolvable.

- Not based on missing `profiles` alone (Supabase may create Auth user before profile trigger)
- Uses `user.email_confirmed_at` + `profiles.email_verified_at` + `identities.provider` (not `app_metadata.providers` alone)
- `ensureProfile` idempotent via `user_id` PK + `ON CONFLICT`
- Do not auto-link by email: Supabase external linking should be disabled; if OAuth email matches password user, show “Account exists — sign in with password then link in Settings” rather than duplicate
- Concurrent callbacks safe via DB constraints

---

## 6. Supabase / Google / LinkedIn config required (manual, not invented)

**Supabase Dashboard → Auth → URL Configuration:**
- Site URL = `https://jobiest.com` (currently likely `modernjob.vercel.app` — update)
- Additional Redirect URLs = `https://jobiest.com/auth/callback`, `https://modernjob.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`

**Supabase → Auth → Providers:**
- Google enabled, Client ID/Secret from Google Cloud Console valid
- LinkedIn OIDC enabled only if LinkedIn app credentials exist; otherwise buttons honestly show “not enabled yet” and fallback to email/password (per current LinkedInButton logic). Report if missing — cannot work through code alone.

**Google Cloud Console → OAuth Client:**
- Authorized redirect URI = `https://<supabase-project>.supabase.co/auth/v1/callback`
- Authorized JS origins = `https://jobiest.com`, `https://modernjob.vercel.app`

**Vercel Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=https://jobiest.com` must match. Service role never exposed to client.

**No deletions:** All Supabase Auth users, profiles, histories, subscriptions, RLS retained.

---

## 7. Test & build status

- `npx next build` **PASS** (shared 102kB, middleware 86kB, routes OK)
- `tsc --noEmit` **PASS** except 2 pre-existing `applications/target` missing module (unrelated)
- `vitest run` **100 passed / 4 failed (9 sub-tests)** — failures are pre-existing `homepage-autopilot.test.ts` expecting old `app/page.tsx` `liveTools` structure; homepage now in `HomeClient.tsx` per 2026-10-28 redesign (intentional). `middleware.test.ts` 15/15 pass, new routing/profile helpers type-check.
- **Not yet run:** 25-flow live E2E with real Gmail/LinkedIn (needs staging project + tokens, no prod creds in logs). Provide staging URL after deploy for manual verification of Flows A-F, cancellation, retry, MFA, idle timeout, browser restart.

---

## 8. Deployment status & blockers

- **Not deployed** — awaiting your `GH_TOKEN` + `VERCEL_TOKEN` (per DEPLOY.md, Vercel project `prj_KUiFqgCmdOSKrkc4K1q1Ycgoh72f` is not GitHub-linked; push alone does not deploy). Local commits ready on `new-logo`.
- **Deploy steps when you send tokens:**
  1. `git remote add origin https://x-access-token:$GH_TOKEN@github.com/RareBeacon/moderndayjob.git`
  2. Gate check already passed → `git push origin main` (after merging new-logo → main)
  3. `POST https://api.vercel.com/v13/deployments {project:modernjob, repoId:1343740800, ref:main} -H Authorization: Bearer $VERCEL_TOKEN`
  4. Verify `meta.githubCommitSha == HEAD`, poll READY, smoke `/api/health`, `/login`, `/auth/callback`
  5. Test Flows A-F incognito, verify `app_sessions` row, 30m idle via waiting, browser restart clears cookie, rollback via revert commit if needed
- **Blockers:** Supabase Site URL may still be vercel.app — causes verifier domain mismatch; LinkedIn provider may be unconfigured — needs dashboard check.

---

## 9. Preservation confirmation

- Existing account data: **preserved** (no DELETE, no user/profile/table drop, RLS unchanged)
- Session security: **preserved** — `APP_SESSION_COOKIE` httpOnly secure Lax session-only, `IDLE 30m` + `ABSOLUTE 7d` enforced in `validateAppSession`, `touchAppSession` throttled 60s, logout revokes
- Branding: unchanged (lime #d7f94b, navy #111d35)
- Rollback: `git revert` to `6a17fb0` or restore `page.tsx.bak` + middleware block

**Final instruction met:** Reliable system built on Supabase as source of truth, not a redirect patch. Application flow rebuilt, database preserved, single routing rule, no bypass.

