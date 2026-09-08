# Go-live checklist · Jobiest

Step-by-step instructions for the four remaining production blockers. Each
section lists: **what the code actually reads**, **where to get the value**,
**how to set it**, and **how to verify**. Values here are drawn directly from
the source (`lib/env.ts`, `packages/billing/flutterwave.ts`,
`app/api/billing/**`, `workers/**`, `lib/apply/**`), so they match the app
exactly — not generic Flutterwave/Supabase docs.

---

## 0. Environment variable locations (summary)

| Variable | Used by | Required now? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web app (browser + server) | ✅ already set in Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web app (browser) | ✅ already set in Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | server + workers | ❌ **placeholder → replace** |
| `FLW_SECRET_KEY` | billing create + webhook verify | ❌ **add** |
| `FLW_SECRET_HASH` | webhook signature | ❌ **add** |
| `FLW_CLIENT_ID` / `FLW_CLIENT_SECRET` | *(declared in lib/env.ts, read by nothing)* | skip — unused |
| `ENCRYPTION_MASTER_KEY` | credential encryption (AES-256-GCM) | ❌ **rotate** (currently dev fallback) |
| `NEXT_PUBLIC_APP_URL` | Flutterwave redirect URL | ✅ set (`https://jobiest.com`) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting | ✅ already live |
| `CRON_SECRET` | daily pipeline | ✅ already live |
| `AUTOMATION_SUBMIT_ENABLED` | automation kill switch | keep **unset** until final approval |
| `BROWSER_WORKER_URL` | where the browser worker lives | only at automation go-live |

**Rule that bites everyone once:** Vercel env vars only apply to *new*
deployments. After adding/editing any variable, trigger a redeploy (push any
commit, or "Redeploy" in the Vercel dashboard) — otherwise the change is
silently ignored.

---

## 1. Flutterwave live keys

### What the code reads
- `FLW_SECRET_KEY` — Bearer auth for
  `POST https://api.flutterwave.com/v3/payments` (create) and
  `GET https://api.flutterwave.com/v3/transactions/{id}/verify` (webhook).
- `FLW_SECRET_HASH` — compared (timing-safe) against the `verif-hash` header
  Flutterwave sends on every webhook.

### ⚠️ V3 vs V4 (read this first)
The app is built on Flutterwave **V3**. The dashboard now surfaces **V4** keys
(Client ID / Client Secret / Encryption key) by default — **those will NOT
work** with this code. Use the **"V3 Live API keys"** section of
Settings → API keys:

- **V3 Secret key** (`FLWSECK-…`, live) → `FLW_SECRET_KEY`. Shown/downloadable
  only once; generate via "Generate Secret Key" (7-digit email code) and save
  it immediately.
- **V3 webhook secret hash** → `FLW_SECRET_HASH` (Settings → Webhooks → V3).
- **Not needed:** V3 Public key (`FLWPUBK-…`, no client-side SDK), V3
  Encryption key (direct card charge only), and the V4 Client ID/Secret.

### What you do **not** need (important)
- **"Live plan IDs" are not required.** The app uses Flutterwave **Standard
  payments** (amount-based). Plan prices live in your own DB
  (`subscription_plans`: FREE ₦0 / BASIC ₦5000 / PREMIUM ₦10000). The webhook
  maps `amount → plan` with `planForAmount`. The `subscription_plans.
  flutterwave_plan_id` column exists but is unused.
- `FLW_CLIENT_ID` / `FLW_CLIENT_SECRET` are declared but read by **no code**.
  You can leave them blank.

### Step-by-step
1. **Activate a live account.** dashboard.flutterwave.com → sign in → complete
   business KYC (business name/registration, director BVN, settlement bank
   account). Live mode stays locked until KYC is approved.
2. **Switch to Live Mode** (top-right toggle, Test ↔ Live).
3. **Copy the secret key.** Settings → API Keys → **Secret Key**
   (`sk_live_…`). (The **Public key** `pk_live_…` is not used — no client-side
   SDK in the app.)
