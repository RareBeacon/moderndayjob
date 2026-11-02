# Jobiest `$0.00/Month` Self-Hosted Email Infrastructure (`deploy/oci-mail`)

This directory contains the complete, production-hardened deployment bundle for self-hosting Jobiest's corporate & departmental mailboxes (`@jobiest.com`) AND high-deliverability app transactional SMTP at **`$0.00/month`**.

---

## 1. Architecture Overview (Why This Costs `$0/mo` AND Lands in Primary Inboxes)

```text
  External Senders (Gmail / Outlook / Candidates / US & UK Employers)
          |
          |  Inbound SMTP (TCP :25 - allowed on OCI Always Free)
          v
+-------------------------------------------------------------------------+
| Oracle Cloud Always Free VM.Standard.E2.1.Micro (jobiest-mail, 1GB RAM) |
|  - Caddy 2.8 Auto-TLS (:80/:443) -> webmail.jobiest.com & mta-sts       |
|  - Stalwart Mail Server (Rust, ~450 MiB RSS):                           |
|      * IMAPS (:993) & JMAP for iPhone / Android / Desktop Mail          |
|      * Authenticated Submission (:465 TLS / :587 STARTTLS)              |
|      * Built-in Spam/Phishing Filter + Sieve + 2048-bit DKIM            |
|  - SnappyMail Webmail (https://webmail.jobiest.com)                     |
+------------------------------------+------------------------------------+
                                     |
          Outbound Authenticated TLS (:587 / :465) - bypasses OCI Port 25 block
                                     v
       +-----------------------------+-----------------------------+
       |                                                           |
       v                                                           v
[ Brevo Free Relay ]                                    [ Resend Free Relay ]
  300/day (~9,000/mo, $0)                                 100/day (3,000/mo, $0)
  Pre-warmed PTR-verified IPs                             Pre-warmed PTR-verified IPs
```

