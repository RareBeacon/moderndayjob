# DOCUMENT 1 — JOBIEST INFRASTRUCTURE MASTER AUDIT

**Date:** `2026-10-31`  
**Repository / Active Branch:** `RareBeacon/moderndayjob` (`arena/5a999da6-moderndayjob`, isolated from `main` `0f49613d66cf0b5eab5227799177a765f59e989d`)  
**Target Production Domain:** `jobiest.com` (`worker.jobiest.com`, `api.jobiest.com`, `ai.jobiest.com`, `mail.jobiest.com`)  
**Audit Posture:** Strictly read-only against production (`jobiest-ai`, Reserved IP `147.224.218.163`, DNS, Vercel, Supabase, Render, Resend, ForwardEmail, and `main` untouched).

---

## 1. Audit of Current Repository, Isolated Branch & Gate 4 Review Findings

### 1.1 Branch State
- **`main` (`0f49613d66cf0b5eab5227799177a765f59e989d`):** Untouched by any infrastructure or migration commits.
- **`arena/5a999da6-moderndayjob`:** Contains isolated ARM64 / Playwright `1.62.1` alignment, HTTP `503` pre-submit worker failover reporting, server-enforced `navigationOnly: true` zero-submit validation, Ollama `12 GB` RAM caps (`OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_KEEP_ALIVE=5m`), and the hardened Gate 4 orchestration script (`ops/oci-preservation/gate4_a1_provision_and_deploy.sh`).

### 1.2 Inspection & Remediation of the 4 Gate 4 Code-Review Issues (Found in `2231cfa1`)

| # | Review Finding on `2231cfa1` | Root Cause Identified on Inspection | Verified Remediation Implemented on `arena/5a999da6-moderndayjob` |
|---|---|---|---|
| **1** | **Explicit zero-submit browser testing:** Greenhouse probe omitted `dryRun: true` and relied on `name: null` / `email: ""` to trigger `MISSING_INFO`. | Neither `workers/browser/server.ts`, `workers/api/server.ts`, nor `lib/apply/engine.ts` had a server-enforced navigation-only mode; `workers/api/server.ts` also stripped extra fields when forwarding to `worker /submit`. | Added server-enforced `navigationOnly?: boolean` across `lib/apply/engine.ts`, `workers/browser/server.ts`, and `workers/api/server.ts`. When `navigationOnly === true`: **(a)** CV download is skipped; **(b)** Playwright `page.route` aborts any non-`GET`/`HEAD`/`OPTIONS` request (`POST`/`PUT`/`PATCH`/`DELETE`) at the Chromium network layer; **(c)** `bindPage` throws `NAVIGATION_ONLY_MUTATION_BLOCKED` on `fill`, `check`, `click`, `setInputFiles`, and `selectOption`; **(d)** `runApply` returns `STOP` (`NAVIGATION_ONLY_VERIFIED`) after real `page.goto` + DOM signal scan without ever invoking `adapter.apply`; **(e)** both direct worker and API-to-worker E2E tests send `navigationOnly: true` with populated candidate fields and assert `navigationOnly === true`, `navigated === true`, `submissionAttempted === false`, and `mutationAttempted === false`. |
| **2** | **Restrict SSH ingress:** Script ran `ufw allow 22/tcp` unrestricted and did not inspect effective OCI subnet Security Lists / NSGs. | Shared subnet Security List `...ljy2q` allows `0.0.0.0/0 -> 22/tcp` at the VCN perimeter, and Phase 5 mirrored that open `22/tcp` rule on `jobiest-a1`. | Phase 1.3b now inspects the shared subnet (`oci network subnet get`), every attached Security List (`oci network security-list get`), and VCN NSGs (`oci network nsg list` / `rules list`) **strictly read-only** without modifying shared production network rules. It resolves and validates the operator's trusted `/32` CIDR (`TRUSTED_SSH_CIDRS` or verified egress IP, rejecting `0.0.0.0/0`, `::/0`, and broad prefixes `< /24`), bakes `sshd` hardening + source-restricted `ufw allow from <CIDR> to any port 22 proto tcp` into cloud-init and Phase 5 while keeping `80/tcp` & `443/tcp` open, and programmatically fails if `ufw status` contains any unrestricted `22/tcp` rule. |
| **3** | **Idempotent provisioning retries:** Non-capacity errors were logged and followed by subsequent launch attempts without reconciling whether an instance was created. | `oci compute instance launch` inside the sweep loop caught non-zero exits without checking OCI state on timeouts/5xx errors. | Added pre-launch zero-instance guard (`assert_zero_live_a1_before_launch`), per-attempt `--opc-retry-token`, strict `is_confirmed_out_of_host_capacity` (`ServiceError` + `"Out of host capacity"`), and `reconcile_non_capacity_launch_error`: on any other error, immediately queries `oci compute instance list --display-name jobiest-a1`, never issues another launch until resolved, adopts an instance **only** if `1` exists and matches `VM.Standard.A1.Flex`, `2.0 OCPU` (or approved `1.0`), `12.0 GB`, AD, and FD in `RUNNING` state, and aborts safely on `0` created (non-capacity error), `>1` created, spec mismatch, or reconciliation API failure. |
| **4** | **Failure-safe recovery-volume cleanup:** `cleanup()` unconditionally ran `oci compute volume-attachment detach --force` even if SSH failed or `/mnt/e5_recovery` remained mounted. | `cleanup()` did not track remote mount state before detaching `$ACTIVE_ATTACH_ID`. | Added `REMOTE_RECOVERY_UNMOUNT_CONFIRMED` state tracking + `safe_detach_recovery_volume()`. Set to `"false"` before `REMOTE_SEED` mounts `/mnt/e5_recovery`; set back to `"true"` only when remote SSH confirms `! mountpoint -q /mnt/e5_recovery` and absence from `/proc/mounts` (`GATE4_UNMOUNT_CONFIRMED_CLEAN`). If SSH fails or unmount cannot be confirmed, the script **retains** the read-only attachment, reports the exact attachment OCID + volume OCID + instance OCID, and stops without detaching. |

