# Phase 2A Deployment Report — 2026-10-26 12:27 UTC

## Live deployment
- Commit: `dcceadce80ff0bfd1bca1e24ccc63c6daf37bdeb` (includes edge fix)
- URL: https://jobiest.com / https://www.jobiest.com aliased to https://modernjob-6sxoz4gud-ogungboyeopeyemiphilip-gmailcoms-projects.vercel.app
- Health: `ok true degraded false` database ok ai_gateway ok email configured
- Build: Next 15.5.25 Middleware 86.1kB compiled successfully (edge crypto fixed)

## What is live
- `middleware.ts` now enforces 30m idle / 7d absolute via `lib/session.ts` app_sessions table, session-only cookies (no Max-Age), strip persistence from Supabase cookies
- `lib/auth.ts` `requireUser()` now validates app session for browser clients, exempts Bearer/mobile, touches throttled every 60s
- `app/api/auth/session` POST create / DELETE revoke (rate limit 20/m)
- `app/api/auth/signout` revokes app session + clears cookie before Supabase signOut
- `app/login`, `app/auth/callback`, `app/verify-email` create app session via POST before dashboard
- Login shows `?expired=1` banner: "Your session expired (30 min idle or 7 days max). Please sign in again."
- Bachs-style `app/verify-email` 6-box OTP remains live (fe5ea2a)

## What is NOT yet live (requires you)
**Supabase migration 044_app_sessions.sql is committed but NOT yet applied to the database.** Without it, `validateAppSession` will DB_ERROR → every protected page will redirect to /login?expired=1 (treated as no session).

**You must run this once:**
1. Open Supabase Dashboard → SQL Editor → New query
2. Copy-paste entire `supabase/migrations/044_app_sessions.sql` contents
3. Run → should create table `app_sessions` with indexes + RLS
4. Verify: `select * from app_sessions limit 1;` (empty is ok)

Until you run it, the middleware will fail closed (safe) — all protected pages require re-login but API data is never leaked (still 401).

## Manual action to fully enable
- Run migration SQL above
- Test: Login → dashboard should work → close browser (session cookie gone) → reopen → should require login (no persistent)
- Wait 30m idle → should redirect to login?expired=1
- Activity within 30m should renew idle but not 7d absolute

## Credentials used
- GitHub PAT `[REDACTED_GH_PAT]` and Vercel token `[REDACTED_VERCEL_TOKEN]` used for this deploy — revoke after verification if one-time use.

## Remaining Phase 2B-E
- Sensitive-action recent-auth gate not yet enforced (next)
- Automated tests for 10 verification checklist pending after migration applied
- Staging short-timeout tests pending (use 2m/5m test values)

