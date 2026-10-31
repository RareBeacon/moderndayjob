# DOCUMENT 3 — SELF-HOSTED BUSINESS EMAIL FEASIBILITY AND IMPLEMENTATION PLAN

**Date:** `2026-10-31`  
**Objective:** Genuine self-hosted business mailboxes (`admin@`, `support@`, `hello@`, `careers@`, `staff@`, `finance@`, `privacy@`, `philip@jobiest.com`) with real inboxes, Webmail, IMAP, authenticated SMTP, Admin UI, quotas, aliases, spam filtering, and verified deliverability at `$0.00/mo` — **without** breaking live Resend transactional email or overloading `jobiest-a1`.

---

## 1. Platform Comparison (Verified Against Upstream Releases & Docs as of `2026-10-31`)

| Requirement / Metric | **Mailu (`2024.06.67`)** *(Recommended #1)* | **Stalwart (`v1.0.1`) + SnappyMail** *(Recommended #1B Ultra-Light)* | **Mailcow (`2026-10`)** | **Modoboa (`2.12.0`)** | **iRedMail (`1.8.9`)** |
|---|---|---|---|---|---|
| **Deployment Model** | Docker Compose | Docker Compose (2 containers: Rust server + Webmail) | Docker Compose (~19 containers) | Bare-metal Python installer *(marked beta)* | Bare-metal OS script *(mutates host)* |
| **Upstream Architectures** | `x86_64` & `ARM64` | `x86_64` & `ARM64` | `x86_64` & `ARM64` | `x86_64` & `ARM64` (compiles wheels) | `x86_64` & `ARM64` |
| **Official Min RAM (No ClamAV)** | **`1 GiB RAM + 1 GiB swap`** | **`~512 MiB–1 GiB RAM + 1 GiB swap`** | **`6 GiB RAM + 1 GiB swap`** (`SKIP_CLAMD=y` still ~3.5–4.5 GiB) | **`2 GiB RAM`** (required to compile deps) | **`4 GiB RAM`** (`2 GiB` stripped floor) |
| **Official Min RAM (With ClamAV)** | `3 GiB RAM + 1 GiB swap` | External milter (`+1.5 GiB`) | `6–8 GiB RAM + 1 GiB swap` | `3–4 GiB RAM` | `4 GiB+ RAM` |
| **Fits on OCI `E2.1.Micro` (`1 GB RAM`)?** | **Yes** *(with `ANTIVIRUS=none` + `2 GB` swap + SnappyMail)* | **Yes — Best RAM margin** *(~450–600 MiB steady RSS)* | **No** (Guaranteed OOM) | **No** (`<2 GB` build OOMs) | **No** (OOMs during install/Amavis) |
| Mailbox creation / deletion / suspension | **Yes** (Web UI + CLI/API) | **Yes** (Web UI + REST API) | **Yes** | **Yes** | **Yes** |
| Admin dashboard | **Yes** (`mailu-admin` + TOTP MFA) | **Yes** (Built-in WebAdmin + MFA) | **Yes** | **Yes** | **Crippled in Free tier** |
| Webmail | **Yes** (SnappyMail or Roundcube) | **Yes** (via SnappyMail / Roundcube container) | **Yes** (SOGo — heavy RAM) | **Yes** | **Yes** (Roundcube/SOGo) |
| SMTP sending (`465`/`587`) & IMAP (`993`) | **Yes** (Postfix + Dovecot) | **Yes** (Native Rust SMTP + IMAP4rev2/JMAP) | **Yes** | **Yes** | **Yes** |
| Inbound & Outbound + Smarthost Relay | **Yes** (Native `RELAYHOST` support) | **Yes** (Native outbound relay routing) | **Yes** | **Yes** | **Yes** |
| Password management & Quotas | **Yes** | **Yes** | **Yes** | **Yes** | Quotas limited in Free UI |
| Spam filtering | **Yes** (Rspamd + Sieve) | **Yes** (Built-in spam/phishing filter + Sieve) | **Yes** (Rspamd) | **Yes** (Rspamd/Amavis) | **Yes** (Amavis/SpamAssassin) |
| Antivirus integration | Optional ClamAV *(skip on 1 GB RAM; attachment extension blocklist via Rspamd)* | Optional ClamAV milter *(skip on 1 GB RAM)* | ClamAV (`~1.5 GiB` RAM) | ClamAV | ClamAV |
| DKIM, SPF, DMARC, TLS, MTA-STS | **Yes** (Auto DKIM gen + Let's Encrypt) | **Yes** (Auto DKIM/ARC + ACME + MTA-STS) | **Yes** | **Yes** | **Yes** |
| Multiple domains + Aliases & Forwarding | **Yes** *(100% free in Admin UI)* | **Yes** *(100% free in Admin UI)* | **Yes** | **Yes** | **NO in Free UI** *(Aliases/forwarding locked behind `$599/yr` iRedAdmin-Pro!)* |
| Mobile compatibility (iOS/Android) | **Yes** (IMAPS `993` + Submissions `465`/`587`) | **Yes** (IMAPS + JMAP + CalDAV/CardDAV) | **Yes** (+ ActiveSync) | **Yes** | **Yes** |

### Platform Selection Recommendation
- **Reject `iRedMail`:** Free edition intentionally strips alias/forwarding management from the Admin Web UI (`$599/yr` Pro upsell) and requires `4 GB` RAM on bare metal.
- **Reject `Mailcow` & `Modoboa` for `E2.1.Micro`:** Mailcow requires `6 GiB+` RAM (`SOGo` + `MariaDB` + `Rspamd` + `Redis`), and Modoboa's beta installer requires `2 GiB` RAM to compile Python wheels.
- **Select `Mailu 2024.06.67` (with `WEBMAIL=snappymail`, `ANTIVIRUS=none`, Rspamd dangerous-attachment filter enabled, `2 GiB` swap)** — OR **`Stalwart v1.0.1 + SnappyMail`** if Gate 3 benchmark on `E2.1.Micro` shows Mailu's idle RSS (`~780 MiB`) is too close to `E2.1.Micro`'s `~960 MiB` usable RAM. Both are 100% open-source, containerized, support full aliases/quotas/domains/DKIM/Webmail/Admin MFA at `$0`, and back up cleanly from a single host directory (`/mailu` or `/opt/stalwart`).

---

## 2. Ten Critical OCI Email Infrastructure Checks (Unvarnished Engineering Assessment)

| # | Check | Verified OCI Always Free Reality | Engineering Impact & Mitigation |
|---|---|---|---|
| **1** | Inbound & Outbound SMTP policy | OCI permits inbound SMTP (`25/tcp`), SMTPS (`465/tcp`), Submission (`587/tcp`), and IMAPS (`993/tcp`), but **blocks outbound `25/tcp` by default** on all tenancies. | Must empirically verify with `nc -zv -w 5 gmail-smtp-in.l.google.com 25` during Gate 3, and design for outbound port `25` being blocked. |
| **2** | Is TCP port `25` outbound restricted on Free Tier? | **Yes.** Lifting OCI's outbound `25/tcp` block requires an OCI Support/Limits ticket, which Oracle **restricts to Paid (Pay-As-You-Go) accounts**. | **Solved at `$0.00/mo` without upgrading OCI:** Configure Mailu/Stalwart outbound `RELAYHOST` over **TCP `587` (`STARTTLS`) / `465` (`TLS`)** via an authenticated `$0` SMTP relay (**Resend SMTP `smtp.resend.com:465`**, already DKIM-verified for `jobiest.com`, or **Brevo Free SMTP `smtp-relay.brevo.com:587`**, `300` emails/day = `9,000/mo` free). |
| **3** | Is inbound TCP port `25` available? | **Yes** (once explicitly opened in VCN NSG/Security List + host UFW for the mail host). | External senders (`Gmail`, `Outlook`, candidates, employers) deliver inbound mail **directly** to `MX mail.jobiest.com:25` into real self-hosted IMAP/Webmail inboxes. |
| **4** | Can reverse DNS / PTR be configured on OCI Always Free? | **No on Free Tier.** OCI custom PTR records on public IPs require a Paid-account support request. | Direct port-25 sending without PTR gets rejected by Gmail/Outlook (`550-5.7.25`). Routing **outbound** mail via authenticated TLS smarthost (`587`/`465`) uses the relay's pre-warmed, PTR-verified outbound IP pool while preserving `From: support@jobiest.com` + `jobiest.com` DKIM alignment! |
| **5** | Public IP reputation | Cloud compute IP ranges (`147.224.x.x` / OCI ephemeral pools) frequently appear on Spamhaus PBL / cloud blocklists for direct port-25 emission. | Inbound MX (`25/tcp`) + IMAPS (`993`) + Submission (`465`/`587`) are **unaffected** by PBL; outbound smarthost relay avoids cloud-IP reputation rejections completely. |
| **6** | Operation with a public IP that may change | Tenancy has **only `1` Always Free Reserved IP** (`147.224.218.163`, reserved for `jobiest-a1`). A separate `E2.1.Micro` receives an **ephemeral public IP** (persists across `reboot`, changes only if `STOPPED` or terminated). | Two clean options: **(B1)** Keep `E2.1.Micro` running continuously with `60s` DNS TTL on `mail.jobiest.com` (and update `A` record if ever recreated), **or (B2)** forward TCP `25/465/587/993` from `147.224.218.163` (`jobiest-a1` HAProxy/Nginx stream with `PROXY` protocol) over private VCN `10.0.1.0/24` to `jobiest-mail` (`10.0.1.x`) so `mail.jobiest.com` shares the permanent Reserved IP while all mail RAM/CPU stays 100% isolated on `E2.1.Micro`! |
| **7** | Reliable TLS certificates | Let's Encrypt ACME HTTP-01 / ALPN-01 (`mail.jobiest.com`, `webmail.jobiest.com`) renews automatically every 60 days for `$0`. | Valid TLS across HTTPS Webmail (`443`), IMAPS (`993`), and SMTPS/Submission (`465`/`587`). |
| **8** | Domain DNS configurability (`mail.jobiest.com` audit) | Live `mail.jobiest.com` currently resolves to `216.198.79.65` / `216.198.79.1` (Vercel placeholder returning `404 DEPLOYMENT_NOT_FOUND`). | Safe to repurpose `mail.jobiest.com` **after** inspecting full zone records (`MX`, `TXT`, ForwardEmail tokens) and receiving **Approval D**. |
| **9** | Major provider acceptance (Gmail, Outlook, Yahoo) | Gmail/Yahoo/Microsoft require valid PTR on sending IP, aligned `SPF` + `DKIM` (`2048-bit`), published `DMARC`, TLS, and low complaint rate. | Outbound via DKIM-signed `jobiest.com` + Resend/Brevo TLS relay satisfies PTR + SPF + DKIM + DMARC alignment on day 1; must be proven empirically to Gmail, Outlook, and Yahoo test accounts before production cutover. |
| **10** | Compliance with Oracle Acceptable Use Policy | OCI AUP prohibits spam/unsolicited bulk mail and open relays; normal authenticated corporate staff email (`<50–200` messages/day) + inbound MX complies fully. | Strict no-open-relay Postfix/Stalwart config + rate limits + fail2ban/Rspamd brute-force protection. |

---

## 3. Architecture Options Comparison (`Options A, B, C`)

| Criterion | **Option A: Co-locate Mail on `jobiest-a1` (`2 OCPU / 12 GB`)** | **Option B: Dedicated `VM.Standard.E2.1.Micro` (`jobiest-mail`, `AD-1`) + Outbound TLS Relay** *(RECOMMENDED)* | **Option C: External Free Hosting Only (No OCI Mail VM)** |
|---|---|---|---|
| **RAM / CPU Contention** | **High Risk.** `qwen2.5:7b` (`6.2 GiB`) + Chromium (`1.4 GiB`) + Mailu (`1.0 GiB`) leaves `<2 GiB` margin; spam wave can OOM-kill browser worker. | **Zero Contention.** Mail runs on its own VM (`1 GB RAM + 2 GB swap`) in `AD-1`; `jobiest-a1` keeps 100% of `12 GB` RAM for Jobiest app + AI. | Zero OCI contention, **but** no genuinely free external provider offers unlimited custom-domain IMAP+SMTP+Admin mailboxes (`admin@`, `support@`, `staff@`, `finance@`, `careers@`, `hello@`) — Zoho Free Legacy caps at 5 users and blocks IMAP/SMTP! |
| **Storage Impact** | `150 / 200 GB` | `200 / 200 GB` (`50 GB` E5 + `50 GB` RVol + `50 GB` A1 + `50 GB` Mail = `$0.00` exact Always Free limit) | `150 / 200 GB` |
| **Security Isolation** | Shared host compromises isolate only at Docker boundary. | Separate kernel, separate VM, separate disk, separate firewall. | Vendor-managed. |
| **Deliverability** | Still blocked on outbound `25/tcp` & PTR without TLS relay. | **High** (Direct inbound MX `:25` + authenticated TLS outbound `:587/:465` relay). | Limited to 5 web-only boxes (fails IMAP/unlimited mailbox requirement). |
| **Monthly Cost** | `$0.00` | **`$0.00`** | `$0.00` (fails requirements) |

---

## 4. Proposed DNS Design (Prepared Only — **Zero Changes Until Approval D**)

> **Preservation Rule:** Existing Resend DKIM TXT records (`resend._domainkey.jobiest.com`) and SPF includes MUST be merged/retained, never deleted, so automated `no-reply@jobiest.com` verification emails continue uninterrupted.

| Record Type | Host / Name | Proposed Value (Template) | TTL | Purpose |
|---|---|---|---|---|
| `A` | `mail.jobiest.com` | `<MAIL_PUBLIC_IP>` | `300` (`60` at cutover) | Primary MX / IMAPS / Submission endpoint |
| `CNAME` | `webmail.jobiest.com` | `mail.jobiest.com.` | `300` | Dedicated Webmail HTTPS login portal |
| `CNAME` | `autoconfig.jobiest.com` | `mail.jobiest.com.` | `300` | Thunderbird / mobile IMAP+SMTP auto-discovery |
| `SRV` | `_autodiscover._tcp.jobiest.com` | `0 1 443 mail.jobiest.com.` | `3600` | Outlook / mobile client discovery |
| `MX` | `jobiest.com` | `10 mail.jobiest.com.` | `300` | Routes inbound `*@jobiest.com` to self-hosted inboxes *(replaces ForwardEmail MX ONLY at Approval E after staging proof)* |
| `TXT` | `jobiest.com` | `"v=spf1 include:_spf.resend.com ip4:<MAIL_PUBLIC_IP> -all"` *(or `+ relay SPF include`)* | `300` | Authorizes both Resend transactional API and mail server/relay |
| `TXT` | `dkim._domainkey.jobiest.com` | `"v=DKIM1; k=rsa; p=<2048-BIT-MAILU-PUBKEY>"` | `3600` | Mailu/Stalwart 2048-bit DKIM selector (coexists alongside `resend._domainkey`) |
| `TXT` | `_dmarc.jobiest.com` | `"v=DMARC1; p=quarantine; rua=mailto:admin@jobiest.com; adkim=s; aspf=r"` | `3600` | Enforces SPF/DKIM alignment & spoofing telemetry |
| `TXT` | `_mta-sts.jobiest.com` | `"v=STSv1; id=20261101"` (+ HTTPS policy on `mta-sts.jobiest.com`) | `3600` | Enforces inbound STARTTLS encryption |
| `TXT` | `_smtp._tls.jobiest.com` | `"v=TLSRPTv1; rua=mailto:admin@jobiest.com"` | `3600` | Inbound TLS failure reporting |

---

## 5. Preserving Resend vs Self-Hosted Mailboxes (Recommended Long-Term Split)
- **Keep Resend (`lib/email/resend.ts`, `no-reply@jobiest.com`) for automated SaaS transactional emails:** Signup 6-digit codes, Google/LinkedIn OAuth verification codes, password resets, and MFA alerts are business-critical auth paths where sub-second API reliability directly governs user conversion.
- **Use `jobiest-mail` (`Mailu` / `Stalwart`) for all human & departmental mailboxes:** `admin@`, `support@`, `hello@`, `careers@`, `staff@`, `finance@`, `privacy@`, and `philip@jobiest.com` — giving you full Webmail, iOS/Android/Desktop IMAP+SMTP, per-mailbox quotas, aliases, admin suspension/reset, and encrypted off-instance mailbox backups.
- **Stage Testing Safely Before Touching `jobiest.com` MX:** Test all 16 email checks (mailbox creation, Webmail, IMAP `993`, SMTP `465/587`, open-relay rejection, internal delivery, external inbound/outbound via temporary subdomain e.g. `testuser@mail.jobiest.com` before changing root `@jobiest.com` MX!).