---

## 2. OCI Tenancy, Compute, Storage & Network Audit (`us-chicago-1`)

> **Verification Transparency Note:** All OCIDs and quotas in §2.1 were captured via authenticated `oci` CLI commands in `us-chicago-1` on `2026-10-31` (`21:25 UTC`). Items marked **"Re-verify at Gate 0/Approval B"** (such as current account trial banner, Route Table / Internet Gateway OCIDs, and Console Connections) must always be re-queried live before any state-changing step rather than assumed static.

### 2.1 Verified OCI Resource Inventory

| Category | Resource / Metric | Verified Value / OCID (`2026-10-31`) | Status / Audit Note |
|---|---|---|---|
| **Tenancy** | `ogungboyeopeyemiphilip` | `ocid1.tenancy.oc1..aaaaaaaaotqioawqblmo7go2ssnnmy3hmxth5aeumq55prfzdnpnwx6k74wq` | Home Region: `us-chicago-1`; Trial Reclamation Notice (`gmail` Oct email): `2026-11-06 02:23 UTC` (`03:23 WAT`) — **re-verify live in OCI Billing/Governance console**. |
| **Availability Domains** | `AD-1`, `AD-2`, `AD-3` | `HWbX:US-CHICAGO-1-AD-{1,2,3}` (`FAULT-DOMAIN-1..3` enumerated dynamically) | `jobiest-ai` & Gate 2 restore volume reside in `AD-2`. |
| **Live Production VM** | `jobiest-ai` | `ocid1.instance.oc1.us-chicago-1.anxxeljt4azukbicurujbsn6fwlg7nqdlsirupjr4kwyaygida2nwyaeb7yq` | `RUNNING`, `VM.Standard.E5.Flex` (`2 OCPU`, `12 GB RAM`, `x86_64` Ubuntu `24.04`). **Paid/Trial shape — at reclamation risk.** |
| **E5 Boot Volume** | `jobiest-ai (Boot Volume)` | `ocid1.bootvolume.oc1.us-chicago-1.abxxeljt6obwqlyxxv5mhr7zwbf5mkxhumeyufan6zci475sihflzpxrwnaq` | `50 GB`, `10 VPUs`, `AD-2`, `AVAILABLE` (attached to `jobiest-ai`). |
| **Retained Restore Vol** | `jobiest-ai-gate2-restore-test-20261031T122314Z` | `ocid1.bootvolume.oc1.us-chicago-1.abxxeljt3v35f2v33vnqrd6j3k7avhngfyncjwhxgkiiacrealq6zcdbptzq` | `50 GB`, `AD-2`, `AVAILABLE` (unattached, preserved for read-only recovery inspection). |
| **Boot Vol Backups** | Oct 4 + Oct 31 Gate 2 `FULL` | `...pymr2qq` (`2026-10-04`) + `...xgpfqa` (`2026-10-31`, `50 GB` / `26 GB` unique, `AVAILABLE`) | `2 / 5` Always Free backup slots used (`3` free slots remaining). |
| **VCN & Public Subnet** | VCN / Public Subnet | VCN `...xxplia` / Subnet `ocid1.subnet.oc1.us-chicago-1.aaaaaaaa6onpywxkeogb6wadpusauqzeiwibfda5xpqvjizcr3teoxkdlvva` | `10.0.1.0/24` (`prohibit-public-ip-on-vnic: false`). Route Table & IGW OCIDs re-verified read-only via Gate 0 script. |
| **Security List** | Shared Subnet SL | `ocid1.securitylist.oc1.us-chicago-1.aaaaaaaa72ce2vq7pgekjpn2o27ylukdtj5xyh6535ytcqocw7otzinljy2q` | Allows `0.0.0.0/0` $\rightarrow$ TCP `22`, `80`, `443`; blocks `8081`, `8082`, `8083`, `11434`. **Security finding:** TCP `22` is open to `0.0.0.0/0` at VCN SL layer. |
| **Reserved Public IP** | `147.224.218.163` (`jobiest-worker-ip`) | `ocid1.publicip.oc1.us-chicago-1.amaaaaaa4azukbiamrhcpus5jzgub6etllrp77llxkfjadcxclwrtprn3dfa` | `RESERVED`, `ASSIGNED` to E5 Private IP `10.0.1.31` (`...zzxzdwq`). Tenancy Always Free limit = `1` (`used: 1, avail: 0`). |
| **Object Storage** | `jobiest-gate2-vault` | Private bucket (`NoPublicAccess`, Standard tier) | Active PARs = `0` (all temporary PARs revoked). Always Free Object Storage regional cap = `20 GiB` combined Standard + Infrequent + Archive. |
| **IAM** | Dynamic Group + Policy | DG `...yjidja` (`jobiest-ai-oca-dg`) + Policy `...cij7wq` (`jobiest-ai-oca-policy`) | Scoped strictly to `jobiest-ai` OCID for OCA Run Command. |

