# Jobiest Operations Runbook

Who this is for: the developer on duty (currently a solo operation). Read it
once; then use it as the checklist for deploys, incidents and backups.

## 1. Stack and where things live

| Layer | What | Where |
| --- | --- | --- |
| Web app | Next.js 15, App Router, `app/` | GitHub `RareBeacon/moderndayjob` branch `main` |
| Hosting | Vercel (auto-deploy from `main`) | jobiest.com |
| Database | Supabase Postgres (project `cbxloutahmalorumaihc`) | RLS on all user tables |
| Auth | Supabase email/password, server-side sessions | `lib/auth.ts` |
| Payments | Flutterwave Standard (v3) | `packages/billing/flutterwave.ts` |
| Background | Browser worker, Docker on Render free plan | jobiest-browser-worker.onrender.com |

Environment variables the app requires: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ENCRYPTION_MASTER_KEY`, `NEXT_PUBLIC_APP_URL`. Optional (feature-gated):
`FLW_SECRET_KEY` + `FLW_SECRET_HASH` (billing), scraper/worker keys.

## 2. Deploy (normal path)

1. Gates must be green locally: `npm run typecheck && npm test && npm run build`.
2. Push to `main` (squash or clean commits; the changelog feeds release notes).
3. Vercel deploys automatically; watch the deployment until "Ready".
4. Smoke the live site (5 minutes):
   - `curl -s https://jobiest.com/api/health` returns ok.
   - Homepage loads; open DevTools console: no red errors.
   - Log in; dashboard renders; `/jobs` returns listings.
   - One mobile-width check (`devtools @375px`): no horizontal scroll.
5. If anything fails: do not debug on production - roll back (§4) first.

## 3. Database backup

- Supabase runs daily automatic backups on the paid tier; on the free tier
  **you must export manually**. Do this weekly and before any risky migration:

  ```bash
  # Supabase CLI (uses the project ref cbxloutahmalorumaihc)
  supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql
  ```

- Store backups outside the repo (never commit them; they contain user data).
- Test a restore at least once: pipe the dump into a fresh Supabase project
  and run `npm test` against it locally.

## 4. Rollback (the most important section)

- **App only (bad deploy):** Vercel dashboard -> Deployments -> last good one
  -> "Promote to Production". Takes ~30 seconds, no code changes needed.
- **Bad migration (rare):** migrations are forward-only by policy; if one
  must be reverted, write a counter-migration and deploy it through the same
  gates. Never edit `supabase/migrations/*` history.
- **Data incident (bad write):** stop the app (Vercel -> pause project),
  restore from the newest backup, restart. Log the incident (§6).

## 5. Monitoring (what exists today)

- `/api/health` - liveness (DB reachable).
- Client errors: unhandled errors hit `app/error.tsx`, which reports to
  `/api/client-error` -> `audit_logs` with action `CLIENT_ERROR`. Check with:
  `select created_at, meta from audit_logs where action='CLIENT_ERROR' order by created_at desc limit 50;`
- Admin audit trail: `audit_logs` records auth, billing and admin actions.
- No external APM yet (Sentry et al.) - the audit trail is the source of truth.
- Weekly check: failed logins, `BILLING_*` audit rows, `CLIENT_ERROR` rows,
  `payments` vs `subscriptions` consistency:

  ```sql
  select p.tx_ref, p.amount, s.plan_code, s.status
  from payments p left join subscriptions s on s.user_id = p.user_id
  order by p.created_at desc limit 20;
  ```

## 6. Incident response (short)

1. Acknowledge: write the incident in `docs/incidents.md` (create if absent).
2. Restore service first (rollback > hotfix). Diagnose after users are safe.
3. If user data may be exposed: change affected secrets immediately
   (Supabase service key, Flutterwave keys, `ENCRYPTION_MASTER_KEY` - note that
   rotating the master key invalidates stored AI-credential ciphertexts).
4. Post-mortem within 48h: timeline, cause, prevention, one follow-up issue.

## 7. Known gaps (honest list)

- **Browser worker: deployed** - `jobiest-browser-worker` on Render (free
  plan, Docker, Frankfurt, https://jobiest-browser-worker.onrender.com).
  Receives pre-built application payloads over HTTP (shared-secret auth,
  401 POLICY_RESTRICTED without it), no DB credentials. Deploys are
  triggered via the Render API at the current `main` commit. Free-plan
  caveat: it sleeps after 15 min idle; the first request pays a ~30-60s
  cold start (the web app's apply client has a timeout + failover list to
  tolerate this). Env wiring: `BROWSER_WORKER_URL` + `BROWSER_WORKER_SECRET`
  must be set to the same values in Vercel.
- **No staging environment** - Vercel preview deployments per PR serve this
  role; open the preview URL and run the smoke list from §2 step 4.
- **Flutterwave live keys not configured** - billing endpoints return
  `BILLING_NOT_CONFIGURED` (503) until `FLW_SECRET_KEY`/`FLW_SECRET_HASH`
  are set. The full charge path is unit-tested; the sandbox E2E needs
  Flutterwave test credentials.
- **E2E suite** - `npm run e2e` (Playwright) covers the smoke surface against
  production; authenticated cases need `E2E_EMAIL`/`E2E_PASSWORD`.

## 8. Mobile apps

`apps/mobile` holds the Capacitor shells (Android + iOS) that wrap
jobiest.com. Building requires Android Studio (free) or Xcode; publishing to
the stores requires Google Play ($25 once) / Apple Developer ($99/year).
See `apps/mobile/README.md`. The site is also an installable PWA
(manifest + service worker + offline page), which needs no store at all.

## 9. Secrets hygiene

- Never commit secrets; `sbp_*` tokens, `ghp_*` tokens and keys live in the
  operator's password manager only.
- Rotate the GitHub PAT when anyone leaves the project.
- The Supabase service-role key must only ever be used server-side
  (`supabaseAdmin`); grep the client bundle for it if in doubt.