4. **Create a webhook secret hash.**
   ```bash
   openssl rand -hex 32
   ```
   Settings → Webhooks → paste it as the **Secret Hash**. This is `FLW_SECRET_HASH`.
5. **Register the webhook URL.** Settings → Webhooks → add
   `https://jobiest.com/api/billing/flutterwave/webhook` and enable the
   `charge.completed` event (other events are ignored by the route anyway).
6. **Set env vars in Vercel** (Production + Preview as needed):
   ```
   FLW_SECRET_KEY=sk_live_...
   FLW_SECRET_HASH=<your-hex-hash>
   NEXT_PUBLIC_APP_URL=https://jobiest.com
   ```
7. **Redeploy**, then verify:
   ```bash
   # Unauthenticated still 500s (requireUser convention) — but NOT 503:
   curl -s -o /dev/null -w "%{http_code}\n" \
     -X POST https://jobiest.com/api/billing/flutterwave/create \
     -H 'content-type: application/json' -d '{"plan":"BASIC"}'
   # expect 500 (configured), NOT 503 (BILLING_NOT_CONFIGURED)
   ```

### Test the full loop in Test Mode first (recommended)
- Use `sk_test_…` keys + test hash, and Flutterwave's test card:
  `5531 8866 5214 2950`, CVV `564`, expiry `09/32`, PIN `3310`, OTP `12345`.
- Confirm: create → pay → webhook → `apply_verified_payment` RPC → subscription
  row → `/billing` shows the plan. Only then repeat in Live Mode with a real
  card.
- The webhook only works if Flutterwave can *reach* your URL, i.e. the endpoint
  must be live and the hash must match exactly.

### ✅ Status: LIVE CONFIRMED (2026-09-08)
- Live V3 keys were added to Vercel and a production smoke test initialized a
  real hosted checkout: `POST /api/billing/flutterwave/create` returned **200**
  with a `checkout.flutterwave.com/v3/hosted/pay/flwlnk-…` link. The key and
  payload are correct.
- **Gotcha hit during testing:** the smoke account used a `@…jobiest.test`
  email; Flutterwave rejects it with
  `customer.email: Customer email must be a valid email` (`.test` is a
  reserved TLD). Real user emails (gmail.com etc.) pass. If you ever want a
  clearer message, the create route could pre-validate `user.email` and return
  a 422 before calling Flutterwave — not required.
- An **unpaid live transaction** may now show in the Flutterwave dashboard
  (created by the smoke test, never paid). Harmless; it can be ignored or
  used to complete the first real ₦5000 test.
- **Still unverified:** the webhook leg (Flutterwave → webhook →
  `apply_verified_payment` → subscription grant). Verify by (a) completing a
  real payment, or (b) switching to Test Mode keys + test card, then checking
  `/billing` reflects the plan.
- `FLW_SECRET_KEY` / `FLW_SECRET_HASH` are read; `FLW_CLIENT_ID` /
  `FLW_CLIENT_SECRET` remain unused (V3 Standard needs neither).

---

## 2. Supabase: service-role key, migrations/RLS, and the throwaway account

Project: `https://otcpzmuqnvlfgurtbbut.supabase.co` (ref `otcpzmuqnvlfgurtbbut`).

### 2a. Service-role key (needed for the app to write data server-side)
1. dashboard.supabase.com → your project → **Settings → API**.
2. Copy the `service_role` secret (JWT starting `eyJ…`).
3. Set in Vercel: `SUPABASE_SERVICE_ROLE_KEY=<service-role JWT>`. Also put it in
   `.env.local` for local dev.
4. **Never** put it in `NEXT_PUBLIC_*` or any browser bundle — it's the
   key that bypasses RLS.

### 2b. Apply migrations + verify RLS (needs DDL access you don't have yet)
Migrations are in `supabase/migrations/001_initial.sql … 009_*.sql`.