### 2.2 Existing `jobiest-ai` (E5) In-Guest Inventory Status
- **Externally & Repository-Verified (`deploy/oci/`):** Ubuntu `24.04` `x86_64`, Docker Compose 5-container stack (`caddy:2-alpine`, `worker`, `api`, `ai`, `ollama/ollama:latest`), Let's Encrypt TLS certificates valid until `2026-12-23 10:59:55 GMT` for `{worker,api,ai}.jobiest.com` (`60s` DNS TTL), ports `80/443` public, internal ports `8081/8082/8083/11434` isolated on Docker internal network `internal: true`.
- **Pending Approval A (Read-Only Recovery Volume Mount):** Because Cloud Shell does not hold E5's original SSH key (`~/keys/jobiest-vm-2`) and `jobiest-ai`'s `oracle-cloud-agent` leaves Run Commands stuck in `ACCEPTED`, exact in-guest disk utilization, exact installed Ollama blob digests, crontab files, and `.env` variable names on E5 will be read **strictly read-only** (`--is-read-only true` + `mount -o ro,noload`) from retained Gate 2 volume `ocid1.bootvolume...dbptzq` upon **Approval A**, without ever touching the running E5 instance.

---

## 3. Application Architecture & Service Dependency Audit

### 3.1 Service Dependency Diagram

