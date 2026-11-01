# DOCUMENT 4 — DISASTER RECOVERY AND LONG-TERM OPERATIONS PLAN

**Objective:** Ensure Jobiest can lose any single OCI compute instance (hardware failure, accidental deletion, or Oracle Always Free reclamation) and reconstruct the complete application + email environment cleanly without losing business data, credentials, or mailbox history.

---

## 1. Encrypted Multi-Layer Backup Architecture

### 1.1 Data Classification & Where Authoritative State Lives

| Data Domain | Authoritative Location | Backup Mechanism | Frequency / Retention | Always Free Quota Impact |
|---|---|---|---|---|
| **SaaS Relational Data (`users`, `profiles`, `applications`, `payments`, `documents` metadata)** | Supabase PostgreSQL | Supabase daily backups **PLUS** automated scheduled `pg_dump --format=custom` encrypted with `JBV1` (`AES-256-CBC` + `HMAC-SHA256`) uploaded to `jobiest-gate2-vault` (and downloadable to owner offline storage) | Daily (`14` daily + `4` weekly `.dump.enc` archives; `~5–30 MiB` compressed each) | `< 0.5 GiB` of `20 GiB` OCI Object Storage |
| **Candidate CV Files** | Supabase Storage (`documents` bucket) | Incremental encrypted sync archive of bucket objects | Weekly (`4` snapshots) | `< 1.5 GiB` of `20 GiB` OCI Object Storage |
| **`jobiest-a1` Configs, `.env` & Caddy TLS State** | `jobiest-a1` (`/home/ubuntu/jobiest/.../deploy/oci` + `oci_caddy_data`) | Client-side `JBV1` Encrypt-then-MAC archive (`a1-config-tls-YYYYMMDD.tar.gz.enc`) uploaded via short-lived write-only PAR or OCI CLI least-privilege user | Daily on change + Weekly (`30` days retention; `< 2 MiB` each) | `< 0.1 GiB` of `20 GiB` OCI Object Storage |
| **Business Mailboxes, DKIM Keys & Mail DB (`/mailu` or `/opt/stalwart`)** | `jobiest-mail` (`E2.1.Micro`) | Consistent SQLite/Maildir snapshot $\rightarrow$ client-side `JBV1` encrypted `mail-vault-YYYYMMDD.tar.gz.enc` uploaded to `jobiest-gate2-vault` | Daily (`14` daily + `4` weekly archives) | `~1–8 GiB` (monitored to keep total bucket `< 18 GiB` of `20 GiB` cap) |
| **OS + Docker + Ollama GGUF Weights (`~6.7 GB`)** | `jobiest-a1` + `jobiest-mail` Boot Volumes | Rolling OCI Boot Volume Backups (`oci bv boot-volume-backup create`) + reproducible Git IaC (`deploy/oci`, `ops/oci-preservation`) | Weekly rolling (`2` retained for preserved E5 + `2` active rolling for A1/Mail = **`4 / 5` free backup slots**) | `4 / 5` Always Free backup slots (`$0.00`) |

### 1.2 Authenticated Encryption Specification (`JBV1` Format)
- **Construction:** Client-side **Encrypt-then-MAC** (`MAGIC = "JBV1\x00"` || `32-byte CSPRNG salt` || `AES-256-CBC(PBKDF2-HMAC-SHA256, 600,000 iterations)` || `32-byte HMAC-SHA256` over `MAGIC || salt || ciphertext`).
- **Key Separation:** Master key (`>= 256` bits of entropy) derives **two cryptographically independent subkeys** via domain-separated HMAC-SHA256 (`"JBV1-ENC|" || salt` for encryption and `"JBV1-MAC|" || salt` for authentication).
- **Key Custody Rule:**
  1. The master recovery key (`jobiest_gate2_vault.key`) is **never** uploaded to `jobiest-gate2-vault`, never committed to Git, and never printed to terminal logs.
  2. Owner stores an offline copy of `~/.ssh/jobiest_gate2_vault.key` and `~/.ssh/jobiest_a1_rsa` in a password manager (1Password / Bitwarden) + offline encrypted USB so recovery remains 100% possible even if Oracle Cloud Shell home storage resets after 6 months of inactivity.

---

## 2. Recovery Manual (Cold Rebuild if an OCI Instance Disappears)

Any competent engineer holding Git access + the offline `jobiest_gate2_vault.key` can rebuild from zero in **~20–25 minutes**:

1. **Provision Replacement Compute (`~3m`):**
   - Run `ops/oci-preservation/gate4_a1_provision_and_deploy.sh` (or `oci compute instance launch` for `VM.Standard.A1.Flex` `2 OCPU / 12 GB` Ubuntu `24.04` `aarch64` with `50 GB` boot volume).
2. **Verify SSH Host Identity Out-of-Band (`~1m`):**
   - Capture serial console output via `oci compute console-history capture/get-content`, validate RSA/ECDSA host key with `ssh-keygen -lf`, pin `~/.ssh/known_hosts_gate4`, and connect strictly with `-o StrictHostKeyChecking=yes`.
3. **Install OS Updates, UFW & Docker Engine (`~3m`):**
   - Apply Ubuntu security updates, configure `/etc/ssh/sshd_config.d/99-hardening.conf` (`PasswordAuthentication no`, `PermitRootLogin no`), lock `ufw` (`22/tcp` restricted to operator CIDR, `80/tcp` & `443/tcp` open, default deny incoming), and install `docker-ce` + `docker-compose-plugin`.