**Option A — Supabase CLI (recommended):**
```bash
npm i -g supabase        # or: brew install supabase/tap/supabase
supabase login           # browser flow, OR:
# supabase login --token sbp_<personal-access-token>
supabase link --project-ref otcpzmuqnvlfgurtbbut
supabase db push         # applies all pending migrations in order
supabase migration list  # confirm all "applied"
```

**Option B — Personal Access Token (Management API):**
1. dashboard.supabase.com → **Account → Access Tokens → Generate** → `sbp_…`.
2. Use it with the CLI above, or call the Management API for DDL directly.

**Option C — Dashboard SQL Editor (no CLI):**
Open the project → **SQL Editor** → run each file in
`supabase/migrations/` in numeric order, one at a time.

**Verify RLS is actually enforced** (do not skip):
```sql
select tablename, policyname, roles, cmd, qual
from pg_policies where schemaname = 'public' order by tablename;

-- Spot-check as the anon role (should return ZERO rows if RLS is right):
-- (run in a second query editor tab with role anon, or:
--  create a throwaway API call using the anon key and confirm no data leaks)
```
Also confirm the security-critical functions exist (the webhook and quota
metering call them):
```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('apply_verified_payment','consume_ai_credit',
                  'reserve_application_slot','claim_agent_tasks',
                  'handle_new_user');
```

### 2c. Delete the throwaway smoke-test accounts
These accounts were created in production during rate-limit and Flutterwave
smoke tests. They own no real data.

```sql
-- find them all:
select id, email, created_at from auth.users
where email ilike '%jobiest.test%' or email ilike 'flwsmoke.%';
```

Known list:
- `upstash-smoke-1788865083692@jobiest.test`
- several `flw-smoke-…@jobiest.test`
- one `flwsmoke.…@gmail.com`

**Option A — SQL Editor (simplest):**
```sql
-- delete; public rows cascade (FKs are on delete cascade):
delete from auth.users where email ilike '%jobiest.test%' or email ilike 'flwsmoke.%';
```