Meanwhile, the **Jobiest Next.js App on Vercel** (`lib/email/transport.ts`) automatically routes transactional emails across **`smtp` (`mail.jobiest.com:465`) -> `brevo` (`9,000/mo` free) -> `resend` (`3,000/mo` free)** with zero-downtime failover, giving **`~12,000` free inbox-placed emails/month** (`4x` Resend's standalone cap) at `$0.00/month`.

---

## 2. Quickstart Deployment (15 Minutes)

### Step A - Provision the Always-Free Mail VM (`$0.00/mo`)
Run from Oracle Cloud Shell or any machine with `oci` CLI configured:
```bash
chmod +x ops/oci-preservation/gate5_oci_mail_provision_and_deploy.sh
COMPARTMENT_ID="ocid1.tenancy.oc1..aaaaaaaaotqioawqblmo7go2ssnnmy3hmxth5aeumq55prfzdnpnwx6k74wq" \
SUBNET_ID="ocid1.subnet.oc1.us-chicago-1.aaaaaaaa6onpywxkeogb6wadpusauqzeiwibfda5xpqvjizcr3teoxkdlvva" \
TRUSTED_SSH_CIDR="$(curl -fsS https://checkip.amazonaws.com)/32" \
./ops/oci-preservation/gate5_oci_mail_provision_and_deploy.sh
```
*(Also add Ingress TCP rules for ports `25, 80, 443, 465, 587, 993` on a dedicated Network Security Group attached only to `jobiest-mail`.)*

### Step B - Add Staging DNS Records (Cloudflare DNS - Grey Cloud / DNS-Only on `mail`)
| Type | Name | Target / Value | Proxy Status |
| --- | --- | --- | --- |
| `A` | `mail` | `<MAIL_PUBLIC_IP>` | **DNS only (Grey cloud)** |
| `CNAME` | `webmail` | `mail.jobiest.com` | DNS only |
| `CNAME` | `mta-sts` | `mail.jobiest.com` | DNS only |
| `TXT` | `_mta-sts` | `v=STSv1; id=20261101` | DNS only |
| `TXT` | `_smtp._tls` | `v=TLSRPTv1; rua=mailto:admin@jobiest.com` | DNS only |

### Step C - Boot Stack & Provision All `@jobiest.com` Mailboxes
```bash
scp -r ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci-mail/* ubuntu@<MAIL_PUBLIC_IP>:/tmp/oci-mail/
ssh ubuntu@<MAIL_PUBLIC_IP>
sudo mv /tmp/oci-mail/* /opt/jobiest-mail/
cd /opt/jobiest-mail
sudo cp .env.example .env && sudo chmod 600 .env
sudo nano .env   # Set STALWART_ADMIN_PASSWORD, RELAY_USER/PASSWORD (Brevo Free), and BACKUP_ENCRYPTION_PASSPHRASE
sudo docker compose up -d
sudo chmod +x bootstrap-mailboxes.sh backup-mailboxes.sh
sudo ./bootstrap-mailboxes.sh
```
This automatically creates:
- `philip@jobiest.com` (aliases: `ceo@`, `founder@`)
- `admin@jobiest.com` (aliases: `postmaster@`, `abuse@`, `dmarc@`)
- `support@jobiest.com` (alias: `help@`)
- `hello@jobiest.com` (aliases: `info@`, `contact@`)
- `careers@jobiest.com` (aliases: `jobs@`, `apply@`, `talent@`)
- `partnerships@jobiest.com` (aliases: `partners@`, `employers@`, `bd@`)
- `finance@jobiest.com` (aliases: `billing@`, `invoices@`)
- `privacy@jobiest.com` (aliases: `dpo@`, `legal@`, `security@`)
- `no-reply@jobiest.com` (alias: `notifications@` - for Vercel app SMTP)

### Step D - Publish DKIM, SPF & Cut Over Root `MX`
1. Copy the generated `mail._domainkey.jobiest.com` TXT public key from `https://mail.jobiest.com` into Cloudflare DNS (keep `resend._domainkey` intact alongside it!).
2. Update root SPF TXT to authorize all active senders:
   `v=spf1 include:_spf.resend.com include:spf.brevo.com ip4:<MAIL_PUBLIC_IP> ~all`
3. Open **`https://jobiest.com/admin/email`**, click **Verify SMTP Handshake** and **Send Test Email to Admin Inbox**.
4. Once inbound/outbound tests pass, switch `jobiest.com` `MX` (`priority 10`) to `mail.jobiest.com` and schedule nightly encrypted backups:
   `echo "15 3 * * * root /opt/jobiest-mail/backup-mailboxes.sh >> /var/log/jobiest-mail-backup.log 2>&1" | sudo tee /etc/cron.d/jobiest-mail-backup`

---

## 3. Connecting Vercel & Supabase Auth to Your Self-Hosted Email Engine

In **Vercel Project Environment Variables** (`jobiest.com`), add:
```env
TRANSACTIONAL_STRATEGY=auto
EMAIL_PROVIDER_ORDER=smtp,brevo,resend
SMTP_HOST=mail.jobiest.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@jobiest.com
SMTP_PASSWORD=<password from /root/.jobiest-mailboxes.secret>
BREVO_API_KEY=<optional free xkeysib-... key for +9,000/mo HTTP failover>
STALWART_API_URL=https://mail.jobiest.com
STALWART_ADMIN_USER=postmaster
STALWART_ADMIN_PASSWORD=<your STALWART_ADMIN_PASSWORD from /opt/jobiest-mail/.env>
```
*(You can also enter `mail.jobiest.com:465` + `no-reply@jobiest.com` directly under **Supabase Dashboard -> Authentication -> SMTP Settings** to lift Supabase Auth's default rate limit for `$0/mo`!)*

---

## 4. Admin Paths, Creating Staff Mailboxes & Staff Webmail Link

| Surface | Permanent URL | Who Uses It |
| --- | --- | --- |
| **Jobiest Email Admin Panel** | **`https://jobiest.com/admin/email`** | **Owner (`Philip`)**: Monitor transports/DNS, test SMTP, and create or reset staff `@jobiest.com` mailboxes in 1 click |
| **Stalwart Mail Server Admin** | **`https://mail.jobiest.com`** | **Owner (`postmaster` + 2FA)**: Low-level mail queues, DKIM keys, spam filter rules, domain settings |
| **Staff Webmail Inbox Portal** | **`https://webmail.jobiest.com`** | **All Staff & Founders**: Browser inbox (like Gmail/Workspace) to read, search, and send `@jobiest.com` email |

### Creating a New Staff Business Email & Password (3 Ways)
1. **1-Click from Jobiest Admin (`https://jobiest.com/admin/email`)**:
   Open **Section 3 ("Create or Reset Staff `@jobiest.com` Business Mailbox")**, enter username (e.g. `ada.okafor`), full name/role, and quota, click **Create / Reset Mailbox**, then click **Copy Staff Login Card** to send them their temporary password and **`https://webmail.jobiest.com`** login link.
2. **1-Command CLI on the Mail VM**:
   ```bash
   sudo /opt/jobiest-mail/create-staff-mailbox.sh ada.okafor@jobiest.com "Adaobi Okafor (Support)" 3
   ```
3. **Stalwart WebAdmin Console (`https://mail.jobiest.com`)**:
   Sign in as `postmaster` -> **Directory -> Accounts -> Create Account**.
