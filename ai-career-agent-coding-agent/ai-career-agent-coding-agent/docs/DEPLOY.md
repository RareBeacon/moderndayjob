# Deploy procedure — Jobiest

Credentials do **not** survive between agent sessions (`.git/config`, env vars
and netrc are excluded from workspace snapshots). Tokens must be re-supplied
each session; everything else needed is recorded here.

## Identifiers (non-secret)

| What | Value |
|---|---|
| GitHub repo | `RareBeacon/moderndayjob` (numeric repoId: `1343740800`) |
| Vercel project | `modernjob` — `prj_KUiFqgCmdOSKrkc4K1q1Ycgoh72f` (personal scope, no team) |
| Production URL | https://jobiest.com (custom domain; legacy URL https://modernjob.vercel.app still serves) |
| Git repo root in workspace | `moderndayjob/ai-career-agent-coding-agent/ai-career-agent-coding-agent` |

## Steps

1. **Restore the remote** (the remote URL is lost with `.git/config` each session):
   ```
   git remote add origin https://x-access-token:$GH_TOKEN@github.com/RareBeacon/moderndayjob.git
   ```
2. **Gate first, then push** `main`. Deploy only what passed `tsc --noEmit` + `vitest run` + `npm run build`.
3. **Deploy** — the Vercel project is NOT GitHub-linked (push does not auto-deploy), so POST manually:
   ```
   POST https://api.vercel.com/v13/deployments
   { "name": "modernjob", "project": "modernjob", "target": "production",
     "gitSource": { "type": "github", "repo": "RareBeacon/moderndayjob",
                    "repoId": 1343740800, "ref": "main" } }
   ```
   (v13 requires the numeric `repoId`; `repo`+`ref` alone is rejected.)
4. **Verify `meta.githubCommitSha == local HEAD`** in the POST response. If stale, re-POST.
5. Poll the deployment until `READY` (~1 min), then smoke routes on the
   production alias — expect 200 for pages, 401 for auth-gated POST APIs
   (404 would mean the route is missing from the build).

## Workers — free architecture (Vercel Cron, $0)

**Decision (2026-09): no paid worker host.** The product's background work is
a *daily* pipeline, not a 5-second poll — so it runs on Vercel Cron, which is
free on the Hobby plan (2 jobs, once-per-day, GET, UTC).

- `vercel.json` schedules `GET /api/cron/daily-pipeline` daily at 06:30 UTC
  (07:30 Lagos — digest fresh before the workday).
- The route is gated by `CRON_SECRET`; Vercel sends `Authorization: Bearer
  $CRON_SECRET` automatically. Without the header it 401s.
- Pipeline order (idempotent, safe to re-run): enqueue daily discovery →
  refresh job pool if stale (>6h) → claim + drain tasks. Logic lives in
  `lib/agent/pipeline.ts` — the single source of truth.
- Function `maxDuration = 60` (Hobby limit); the full 6-board ingest measures
  ~4s, so ~15× headroom.
- The pool refresh runs even with zero active users — the free tools (Salary
  Insights, Skills Matcher) read the same `jobs` table.
- The daily cron traffic also keeps the free-tier Supabase project from
  hitting the 7-day inactivity pause (it was found PAUSED on 2026-09-02 and
  restored via the Management API).

`workers/agent` and `workers/scheduler` remain runnable locally
(`npm run agent` / `npm run scheduler`) using the same shared pipeline lib —
useful for dev, and a ready-made path if a paid always-on host is ever wanted.
`workers/browser` exports SSRF-safe helpers only; it has no run loop and is
not deployed anywhere.

Manual trigger (same thing the cron does):

```
curl -H "Authorization: Bearer $CRON_SECRET" https://jobiest.com/api/cron/daily-pipeline
```

## Held items

- Payments: FLW key not supplied.
- Employer verification: parked.

## Custom domain — jobiest.com (2026-09-02)

- Registered at Truehost (₦10,000 first year, ₦20,000/yr renewal).
- Added to the Vercel project: apex + www (www 301 → apex).
- Registrar nameservers should point to `ns1.vercel-dns.com` /
  `ns2.vercel-dns.com` (set in Truehost → Domains → jobiest.com →
  Nameservers → custom). Vercel then manages apex A / www CNAME / SSL
  automatically.
- Brand rebranded ModernJob → Jobiest across all user surfaces.
- `NEXT_PUBLIC_APP_URL` = `https://jobiest.com` (drives canonicals, sitemap,
  robots, billing redirect). `lib/site.ts` falls back to the vercel.app URL.
- NOTE: `.git/config` (and thus the remote) is wiped by sandbox restarts —
  re-add it per the steps above before pushing.