**Option B — Auth Admin API:**
```bash
curl -X DELETE "https://otcpzmuqnvlfgurtbbut.supabase.co/auth/v1/admin/users/<USER_ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

## 3. Rotate `ENCRYPTION_MASTER_KEY`

### Why it matters now
`lib/env.ts` requires ≥32 chars but **falls back to the string
`development-only-key-must-be-replaced`** when unset. That fallback is in the
source, so anything encrypted "at rest" in production today is encrypted with
a *publicly known* key. `tests/crypto.test.ts` pins the crypto contract; the
rotation is the fix.

### Steps
1. Generate a key:
   ```bash
   openssl rand -hex 32      # 64 hex chars — recommended
   # or: openssl rand -base64 48
   ```
2. Set `ENCRYPTION_MASTER_KEY=<value>` in Vercel (Production) and `.env.local`.
3. Redeploy.
4. Verify: no 500s on the admin credential endpoints, and
   `npm test` still green (crypto round-trip test covers the new key).

### ⚠️ The one rule about rotation
The key derives AES-256-GCM, so **changing the key makes all previously
encrypted ciphertexts permanently unreadable**. Rotate now while the only data
belongs to the throwaway account you're deleting in §2c — it's free and safe.
If real users ever store provider keys (`ai_credentials.ciphertext`), you must
run a re-encryption migration (decrypt with old key → encrypt with new key)
*before* rotating. Do not rotate blindly once live users exist.

---

## 4. Autonomous submission (deliberately OFF — go-live only after approval)

### How the pieces fit (from the source)
- The web app **never runs a browser**. `lib/apply/client.ts::submitViaBrowser`
  POSTs `{ jobUrl, allowedDomains, candidate }` to
  `${BROWSER_WORKER_URL}/submit`.
- `workers/browser/index.ts` is the isolated HTTP service: Playwright +
  Chromium, a **fresh context per request** (no shared cookies), SSRF re-check
  on **every navigation**, domain allowlist. Listens on `WORKER_PORT`
  (default 8082). Exposes `/healthz` and `POST /submit`.
- The **kill switch** is `AUTOMATION_SUBMIT_ENABLED === 'true'` (the exact
  lowercase string — `'1'`, `'TRUE'`, or `'true '` all keep it OFF, enforced
  by `tests/automation-killswitch.test.ts`).
- Today the daily Vercel Cron (`/api/cron/daily-pipeline`) *can* drain
  APPLICATION tasks and call the browser worker, but its `maxDuration = 60`
  caps a run — fine for discovery, too tight for slow real submissions. For
  responsive go-live you want the agent worker running continuously (below).

### Step-by-step
1. **Deploy the browser worker on Render** (it can't run on Vercel):
   - New **Background Worker** service, repo `RareBeacon/moderndayjob`.
   - Build command:
     ```bash
     npm ci && npx playwright install --with-deps chromium
     ```
   - Start command:
     ```bash
     npm run browser        # tsx workers/browser/index.ts
     ```
   - Environment:
     ```
     NEXT_PUBLIC_SUPABASE_URL=https://otcpzmuqnvlfgurtbbut.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
     SUPABASE_SERVICE_ROLE_KEY=<service-role JWT>
     ENCRYPTION_MASTER_KEY=<the rotated key>
     WORKER_PORT=8082
     ```
     ⚠️ Two small gaps to close before trusting this in production (I can patch
     both if you want):
     - `workers/browser/index.ts` reads `WORKER_PORT`, not Render's injected
       `PORT` — either set `WORKER_PORT` manually or let the code read
       `PORT ?? WORKER_PORT`.
     - `POST /submit` has **no auth** — anything that can reach the URL can
       ask it to browse. Add a shared `BROWSER_WORKER_SECRET` header check
       (and have `submitViaBrowser` send it).
2. **Point Vercel at it:** `BROWSER_WORKER_URL=https://<your-service>.onrender.com`.
3. **Staging tests (do all of these before flipping anything):**
   ```bash
   # health:
   curl https://<service>.onrender.com/healthz
   # SSRF guard (must be blocked — the key safety property):
   curl -X POST https://<service>.onrender.com/submit \
     -H 'content-type: application/json' \
     -d '{"jobUrl":"http://169.254.169.254/latest/meta-data","allowedDomains":["greenhouse.io"],"candidate":{}}'
   # expect a POLICY_RESTRICTED / SSRF_BLOCKED response, never a fetch.
   ```
   Then a controlled real submission against a known Greenhouse/Lever posting
   from a test account, and confirm the application lands in `SUBMITTED` (or a
   clean STOP with a recorded reason, e.g. CAPTCHA) — never a hang or a
   partial submit.
4. **Flip the kill switch** — only after you've approved go-live:
   - Vercel env: `AUTOMATION_SUBMIT_ENABLED=true` (exactly `true`).
   - Redeploy.
5. **Record the decision** (this file + a dated note) — the docs require an
   *explicit* approval before any autonomous-submission release, which is why
   the switch ships OFF.
6. **Monitor post-launch:** watch `agent_tasks` (type `APPLICATION`),
   `applications.status` / `applications.error`, and the audit timeline.
   Emergency brakes that already work: admin suspend/terminate, the per-user
   pause (`job_preferences.active`), and removing the env var to kill the
   whole thing instantly.

### Suggested order of operations overall
1. Supabase service-role key + migrations + RLS verify (§2) — unblocks
   everything server-side.
2. Rotate `ENCRYPTION_MASTER_KEY` (§3) — do it before any real users.
3. Flutterwave test-mode loop, then live keys (§1).
4. Browser worker + staging tests, then (with explicit approval) flip the
   automation switch (§4).

---

*Last verified against the codebase on 2026-09-08 (commit `ac4ec64` + Wave 5).*
