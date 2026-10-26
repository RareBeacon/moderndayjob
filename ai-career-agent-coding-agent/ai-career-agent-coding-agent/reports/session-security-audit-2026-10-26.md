# Jobiest Session Security Audit — Phase 1 Findings — 2026-10-26

**Scope:** Investigate reported behavior — user logged in yesterday, returned today, dashboard still shows without re-login — to determine if this is expected persistent-login behavior or a server-enforced expiration failure.

**Stack verified:** Next.js 15.5.25, @supabase/ssr 0.5.2, @supabase/supabase-js 2.58.0, Supabase Auth, deployed on Vercel, DB Supabase Free.

**Classification:** **Potential Improper Session Expiration (OWASP WSTG-Session Timeout) — NOT yet confirmed as vulnerability.** Current behavior is **expected Supabase persistent-session behavior** given configuration, not a cache-only bug. Severity cannot be set until product policy for idle/absolute lifetimes is decided and tested.

## 1. Authentication architecture (evidence)

**Provider:** Supabase Auth (GoTrue). No Auth.js, Firebase, or custom JWT issuer.

**Clients:**
- Browser: `lib/supabase-browser.ts` — `createBrowserClient` (anon key, httpOnly cookies managed by SSR)
- Server SSR: `lib/auth.ts` → `serverClient()` — `createServerClient` with `cookies.getAll()` and `setAll: () => undefined` (read path for Server Components)
- Middleware: `middleware.ts` — `createServerClient` with `getAll` + `setAll` that **refreshes** cookies via `response.cookies.set(name, value, options)` on every request (correct SSR pattern for Next.js 15)
- Admin: `lib/supabase.ts` — service-role client with `autoRefreshToken: false, persistSession: false` (correct — never persists)

**Next.js hook:** `middleware.ts` (correct for Next.js 15.5.25; `proxy.ts` is Next.js 16 only — not present, correct not to create)

**Matcher:** `['/dashboard/:path*', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/login', '/signup', '/verify-email', '/mfa-verify', '/complete-account']` — homepage `/` is **not matched** (fix 2026-09-24), prevents homepage→dashboard redirect on stale cookie (verified).

**Session validation (secure):**
- Middleware: `await supabase.auth.getUser()` — **validates JWT signature with Supabase Auth server on every protected request** (not `getSession()` local decode). Correct per Supabase docs (do not trust client storage alone).
- `lib/auth.ts` `getUser()` / `getAuthContext()` — same `getUser()` server call + Bearer fallback `supabaseAdmin.auth.getUser(token)` (validates signature). Fail-soft on throw → anonymous (2026-09-24 iOS fix) — correct fail-closed.
- `requireUser()` — throws `UNAUTHENTICATED` if no user, `MFA_REQUIRED`, `ACCOUNT_SUSPENDED/TERMINATED` — used by **every** protected API route inspected (jobs, documents, applications, portfolios, notifications, admin) — returns 401 on failure.

**Cookie security:** Supabase SSR sets `sb-*-auth-token` cookies as `HttpOnly, Secure, SameSite=Lax` by default (verified via `CookieOptions` passthrough in middleware). No manual cookie flags to override.

**Logout:** `POST /api/auth/signout/route.ts` — `client.auth.signOut()` + clearing cookies via `response.cookies.set(..., options)` with 303 redirect (correct invalidation of refresh token on server). Admin routes use `supabaseAdmin.auth.admin.signOut(userId, 'global')` for global logout (verified).

**RLS:** Migrations `022_security_baseline.sql`, `010_lockdown_private_tables.sql` enforce Row Level Security on profiles, documents, applications, storage — accessed via service-role with `user_id` filter matching `requireUser()` — user isolation verified in `api/documents/[id]/download/route.ts` (`eq('id', id).eq('user_id', user.id)`).

## 2. Session lifetime configuration (finding)

**Current server policy:**
- **Access token lifetime:** Supabase default **3600 seconds (1 hour)** — not customized in repo (no `auth.jwtExpiry` override)
- **Refresh token lifetime:** **No inactivity timeout, no absolute maximum** configured — Supabase dashboard → Authentication → Sessions shows defaults when not set: sessions last **indefinitely** via refresh token rotation (Supabase docs: "sessions last indefinitely by default unless terminating condition applies")
- **Supabase plan:** **Free** (founder confirmed 2026-10-25) — Inactivity timeout and Maximum session lifetime controls are **only available on Pro plans and above** (Supabase docs: "built-in inactivity and maximum-lifetime controls are available on Pro plans and above"). Therefore these cannot be set in dashboard without upgrading.

**Result:** Returning the next day with a valid refresh token **will** restore the session — **expected persistent-login behavior**, not a client-cache bug. Dashboard was not showing cached unauthenticated data; middleware had validated the session via `getUser()` and issued refreshed cookies.

**What is missing (if product wants timeouts):**
- No server-enforced **idle timeout** (e.g., 30 min inactivity → reject)
- No server-enforced **absolute lifetime** (e.g., 7 days max even if active)
- No **recent-auth gate** for sensitive actions (password change, etc.)
- Frontend has no "session expired" banner — but frontend timer alone would not be the security boundary anyway (OWASP requires server rejection)

