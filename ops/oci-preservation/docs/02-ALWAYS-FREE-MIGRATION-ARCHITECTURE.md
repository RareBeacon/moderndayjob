# DOCUMENT 2 — ALWAYS FREE MIGRATION ARCHITECTURE

**Target Branch:** `arena/5a999da6-moderndayjob`  
**Design Principle:** Maximize permanent `$0.00/mo` resilience without overcommitting RAM/storage, migrating stable managed data layers unnecessarily, or touching live production before verified readiness and explicit owner approval.

---

## 1. Proposed Resource Specification Matrix (Full 11-Attribute Disclosure)

Every proposed OCI resource below uses the existing `us-chicago-1` tenancy (`ocid1.tenancy...k74wq`):

| Attribute | Resource 1: Primary App & AI Host (`jobiest-a1`) | Resource 2: Isolated Business Mail Host (`jobiest-mail`) | Resource 3: Encrypted Off-Instance Backup Vault (`jobiest-gate2-vault`) | Resource 4: Rolling Boot-Volume Backups |
|---|---|---|---|---|
| **1. Resource Name** | `jobiest-a1` | `jobiest-mail` *(Phase/Gate 3 — after A1 validation)* | `jobiest-gate2-vault` (existing private bucket) | `jobiest-a1-weekly-*` + retained `jobiest-ai-gate2-full-*` |
| **2. Region / AD** | `us-chicago-1` (`AD-2` preferred for zero-clone RO attach; `AD-1`/`AD-3` eligible) | `us-chicago-1` (`HWbX:US-CHICAGO-1-AD-1`) | `us-chicago-1` (Regional Object Storage) | `us-chicago-1` (Regional Boot Volume Backup) |
| **3. Shape / Tier** | `VM.Standard.A1.Flex` (`aarch64` Ampere Altra) | `VM.Standard.E2.1.Micro` (`x86_64` AMD EPYC) | Object Storage `Standard` (`NoPublicAccess`) | OCI Block/Boot Volume Backup |
| **4. CPU** | `2.0 OCPUs` (`2` dedicated ARM64 cores) | `1 OCPU` (`1/8` baseline burstable core, `2` vCPUs) | N/A (Managed Object Storage) | N/A |
| **5. RAM** | `12.0 GB` | `1.0 GB` (`+ 2.0 GB` Linux swap file on boot disk) | N/A | N/A |
| **6. Storage** | `50 GB` Boot Volume (`10 VPUs` Balanced) | `50 GB` Boot Volume (`10 VPUs` Balanced) | `<= 5 GiB` planned (`20 GiB` Always Free cap) | `2–4` backups (`5` Always Free backup count cap) |
| **7. Monthly Cost** | **`$0.00 / month`** | **`$0.00 / month`** | **`$0.00 / month`** | **`$0.00 / month`** |
| **8. Always Free Eligibility** | **Verified Eligible** (`standard-a1-core-regional-count=2`, `memory=12` in tenancy) | **Verified Eligible** (`2` `E2.1.Micro` instances available in `AD-1`) | **Verified Eligible** (`<= 20 GiB` storage, `<= 50,000` API requests/mo) | **Verified Eligible** (`free-backup-count = 5`, `2` currently used) |
| **9. Quota Requirement** | `2` A1 OCPUs, `12 GB` A1 RAM, `50 GB` regional block storage (`150/200 GB` total) | `1` `E2.1.Micro` slot, `50 GB` regional block storage (`200/200 GB` total while E5 + Gate 2 RVol exist) | `< 5 GiB` of `20 GiB` Object Storage quota | `1–2` of `3` remaining free backup slots |
| **10. Potential Additional Charges** | `$0.00` unless total regional boot+block storage exceeds `200 GB` or outbound egress exceeds `10 TB/mo` | `$0.00` unless total regional boot+block storage exceeds `200 GB` (`50 GB` min Ubuntu boot volume hits exact `200/200 GB` ceiling until E5 or Gate 2 RVol is retired) | Paid overage only if total stored bytes exceed `20 GiB` or API requests exceed `50,000/mo` | Paid overage if `> 5` backups retained simultaneously |
| **11. Reclamation / Availability Risk** | High physical contention (`Out of host capacity`) during creation; subject to OCI 7-day `<20%` idle reclamation rule | Low contention in `AD-1`; ephemeral public IP changes if instance is `STOPPED` (not on `reboot`); subject to OCI idle reclamation rule | Durable regional storage; persists across VM termination | Durable regional storage; persists across VM termination |