4. **Download, Authenticate & Decrypt Vault Archive (`~1m`):**
   ```bash
   python3 vault_crypto.py decrypt ~/.ssh/jobiest_gate2_vault.key a1-config-tls-latest.tar.gz.enc > /dev/shm/restore.tar.gz
   tar -tzf /dev/shm/restore.tar.gz >/dev/null
   ```
   *(Automatically aborts on wrong key or single-bit ciphertext tampering before touching `openssl`.)*
5. **Restore Application Code, `.env` & Caddy TLS Certificates (`~2m`):**
   - Clone `https://github.com/RareBeacon/moderndayjob.git`, restore `deploy/oci/.env` (`chmod 600`) and `oci_caddy_data` volume from `/dev/shm/restore.tar.gz`, then `shred -u /dev/shm/restore.tar.gz`.
6. **Start Stack & Pull/Restore Ollama Models (`~6–10m` cold pull, `~2m` from boot-volume backup):**
   - `sudo docker compose -p oci up -d --build`
   - `sudo docker compose -p oci exec -T ollama ollama pull qwen2.5:7b && sudo docker compose -p oci exec -T ollama ollama pull llama3.2:3b`
7. **Restore Mail Server (If `jobiest-mail` Affected, `~5m`):**
   - Launch `VM.Standard.E2.1.Micro` (or restore from latest `jobiest-mail` boot-volume backup), decrypt `mail-vault-latest.tar.gz.enc` into `/mailu`, and run `docker compose up -d`.
8. **Verify Security & Functional Gates (`~3m`):**
   - Assert `ufw status`, `ss -tln` (internal ports `8081/8082/8083/11434` unbound publicly), `/healthz` `200`, unauth `401`, SSRF `STOP`, `navigationOnly: true` Chromium test (`submissionAttempted: false`), and Ollama `READY`.
9. **Restore Production Routing (`~10s`):**
   - Reassign Reserved IP `147.224.218.163` to the replacement VM's private IP OCID (`oci network public-ip update --public-ip-id <RESERVED_IP_ID> --private-ip-id <NEW_PRIV_IP_ID> --force`) or update `60s`-TTL DNS `A` record.

---

## 3. `$0.00` Monitoring & Alerting Architecture

1. **On-Host Systemd Watchdog Timer (`jobiest-health-watchdog.timer`, every `2m`, `$0`):**
   - Checks Docker container health (`caddy`, `worker`, `api`, `ai`, `ollama`), disk usage (`alert > 80%`), available RAM/swap (`alert < 1.2 GiB` available), TLS certificate expiry (`alert < 21 days`), mail queue depth (`postqueue -p` > `25` messages), and latest encrypted backup timestamp (`alert > 30h` old).
   - Sends rate-limited alert emails via existing Resend HTTPS API (`no-reply@jobiest.com` $\rightarrow$ `admin@jobiest.com` + owner external backup Gmail so mail-server outages still alert out-of-band!).
2. **External Dead-Man's Switch (Vercel Existing Cron / GitHub Scheduled Workflow, `$0`):**
   - Probes `https://worker.jobiest.com/healthz`, `https://api.jobiest.com/healthz`, `https://ai.jobiest.com/healthz`, and `https://webmail.jobiest.com` externally so full VM network disappearance or OCI reclamation triggers an immediate external alert even when the VM itself is down.

---

## 4. Production Cutover & `<60s` Executable Rollback Plan (Gate 7 — Requires Approval D/E)

- **Pre-Cutover Invariant:** `jobiest-ai` (E5) remains `RUNNING` and completely unmodified throughout cutover and post-cutover soak.
- **Cutover Sequence (Only After Explicit Owner Approval D/E):**
  1. Switch `jobiest-a1` Caddy from `Caddyfile.gate4` (`tls internal`) to production `deploy/oci/Caddyfile` (`{worker,api,ai}.jobiest.com`).
  2. Align production `.env` service tokens (`BROWSER_WORKER_SECRET`, `API_KEYS`, `OLLAMA_API_KEY`) in a dedicated maintenance window.
  3. Reassign Reserved IP `147.224.218.163` from E5 private IP `10.0.1.31` to `jobiest-a1` private IP (`~2–5s` TCP reset), let Caddy complete ACME TLS issuance (or use restored E5 Let's Encrypt cert from vault for zero ACME rate-limit delay), and run immediate E2E smoke assertions.
  4. Cut over `MX` / email DNS in a **separate** approved change window after app stability is proven.
- **Instant Rollback Command (`<15 seconds` recovery if any error occurs):**
  ```bash
  oci network public-ip update \
    --region us-chicago-1 \
    --public-ip-id ocid1.publicip.oc1.us-chicago-1.amaaaaaa4azukbiamrhcpus5jzgub6etllrp77llxkfjadcxclwrtprn3dfa \
    --private-ip-id ocid1.privateip.oc1.us-chicago-1.abxxeljttu34mulvk3t7rjsxvpt6z4g3g37xealpkkbisybiupxuezzxzdwq \
    --force
  ```
  Because `jobiest-ai` (`10.0.1.31`), its Docker stack, its `.env`, and its Let's Encrypt certificates (`valid until Dec 23 2026`) are untouched, moving `147.224.218.163` back restores original production traffic in seconds.
