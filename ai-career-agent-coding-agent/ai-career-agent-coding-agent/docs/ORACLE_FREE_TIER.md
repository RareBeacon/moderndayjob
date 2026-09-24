# Oracle Always Free — self-hosted browser worker + API gateway

Free, fully-controlled hosting for Jobiest's automation backend. The isolated
browser worker and the customer API gateway run as Docker containers on an
Oracle **Always Free** Ampere A1 VM, with Caddy terminating TLS in front.
Nothing is billed; this stays at **$0** as long as we respect the limits.

## What runs where

| Service | Image / source | Port (internal) | Public URL (via Caddy) |
|---|---|---|---|
| Browser worker | app `Dockerfile` (Playwright + Chromium) | 8082 | `worker.<domain>` → `/submit`, `/healthz` |
| API gateway | `workers/api/` (`npm run api`) | 8081 | `api.<domain>` → `/v1/submit`, `/healthz` |
| AI gateway | `workers/ai/` (`npm run ai`) | 8083 | `ai.<domain>` → `/api/chat`, `/healthz` |
| Ollama | `ollama/ollama` (arm64) | 11434 | none (compose network only) |
| Caddy | `caddy:2` | 80/443 | TLS (Let's Encrypt) + routing |

The web app (Vercel) calls the worker through `BROWSER_WORKER_URL` (pointed at
`https://worker.<domain>`), and customers call the gateway at
`https://api.<domain>` with a `Bearer` API key.

## Always Free limits (verified 2026-09-08)

- **Ampere A1 ARM: 2 OCPU + 12 GB RAM** — ⚠️ Oracle halved this from 4/24 on
  2026-06-15 (enforced from 2026-08-18). Use it as **one 2/12 VM** for both
  services, or split into 2× 1/6 (then split the compose file across hosts —
  not recommended to start).

## MIGRATED TO ALWAYS FREE (2026-09-21)

The instance `jobiest-ai` was created 2026-09-10 as **VM.Standard.A2.Flex
2/12 running on trial credits** (A2 is NOT an always-free shape). On
2026-09-21 it was converted via the OCI API: graceful stop → edit shape to
**VM.Standard.A1.Flex 2 OCPU / 12 GB** → start. Same boot volume, same
ephemeral public IP (**147.224.189.214**), ~3 minutes of downtime covered by
the Render standby failover. Verified healthy after: worker.jobiest.com,
ai.jobiest.com, api.jobiest.com. Tenancy cost sweep: 100 GB of the 200 GB
free block storage, no load balancers, A1 total exactly at the 2 OCPU free
envelope. The trial ends ~2026-10-07; within-limit A1 resources continue
after trial expiry per Oracle's current policy. If Oracle stops the instance
anyway (older documented behavior), recreate it with the same API flow —
credentials are on file (`~/keys/oci_ocids.txt` + `~/keys/oci_api_key.pem`),
and Render keeps submissions working during any gap.
- 2× AMD `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB) — too small for Chromium;
  ignore.
- 200 GB block storage total · 10 TB/month egress · 1 flexible load balancer
  (10 Mbps) · 20 GB object storage.
- **Do not upgrade to Pay As You Go** without an explicit decision — PAYG keeps
  4/24 but risks charges. We stay Always Free.
- **Backend workers vs web app (2026-09-24 status):** all layers now run the
  same release: web app (Vercel), database (Supabase, migration 040), and
  BOTH worker deployments (Oracle bridge + Render standby) build from
  `main`, so the M4 confirmation-verification layer is live on every
  submission path.
- **2026-09-24 Oracle rebuild (SSH key lost + capacity):** the original VM's
  SSH key was generated in a lost session, so the instance was rebuilt from
  scratch. Free ARM (A1) was "out of host capacity" in all 3 ADs, so the
  bridge runs on **VM.Standard.E5.Flex 2/12** (paid shape on remaining trial
  credits, trial ends ~2026-10-07). New reserved public IP:
  **147.224.218.163** (the old 147.224.189.214 was ephemeral and died with
  the old instance; DNS A records for worker/api/ai were repointed via the
  Vercel DNS API). SSH key on file: `~/keys/jobiest-vm-2(.pub)`. Secrets:
  BROWSER_WORKER_SECRET unchanged (Vercel + Render verified identical);
  OLLAMA_API_KEY rotated (fresh value set on the VM and in Vercel; the old
  one was write-only/sensitive and could not be read back); API_KEYS fresh
  (no customer keys had ever been issued).
- **A1 watcher (permanent home):** `~/oci-tools/a1_watcher.py` probes for
  free A1 2/12 capacity every 15 min (background process; restart it each
  session if dead, it is idempotent). When A1 lands it self-provisions via
  the same cloud-init; then complete the swap interactively: move reserved
  IP 147.224.218.163 to the A1's private IP, verify healthz + 401 gates,
  terminate the E5 bridge. **Hard deadline: 2026-10-05** (trial ends
  ~2026-10-07; if A1 capacity has not appeared by then, the owner must
  decide between extending via Pay As You Go (explicit decision required)
  or accepting downtime until free capacity appears).


## Phase 0 — Provision the VM (do once)

1. Sign in to https://cloud.oracle.com → your **home region**.
2. **Compute → Instances → Create instance**:
   - Name: `jobiest-worker`.
   - Image: **Canonical Ubuntu 24.04** (or latest 24.04 LTS).
   - Shape: **Ampere → VM.Standard.A1.Flex** → **2 OCPU / 12 GB**.
   - Networking: default VCN + subnet, **assign a public IPv4 address**.
   - SSH: **Upload public key** (`~/.ssh/id_ed25519.pub` — generate with
     `ssh-keygen -t ed25519` if you don't have one).
   - Boot volume: keep the default (~50 GB; 200 GB total is free).
3. **Security list (firewall).** In the subnet's *Security List*, allow inbound:
   - `22/tcp`  (SSH) — ideally restrict to your IP.
   - `80/tcp` + `443/tcp` from `0.0.0.0/0` (Caddy).
   - **Do NOT** open 8081/8082 publicly — only Caddy reaches them internally.
4. Note the **public IP**; SSH in: `ssh ubuntu@<PUBLIC_IP>`.

> **"Out of capacity" is common** on Ampere. If creation fails, retry, or try a
> different **Availability Domain** in the same region, or another region. It
> often frees up within a day.

## Phase 1 — Install Docker and deploy

On the VM:

```bash
# Docker + compose plugin
sudo apt-get update && sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # then log out/in

# Pull the deploy directory only
cd ~
git clone --depth 1 https://github.com/RareBeacon/moderndayjob.git jobiest
cd jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci

# Configure secrets
cp .env.example .env
nano .env      # set BROWSER_WORKER_SECRET (same as Vercel), API_KEYS, domains

# Build + run (first build pulls the Playwright image ~1.5 GB — takes a few min)
docker compose up -d --build
docker compose logs -f   # watch worker + api come online
```

## Phase 2 — DNS + TLS

Point two A records at the VM's public IP, e.g.:

```
worker.jobiest.com  A  <PUBLIC_IP>
api.jobiest.com     A  <PUBLIC_IP>
```

Caddy obtains Let's Encrypt certs automatically on first request. Verify:

```bash
curl https://worker.jobiest.com/healthz   # {"ok":true,"worker":"browser",...}
curl https://api.jobiest.com/healthz      # {"ok":true,"service":"jobiest-api-gateway",...}
```

## Phase 3 — Point the web app at the self-hosted worker

In Vercel (project `modernjob`), set `BROWSER_WORKER_URL` to
`https://worker.jobiest.com` (it currently points at Render — keep Render
running as a fallback until the Oracle worker is proven over a few days, then
stop it). `BROWSER_WORKER_SECRET` must match `deploy/oci/.env`.

