# Deploy procedure — ModernJob

Credentials do **not** survive between agent sessions (`.git/config`, env vars
and netrc are excluded from workspace snapshots). Tokens must be re-supplied
each session; everything else needed is recorded here.

## Identifiers (non-secret)

| What | Value |
|---|---|
| GitHub repo | `RareBeacon/moderndayjob` (numeric repoId: `1343740800`) |
| Vercel project | `modernjob` — `prj_KUiFqgCmdOSKrkc4K1q1Ycgoh72f` (personal scope, no team) |
| Production URL | https://modernjob.vercel.app |
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

## Workers (Render) — still gated

`render.yaml` at the repo root defines web + agent + browser + scheduler
services. Deploying to Render is a **paid cloud resource** and stays blocked on
an explicit user go. Local equivalents: `npm run agent` / `npm run scheduler`
(health endpoints on `WORKER_PORT` 8081 / 8080).

## Held items

- Payments: FLW key not supplied.
- Employer verification: parked.