```text
                        [ Candidate / Admin Browser ]
                                      |
                                      | HTTPS (jobiest.com)
                                      v
+-----------------------------------------------------------------------------------+
| VERCEL (Next.js App Router + 5 Scheduled Crons in vercel.json)                    |
| - UI, Dashboard, Resume Studio, Portfolio Studio, SEO Blog, Admin Console         |
| - Crons: daily-pipeline, security-digest, security-scan, seo, first-win-email     |
+--------+--------------------+--------------------+---------------------+----------+
         |                    |                    |                     |
         | Auth/Postgres/RLS  | Billing Webhooks   | Transactional REST  | Bearer HTTPS
         | + Signed CV URLs   | (NGN / USD)        | (no-reply@,philip@) | (60s DNS TTL)
         v                    v                    v                     v
+------------------+  +------------------+  +------------------+  +------------------------+
| SUPABASE         |  | PAYSTACK &       |  | RESEND API       |  | ORACLE OCI VM          |
| - PostgreSQL 15+ |  | FLUTTERWAVE      |  | api.resend.com   |  | (147.224.218.163)      |
| - 46 Migrations  |  | Hosted Checkout  |  | Verified DKIM    |  | Caddy TLS Proxy (:443) |
| - 25+ RLS Tables |  | + HMAC Webhooks  |  +------------------+  |  ├─> api (:8081)       |
| - Auth (Email +  |  +------------------+                        |  ├─> worker (:8082)    |
|   Google/LI OIDC)|                                              |  └─> ai (:8083)        |
| - Storage (CVs)  |  +------------------+                        |        └─> ollama      |
+------------------+  | FORWARDEMAIL     |                        |            (:11434)    |
                      | Inbound MX ->    |                        +-----------+------------+
                      | Owner Gmail      |                                    |
                      | (support@,       |            Failover (2nd URL)      | Headless Chromium
                      |  privacy@,       |        +-----------------------+   | (SSRF-guarded)
                      |  philip@)        |        | RENDER FREE STANDBY   |   v
                      +------------------+        | srv-dag2nku1egvs...   |  [ External ATS ]
                                                  | (Cold-start fallback) |  - Greenhouse
                      +------------------+        +-----------------------+  - Lever
                      | AI FALLBACKS     |                                   - Ashby
                      | 1. Cloudflare AI |                                   - Workable
                      | 2. OpenRouter    |
                      | 3. User BYOK     |
                      +------------------+
```

### 3.2 Critical Codebase Findings Preserved Across All Phases
1. **Playwright `1.62.1` vs `1.63.0` Production Drift (`M-1`):** Production `main` (`package-lock.json` since `2026-09-17`) resolves `playwright@1.63.0` (Chromium rev `1243`) inside `mcr.microsoft.com/playwright:v1.62.1-noble` (Chromium rev `1234`), breaking live `chromium.launch()` on both E5 and Render while `/healthz` returns `200`. Fixed and pinned (`playwright@1.62.1` + build-time binary check + runtime `/healthz` `chromium.executablePath()` check + HTTP `503` pre-submit failover) on `arena/5a999da6-moderndayjob`.
2. **Existing Email Split:**
   - **Outbound automated transactional email (`lib/email/resend.ts`):** Sent exclusively via `https://api.resend.com/emails` (`no-reply@jobiest.com` for 6-digit signup/Google/LinkedIn verification codes, password resets, 2FA alerts, job alerts, support confirmations; `philip@jobiest.com` for welcome emails; `replyTo: support@jobiest.com`).
   - **Inbound human addresses:** `support@jobiest.com`, `privacy@jobiest.com`, and `philip@jobiest.com` currently rely on ForwardEmail forwarding to the owner's Gmail (`mail.jobiest.com` currently points to Vercel `216.198.79.65` / `216.198.79.1` returning `DEPLOYMENT_NOT_FOUND` — no mail server exists yet).
3. **Database Coupling (`supabase/migrations/001..046`):** `46` SQL migrations deeply bind `public.*` tables (`profiles`, `workspaces`, `career_profiles`, `subscriptions`, `payments`, `ai_credentials`, `applications`, `agent_tasks`, `documents`, `generated_documents`, `credit_ledger`, `app_sessions`, etc.) to `auth.users(id)`, `auth.uid()` RLS policies, `on_auth_user_created` triggers, `storage.buckets` signed CV URLs, and atomic Paystack/Flutterwave PL/pgSQL RPCs.

---

## 4. Current vs Proposed Cost & Always Free Eligibility Table