---

## 2. Service-by-Service Migration Matrix & Placement Rationale

| Service | Existing Platform | Proposed Platform | Decision & Engineering Rationale | Recurring Cost |
|---|---|---|---|---|
| **Next.js Frontend & Edge Crons** | Vercel | **Keep on Vercel** | Serves global TLS CDN, SSR/ISR, and 5 scheduled cron triggers (`vercel.json`) reliably at `$0` incremental cost. Moving Next.js onto the single 12 GB VM would consume ~0.6–1.2 GB RAM and turn VM maintenance into full-site downtime. | `$0.00` additional |
| **PostgreSQL Database (`46` migrations, `25+` RLS tables)** | Supabase | **Keep on Supabase** (+ automated encrypted off-site `pg_dump` backups) | Deeply coupled to `auth.users` FKs, RLS `auth.uid()`, and atomic Paystack/Flutterwave PL/pgSQL RPCs. Self-hosting Postgres on an Always Free VM increases data-loss blast radius without reducing cost. | `$0.00` additional |
| **Authentication (Email + Google + LinkedIn OIDC)** | Supabase Auth + Jobiest verification routes | **Keep on Supabase** | Production auth & `/dashboard` session flow are stable and verified working; migrating auth risks user lockouts for zero cost benefit. | `$0.00` additional |
| **CV & Document Object Storage** | Supabase Storage | **Keep on Supabase** | Signed URLs (`cvDownloadUrl`) integrate directly with `workers/browser` and RLS policies within free storage limits. | `$0.00` additional |
| **Caddy Reverse Proxy & TLS** | Oracle `jobiest-ai` (E5) | **Migrate to `jobiest-a1` (A1.Flex)** | Terminates HTTPS (`80/443`) with automatic Let's Encrypt renewal at cutover (`tls internal` during isolated Gate 4 validation). | `$0.00` |
| **Browser Automation Worker (`workers/browser`)** | Oracle E5 (primary) + Render Free (secondary) | **Migrate primary to `jobiest-a1` (A1.Flex); keep Render Free as secondary cold-standby** | Render Free (`512 MB` RAM, 15m sleep, 30–60s cold start) failed Gate 3 as primary (`isHealthy()` `2.5s` timeout). `jobiest-a1` provides always-on `12 GB` RAM + ARM64 Playwright `1.62.1` Chromium. | `$0.00` |
| **API Gateway (`workers/api`)** | Oracle `jobiest-ai` (E5) | **Migrate to `jobiest-a1` (A1.Flex)** | Lightweight Node HTTP gateway (`:8081` internal) requiring co-located low-latency hop to `http://worker:8082`. | `$0.00` |
| **AI Auth Proxy (`workers/ai`)** | Oracle `jobiest-ai` (E5) | **Migrate to `jobiest-a1` (A1.Flex)** | Enforces Bearer `OLLAMA_API_KEY` in front of internal `http://ollama:11434`. | `$0.00` |
| **Ollama LLM Inference (`qwen2.5:7b`, `llama3.2:3b`)** | Oracle `jobiest-ai` (E5) | **Migrate to `jobiest-a1` (A1.Flex)** + keep Cloudflare/OpenRouter disaster-switch hooks in `lib/ai/server.ts` | Requires `~6.2 GB` peak RAM for `qwen2.5:7b`; `A1.Flex` (`12 GB` RAM) is the only Always Free compute tier capable of hosting 7B GGUF inference. | `$0.00` |
| **Transactional App Emails (`no-reply@`, verification codes)** | Resend REST API | **Keep on Resend** | Instant sub-second delivery for 6-digit auth codes & password resets with established domain reputation (`<= 3,000/mo` free). | `$0.00` additional |
| **Staff & Departmental Mailboxes (`admin@`, `support@`, `hello@`, `careers@`, `staff@`, `finance@`, `privacy@`)** | ForwardEmail forwarding (`mail.jobiest.com` unconfigured) | **Deploy self-hosted mail platform on isolated `jobiest-mail` (`E2.1.Micro`)** *(see Document 3)* | Provides genuine IMAP/SMTP/Webmail/Admin mailboxes while isolating mail/antispam RAM spikes away from Chromium + Ollama on `jobiest-a1`. | `$0.00` |
| **Encrypted Infrastructure & Config Backups** | Gate 2 Boot Backup + Private Bucket | **OCI `jobiest-gate2-vault` (`JBV1` encrypted) + Rolling Boot Backups** | Client-side `AES-256-CBC` + `HMAC-SHA256` encrypted archives within `20 GiB` Object Storage & `5` backup limits. | `$0.00` |