## 3. Vulnerability assessment

**Is this a vulnerability today?**
- **No — if Jobiest intentionally supports persistent login** (common for career dashboards). Supabase persistent sessions are designed to survive browser restarts and next-day returns when the refresh token is valid and not revoked. The server **does** validate the session on every request (not just a local flag), so stolen local flag manipulation alone cannot access protected APIs.
- **Yes — if product policy requires expiration** and the server continues accepting the session beyond the intended idle or absolute lifetime. Since no such policy is enforced on the server (and cannot be set in Supabase Free dashboard), any policy would currently be unenforceable.

**Related failure modes checked:**
- Missing idle timeout: **Present** — no idle enforcement exists (by design on Free plan, not a code bug)
- Excessive lifetime: **Present** — refresh token has no absolute max (same root cause)
- Client-side auth without server enforcement: **NOT present** — middleware and `requireUser()` validate server-side; dashboard appearance matches server validity
- Reusable token after logout: **NOT present** — `signOut()` revokes server session and clears cookies; replay blocked

## 4. What to decide before fixing

Do not "add auto logout" blindly. Answer these product questions first:

1. Should Jobiest support **persistent login** (stay logged in across browser restarts) intentionally?
2. What **idle timeout** is acceptable for the career dashboard? (Proposed starting: 30 minutes for ordinary pages)
3. What **absolute maximum** should a session live even if active? (Proposed starting: 7 days)
4. Should **sensitive actions** (change password, security settings) require recent re-authentication?
5. Do you want to **upgrade Supabase to Pro ($25/mo)** to use native inactivity/absolute controls, or implement a **custom server-enforced check** (e.g., `last_active_at` column + middleware rejection) that works on Free plan?

Each choice has a different implementation path — dashboard timer alone is never the security boundary.

## 5. Recommended implementation paths (for approval, not yet executed)

**Option A — Upgrade to Supabase Pro and use native controls (recommended for correctness):**
- Set in Supabase Dashboard → Auth → Sessions: Inactivity timeout = 30 min, Maximum lifetime = 7 days
- Keep existing `middleware.ts` `getUser()` validation (already correct) — Supabase will reject expired refresh tokens server-side
- Add client session-expired UX: middleware 401 → `/login?expired=1` with message
- Add recent-auth gate for sensitive endpoints

**Option B — Stay on Supabase Free with custom enforcement:**
- Add `profiles.last_active_at` (or `sessions` table), update on each authenticated request in middleware
- Middleware: if `now - last_active_at > 30 min` → reject → clear cookies → redirect to login
- Absolute: if `now - created_at > 7 days` → reject
- Requires migration + middleware DB read per request (performance cost)

**Common hardening (either option):**
- Ensure cookies remain HttpOnly/Secure/SameSite=Lax (already correct)
- Add automated tests: idle timeout rejection, absolute timeout rejection, logout invalidation, direct API without auth (401), cross-user access denied (404/403)
- Document policy in Beta Handbook and Financial Handbook

## 6. Test plan (to run after policy decision)

| Test | Steps | Expected server response |
|------|-------|--------------------------|
| Idle timeout | Login, wait >30 min inactivity, call protected API | 401 UNAUTHENTICATED, no data |
| Absolute timeout | Keep active, exceed 7 days from creation | 401, even if active |
| Logout invalidation | Logout, retry protected API with old cookies/Bearer | 401 |
| Browser refresh after expiry | Refresh dashboard after expiry | Redirect to /login |
| Direct API without auth | Call /api/documents without cookies | 401 |
| Refresh-token revocation | After global signOut, try refresh | Rejected |
| Cross-user isolation | User A tries User B document ID | 404/403 |
| Cross-device global logout | Global signOut on device 1, try device 2 | 401 on device 2 |

Use test-only short lifetimes (e.g., 2 min idle, 5 min absolute) in staging.

## 7. Files inspected (evidence)

- `package.json` (Next 15.5.25, @supabase/ssr 0.5.2)
- `middleware.ts` (getUser validation, matcher, social/MFA gates — correct)
- `lib/auth.ts` (getUser, getAuthContext, requireUser, requireUserOrRedirect, bearer path — correct)
- `lib/supabase.ts`, `lib/supabase-browser.ts`, `lib/env.ts` (OLLAMA_BASE_URL empty → fallback)
- `app/api/auth/signout/route.ts` (signOut + cookie clear)
- `app/api/**` (all inspected routes use requireUser → 401 on failure)
- `supabase/migrations/010_*,022_*` (RLS)
- `vercel.json` cron, `/api/health` (database ok, ai_gateway ok)

## 8. Remaining risks

- Supabase Free cannot set inactivity/absolute controls natively — policy requires Pro upgrade or custom code (see options)
- `OLIAMA_BASE_URL` empty means AI fallback to Cloudflare/OpenRouter — not session-related but noted
- No frontend session-expired UX — users see abrupt redirect to login without explanation

---

**Next step:** Tell me your chosen idle timeout, absolute lifetime, and whether you want persistent login + Pro upgrade or Free custom enforcement. I will then implement Phase 2 (minimal code changes) and Phase 3 tests, and will not claim fixed until tests pass.
