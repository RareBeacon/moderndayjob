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
| Caddy | `caddy:2` | 80/443 | TLS (Let's Encrypt) + routing |

The web app (Vercel) calls the worker through `BROWSER_WORKER_URL` (pointed at
`https://worker.<domain>`), and customers call the gateway at
`https://api.<domain>` with a `Bearer` API key.

## Always Free limits (verified 2026-09-08)

- **Ampere A1 ARM: 2 OCPU + 12 GB RAM** — ⚠️ Oracle halved this from 4/24 on
  2026-06-15 (enforced from 2026-08-18). Use it as **one 2/12 VM** for both
  services, or split into 2× 1/6 (then split the compose file across hosts —
  not recommended to start).
- 2× AMD `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB) — too small for Chromium;
  ignore.
- 200 GB block storage total · 10 TB/month egress · 1 flexible load balancer
  (10 Mbps) · 20 GB object storage.
- **Do not upgrade to Pay As You Go** without an explicit decision — PAYG keeps
  4/24 but risks charges. We stay Always Free.

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