---

## 3. CPU, Memory & Storage Budget Analysis

### 3.1 `jobiest-a1` (`VM.Standard.A1.Flex` — `2 OCPU / 12.0 GB RAM` / `~11.4 GiB` Usable)

| Component | Idle RAM | Peak Active RAM | CPU Profile | Cap / Guardrail |
|---|---|---|---|---|
| Linux Kernel, systemd, journald, Dockerd | `~450 MiB` | `~650 MiB` | `< 0.05 OCPU` | Journald `SystemMaxUse=200M` |
| `caddy` (`caddy:2-alpine`) | `~35 MiB` | `~70 MiB` | `< 0.05 OCPU` | TLS reverse proxy only |
| `api` + `ai` Node workers (`tsx`) | `~160 MiB` | `~280 MiB` | `< 0.10 OCPU` | Stateless auth/rate-limit proxies |
| `worker` (`playwright:v1.62.1-noble` + Chromium) | `~140 MiB` | `~1,100–1,450 MiB` *(1 active browser)* | `0.5–1.2 OCPU` burst during navigation | Closes Chromium context in `finally` after every request |
| `ollama` (`OLLAMA_MAX_LOADED_MODELS=1`, `NUM_PARALLEL=1`) | `~180 MiB` *(after `5m` keep-alive unload)* | `~6,200 MiB` (`qwen2.5:7b`) or `~2,800 MiB` (`llama3.2:3b`) | `1.8–2.0 OCPU` during token generation | Never loads both models simultaneously; `lib/ai/server.ts` `BoundedProvider` queues bursts |
| **Combined Total on `jobiest-a1`** | **`~0.97 GiB` (`~8.5%`)** | **`~8.3–8.65 GiB / 11.4 GiB` (`~76%`)** | **`2.0 OCPU` saturated during inference** | **`~2.75–3.1 GiB` safety headroom (`+ 2 GiB` swap safety net)** |

**Coexistence Verdict:**
- `jobiest-a1` (`2 OCPU / 12 GB`) can safely run **one loaded `qwen2.5:7b` inference + one concurrent Chromium navigation** in RAM (`~8.65 GiB / 11.4 GiB`), **provided** `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1` are enforced.
- Under simultaneous CPU contention (Chromium rendering heavy JS while `qwen2.5:7b` generates tokens across both ARM cores), token throughput will dip (`~6–10 tok/s` $\rightarrow$ `~3–5 tok/s`) and browser navigation latency will increase by `~1–3s`, which Gate 2/5 concurrent load benchmarks will measure explicitly. If `AI_MAX_CONCURRENCY` in Vercel (`default 8`) proves too high for single-VM latency, tuning `AI_MAX_CONCURRENCY=2` in Vercel (at Gate 7 approval) serializes LLM calls cleanly.
- **Why self-hosted email MUST NOT share `jobiest-a1`:** Adding Rspamd + Dovecot + Postfix + Webmail + Redis (`~1.0–1.5 GiB` without ClamAV, `~3.2 GiB` with ClamAV) onto `jobiest-a1` would erase the `2.75 GiB` safety margin and risk Linux OOM-killing `worker` or `ollama`.