| Resource | Current Allocation | Proposed Allocation | Always Free Eligible? | Monthly Cost |
|---|---|---|---|---|
| **OCI Primary App VM** | `jobiest-ai` (`VM.Standard.E5.Flex`, `2 OCPU / 12 GB`) | `jobiest-a1` (`VM.Standard.A1.Flex`, `2 OCPU / 12 GB` ARM64) | **Yes** (`<= 4 OCPU / 24 GB` A1 regional limit; tenancy quota verified `2 OCPU / 12 GB` in `us-chicago-1`) | **`$0.00`** *(E5 becomes `$0` while on trial credit, then reclaimed by OCI unless account upgraded — do NOT upgrade)* |
| **OCI Email VM (Gate 3/Email)** | None (`mail.jobiest.com` unconfigured) | `jobiest-mail` (`VM.Standard.E2.1.Micro`, `1/8 OCPU / 1 GB RAM`, `AD-1`) | **Yes** (`<= 2` `E2.1.Micro` instances in home region; `2` currently unused in `AD-1`) | **`$0.00`** *(subject to regional `200 GB` storage budget — see §5)* |
| **OCI Block/Boot Storage** | `100 GB` (`50 GB` E5 boot + `50 GB` Gate 2 retained restore vol) | `150 GB` during A1 rebuild (`+50 GB` A1 boot); `200 GB` max if `50 GB` Mail VM added | **Yes, up to `200 GB` regional total across ALL boot + block volumes** | **`$0.00`** *(hard-gated `<= 200 GB`; `>200 GB` would incur paid storage and is blocked)* |
| **OCI Boot Volume Backups** | `2` backups (`Oct 4` + `Oct 31 Gate 2`) | `2–4` rolling backups (`<= 5` total) | **Yes, up to `5` volume backups** | **`$0.00`** |
| **OCI Object Storage** | `jobiest-gate2-vault` (`0` objects yet) | Encrypted `.tar.gz.enc` configs/mailboxes (`< 2 GiB`) | **Yes, up to `20 GiB` regional total** (Standard + Infrequent + Archive combined) | **`$0.00`** |
| **OCI Reserved Public IP** | `147.224.218.163` (on E5) | Reassigned to `jobiest-a1` only at Gate 7 cutover (`jobiest-mail` uses ephemeral IP or proxy) | **Yes, `1` Reserved Public IP (`vcn/reserved-public-ip-count = 1`)** | **`$0.00`** *(a 2nd Reserved IP is NOT free/available)* |
| **OCI Outbound Bandwidth** | `< 50 GB/mo` | `< 100 GB/mo` | **Yes, up to `10 TB/month` egress** | **`$0.00`** |
| **Frontend + Edge Crons** | Vercel (existing plan) | Keep on Vercel | Existing third-party tier | **`$0.00` additional** |
| **Database, Auth & Storage** | Supabase (existing project) | Keep on Supabase (+ encrypted off-site `pg_dump` backups) | Existing third-party tier | **`$0.00` additional** |
| **Transactional App Email** | Resend Free (`<= 3,000/mo`, `100/day`) | Keep Resend for app transactional + optional SMTP relay | Existing third-party free plan | **`$0.00` additional** |
| **Secondary Browser Worker** | Render Free (`srv-dag2nku1egvs73a29dng`) | Keep as emergency cold-standby only (after `1.62.1` deploy) | Existing third-party free plan (`750 hrs/mo`, sleeps after 15m) | **`$0.00` additional** |

---

## 5. Key Risks & Unresolved Operational Realities

1. **Oracle A1 Physical Host Capacity Risk:** Having `2 OCPU / 12 GB` tenancy quota in `us-chicago-1` does **not** guarantee physical ARM64 host capacity at launch time (`Out of host capacity` is common in popular regions). Mitigation: idempotent 30-round × 45s multi-AD/FD sweep with strict reconciliation.
2. **Oracle Always Free Idle Reclamation Policy:** Oracle may reclaim Always Free compute instances if CPU, network, and memory utilization remain below 20% (95th percentile) over a 7-day window. Mitigation: documented monitoring, legitimate daily scheduled health/inference checks, and full off-instance encrypted DR backups so `jobiest-a1` can be rebuilt from zero in `<25 minutes`.
3. **`200 GB` Regional Storage Ceiling During Parallel Preservation:** While `jobiest-ai` (`50 GB`) AND the retained Gate 2 restore volume (`50 GB`) AND `jobiest-a1` (`50 GB`) all exist simultaneously, regional storage stands at **`150 / 200 GB`**. That leaves **exactly `50 GB`** — enough for one `50 GB` `E2.1.Micro` boot volume (`200 / 200 GB`), leaving **`0 GB`** margin for cross-AD clone volumes until either E5 is reclaimed by Oracle after cutover or the owner explicitly approves retiring the temporary restore-test volume under Approval F.
4. **OCI Free Tier Outbound TCP Port `25` & PTR Block:** OCI blocks outbound port `25` and custom PTR/rDNS configuration on Free Tier accounts (see Document 3 for verified architecture solving this cleanly at `$0.00/mo`).