## Phase 4 — The customer API (first ~100 users)

Issue one key per tenant and put it in `API_KEYS` (comma-separated), then
redeploy the `api` service:

```bash
docker compose up -d api
```

Test:

```bash
curl -X POST https://api.jobiest.com/v1/submit \
  -H "Authorization: Bearer <TENANT_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"jobUrl":"https://boards.greenhouse.io/<co>/jobs/<id>","candidate":{"email":"u@x.com","name":"U","phone":null,"cvDownloadUrl":"<signed pdf url>","coverLetter":null,"answers":[]}}'
```

Expect a JSON `{outcome:"STOP",code:"CAPTCHA",...}` (real forms have CAPTCHA) or
`{outcome:"SUBMITTED",...}` on captcha-free forms — never a hang.

## Budget safety

1. **Billing → Budgets → Create budget**, amount `$1`, alert at **100%** →
   email. If anything ever exceeds Always Free, you get a warning before any
   real spend.
2. Keep the account **Always Free** (not PAYG). The 2/12 shape is the ceiling.

## Security invariants (same as Render worker)

- Worker + gateway **fail closed** (no secret/keys ⇒ 401 for everyone).
- Gateway ignores client-supplied `allowedDomains` and sends the canonical ATS
  allowlist; the worker still re-checks every navigation (SSRF + adapter).
- Only 80/443 + SSH are exposed; 8081/8082 stay on the internal Docker network.
- No DB credentials or Supabase keys ever live on this VM.

## Rotating keys / updating

```bash
cd ~/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci
git pull
docker compose up -d --build      # rebuild + restart on new commits
```