### 3.2 Regional `200 GB` Block Storage Budget (`us-chicago-1`)

```text
Always Free Regional Ceiling: 200 GB (Boot Volumes + Block Volumes combined)
├── 50 GB : jobiest-ai (E5 Boot Volume — MUST NOT DELETE)
├── 50 GB : jobiest-ai-gate2-restore-test (Retained Gate 2 Recovery Volume — MUST NOT DELETE)
├── 50 GB : jobiest-a1 (New ARM64 Boot Volume — AD-2 preferred so 0 cross-AD clone needed)
└── 50 GB : Remaining headroom (Reserved for jobiest-mail E2.1.Micro OR cross-AD seed if AD-2 full)
---------------------------------------------------------------------------
Total during Gate 4/2 A1 build (AD-2): 150 / 200 GB ($0.00/mo, 50 GB free margin)
Total if jobiest-mail E2.1.Micro added while both E5 & Gate 2 RVol exist: 200 / 200 GB ($0.00/mo, 0 GB margin)
```

---

## 4. Safe Sequenced Execution Order & Approval Boundaries

1. **Gate 0 (Read-Only Re-Verification — Permitted Now / Optional Pre-Check):** Re-verify live OCI account/trial status, subnet/route/IGW/SL/NSG rules, backups, and quotas with zero mutations (`ops/oci-preservation/gate0_readonly_discovery.sh`).
2. **Approval A + Approval B $\rightarrow$ Execute `gate4_a1_provision_and_deploy.sh`:**
   - Provisions `jobiest-a1` (`2 OCPU / 12 GB` ARM64, ephemeral IP, restricted SSH `22/tcp`, console-verified host keys).
   - Attaches Gate 2 recovery volume **strictly read-only** (`--is-read-only true`), inspects E5 filesystem inventory without touching E5, uploads `JBV1`-encrypted archives to `jobiest-gate2-vault`, seeds public `ollama/models` weights only, confirms clean unmount before detaching, deploys the 5-service ARM64 stack with isolated credentials/TLS, and runs hard pass/fail assertions (`navigationOnly: true` zero-submit browser + API-to-worker + both Ollama `READY` tests).
3. **Concurrent Benchmark & Resilience Drills on `jobiest-a1`:** Measure Chromium + `qwen2.5:7b` concurrent latency/RAM/CPU, container/VM restart recovery, and encrypted backup restore verification in an isolated directory.
4. **Approval C $\rightarrow$ Isolated Business Email Build & Live Deliverability Proof (`jobiest-mail`):** Provision `VM.Standard.E2.1.Micro` in `AD-1` (only after verifying `<= 200 GB` storage), empirically test OCI port `25`/PTR/reputation, deploy selected mail stack on staging hostname/test DNS without touching live `jobiest.com` MX or Resend/ForwardEmail, and execute all 16 functional + anti-open-relay tests.
5. **Approval D & Approval E $\rightarrow$ Controlled Production Cutover (Gate 7):** Present complete 10-item readiness report and rollback runbook; only upon explicit approval, switch Let's Encrypt production Caddy config, reassign `147.224.218.163` (or update `60s`-TTL DNS), validate Vercel/Render failover, and cut over MX/mailboxes separately while keeping `jobiest-ai` untouched as instant rollback.
6. **Approval F $\rightarrow$ Post-Soak Retirement Review:** Only after multi-day production stability and explicit owner sign-off, decide whether any temporary recovery volume may be retired.
