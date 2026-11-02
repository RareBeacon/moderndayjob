#!/usr/bin/env bash
# ==============================================================================
# JOBIEST ONE-PASTE ORACLE CLOUD SHELL SELF-HOSTED EMAIL ACTIVATOR ($0.00/MO)
# ==============================================================================
# Paste ONE command into Oracle Cloud Shell (us-chicago-1) to run end-to-end:
#   1. Verifies $0.00/mo Always Free compute & <= 200 GB regional storage cap.
#   2. Creates isolated NSG `jobiest-mail-nsg` (SSH restricted to your /32 IP;
#      ports 25, 80, 443, 465, 587, 993 open; shared Subnet SL untouched).
#   3. Provisions `jobiest-mail` on Always Free `VM.Standard.E2.1.Micro` (or
#      Always Free `VM.Standard.A1.Flex` 1 OCPU / 6 GB if E2.1.Micro hardware is
#      absent in us-chicago-1, or safely co-hosts on `jobiest-a1` if A1 quota is
#      already allocated).
#   4. Configures 2 GiB swap, Fail2ban, UFW, Docker Compose, Stalwart Mail
#      Server + SnappyMail Webmail + Caddy Auto-TLS & MTA-STS.
#   5. Creates all 9 @jobiest.com mailboxes + aliases, configures SnappyMail
#      domain login automatically, generates 2048-bit DKIM, schedules nightly
#      AES-256 encrypted backups, and stores credentials in
#      ~/.ssh/jobiest_mail_credentials.txt (chmod 600).
#   6. Automatically updates Vercel env vars + triggers redeploy if VERCEL_TOKEN
#      is set, and updates Cloudflare DNS if CF_API_TOKEN is set — OR outputs
#      a single ready-to-import Vercel .env block + exact DNS table!
# ==============================================================================
set -euo pipefail
export OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True

REGION="${OCI_REGION:-us-chicago-1}"
TENANCY_ID="${TENANCY_ID:-ocid1.tenancy.oc1..aaaaaaaaotqioawqblmo7go2ssnnmy3hmxth5aeumq55prfzdnpnwx6k74wq}"
SUBNET_ID="${SUBNET_ID:-ocid1.subnet.oc1.us-chicago-1.aaaaaaaa6onpywxkeogb6wadpusauqzeiwibfda5xpqvjizcr3teoxkdlvva}"
MAIL_DISPLAY_NAME="${MAIL_DISPLAY_NAME:-jobiest-mail}"
MAIL_NSG_NAME="${MAIL_NSG_NAME:-jobiest-mail-nsg}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-jobiest.com}"
REPO_URL="https://github.com/RareBeacon/moderndayjob.git"

# Optional automated hooks (if exported before running, script configures them automatically!)
VERCEL_TOKEN="${VERCEL_TOKEN:-}"
VERCEL_PROJECT="${VERCEL_PROJECT:-modernjob}"
CF_API_TOKEN="${CF_API_TOKEN:-}"
BREVO_SMTP_LOGIN="${BREVO_SMTP_LOGIN:-}"
BREVO_SMTP_KEY="${BREVO_SMTP_KEY:-}"
BREVO_API_KEY_OPT="${BREVO_API_KEY:-}"

SSH_DIR="$HOME/.ssh"
mkdir -p "$SSH_DIR" && chmod 700 "$SSH_DIR"
MAIL_SSH_PRIV="$SSH_DIR/jobiest_mail_rsa"
MAIL_SSH_PUB="$SSH_DIR/jobiest_mail_rsa.pub"
CREDS_OUT_FILE="$SSH_DIR/jobiest_mail_credentials.txt"

WORK_DIR="$(umask 077 && mktemp -d /tmp/jobiest-mail-activate.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

banner() {
  printf '\n==============================================================================\n'
  printf '[%s] %s\n' "$(date -u '+%H:%M:%SZ')" "$1"
  printf '==============================================================================\n'
}

die() {
  printf '\n[FATAL] %s\n' "$1" >&2
  exit 1
}

banner "PHASE 1/5: Verifying OCI Always-Free Guardrails & Operator IP ($REGION)"

MY_IP="$(curl -fsS --max-time 8 https://checkip.amazonaws.com | tr -d '[:space:]' || curl -fsS --max-time 8 https://ifconfig.me | tr -d '[:space:]')"
[[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Could not determine valid public IPv4 for SSH restriction (got '$MY_IP')."
TRUSTED_SSH_CIDR="${TRUSTED_SSH_CIDR:-${MY_IP}/32}"
printf '  -> Operator Cloud Shell Egress CIDR : %s\n' "$TRUSTED_SSH_CIDR"

SUBNET_VCN_ID="$(oci network subnet get --region "$REGION" --subnet-id "$SUBNET_ID" --query 'data."vcn-id"' --raw-output)"
printf '  -> Verified VCN                     : %s\n' "$SUBNET_VCN_ID"

# Create/reconcile isolated VNIC NSG (shared production Security List stays 100% untouched)
NSG_SEARCH="$(oci network nsg list --region "$REGION" --compartment-id "$TENANCY_ID" --vcn-id "$SUBNET_VCN_ID" --display-name "$MAIL_NSG_NAME" --all)"
MAIL_NSG_ID="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
live = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") == "AVAILABLE"]
print(live[0]["id"] if live else "")
' <<<"$NSG_SEARCH")"

if [[ -z "$MAIL_NSG_ID" ]]; then
  MAIL_NSG_ID="$(oci network nsg create \
    --region "$REGION" \
    --compartment-id "$TENANCY_ID" \
    --vcn-id "$SUBNET_VCN_ID" \
    --display-name "$MAIL_NSG_NAME" \
    --query 'data.id' --raw-output)"
  printf '  -> Created isolated NSG %s (%s)\n' "$MAIL_NSG_NAME" "$MAIL_NSG_ID"
else
  printf '  -> Reusing isolated NSG %s (%s)\n' "$MAIL_NSG_NAME" "$MAIL_NSG_ID"
fi

EXISTING_RULE_IDS="$(oci network nsg rules list --region "$REGION" --nsg-id "$MAIL_NSG_ID" --all | \
  python3 -c 'import json,sys; s=sys.stdin.read().strip(); ids=[x["id"] for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("id")]; print(json.dumps(ids) if ids else "")')"
if [[ -n "$EXISTING_RULE_IDS" ]]; then
  oci network nsg rules remove --region "$REGION" --nsg-id "$MAIL_NSG_ID" --security-rule-ids "$EXISTING_RULE_IDS" >/dev/null
fi

NSG_RULES_JSON="$WORK_DIR/nsg_rules.json"
python3 - "$TRUSTED_SSH_CIDR" "$NSG_RULES_JSON" <<'PY'
import json, sys
ssh_cidr, out_path = sys.argv[1], sys.argv[2]
rules = [
    {"direction": "EGRESS", "destination": "0.0.0.0/0", "destinationType": "CIDR_BLOCK", "protocol": "all", "description": "Allow outbound HTTPS/DNS/TLS-Relay"},
    {"direction": "INGRESS", "source": ssh_cidr, "sourceType": "CIDR_BLOCK", "protocol": "6", "description": "Restricted Cloud Shell SSH", "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}},
    {"direction": "INGRESS", "source": "10.0.1.0/24", "sourceType": "CIDR_BLOCK", "protocol": "6", "description": "VCN internal SSH", "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}},
]
for port, desc in ((25, "Inbound MX SMTP"), (80, "ACME HTTP-01"), (443, "HTTPS Webmail/Admin/MTA-STS"), (465, "Implicit TLS Submission"), (587, "STARTTLS Submission"), (993, "IMAPS"), (4190, "ManageSieve")):
    rules.append({
        "direction": "INGRESS",
        "source": "0.0.0.0/0",
        "sourceType": "CIDR_BLOCK",
        "protocol": "6",
        "description": desc,
        "tcpOptions": {"destinationPortRange": {"min": port, "max": port}},
    })
json.dump(rules, open(out_path, "w", encoding="utf-8"))
PY
oci network nsg rules add --region "$REGION" --nsg-id "$MAIL_NSG_ID" --security-rules "file://${NSG_RULES_JSON}" >/dev/null
printf '  -> Applied strict mail + /32 SSH rules on %s\n' "$MAIL_NSG_NAME"

if [[ ! -f "$MAIL_SSH_PRIV" || ! -f "$MAIL_SSH_PUB" ]]; then
  rm -f "$MAIL_SSH_PRIV" "$MAIL_SSH_PUB"
  ssh-keygen -t ed25519 -N "" -C "jobiest-mail-admin" -f "$MAIL_SSH_PRIV" >/dev/null
  chmod 600 "$MAIL_SSH_PRIV" && chmod 644 "$MAIL_SSH_PUB"
  printf '  -> Generated dedicated SSH keypair  : %s\n' "$MAIL_SSH_PRIV"
fi

compute_total_storage_gb() {
  local total=0
  local ads_json
  ads_json="$(oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --query 'data[*].name' --raw-output)"
  for ad in $(python3 -c 'import json,sys; print(" ".join(json.loads(sys.stdin.read())))' <<<"$ads_json"); do
    local bv vol
    bv="$(oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
      python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); print(sum(int(x.get("size-in-gbs",0)) for x in d if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
    vol="$(oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
      python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); print(sum(int(x.get("size-in-gbs",0)) for x in d if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
    total=$(( total + bv + vol ))
  done
  echo "$total"
}

banner "PHASE 2/5: Allocating $0.00/mo Always-Free Mail Host ($MAIL_DISPLAY_NAME)"

COHOST_MODE=0
TARGET_SSH_KEY="$MAIL_SSH_PRIV"
MAIL_INSTANCE_ID="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$MAIL_DISPLAY_NAME" --all | \
  python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); live=[x["id"] for x in d if x.get("lifecycle-state") in ("RUNNING","PROVISIONING","STARTING")]; print(live[0] if live else "")')"

if [[ -n "$MAIL_INSTANCE_ID" ]]; then
  printf '  -> Reusing existing %s (%s)\n' "$MAIL_DISPLAY_NAME" "$MAIL_INSTANCE_ID"
else
  CUR_STORAGE_GB="$(compute_total_storage_gb)"
  printf '  -> Current regional block+boot storage: %d / 200 GB Always Free limit\n' "$CUR_STORAGE_GB"

  ADS_LIST="$(oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --query 'data[*].name' --raw-output | python3 -c 'import json,sys; print(" ".join(json.loads(sys.stdin.read())))')"

  # Strategy 2A: Try VM.Standard.E2.1.Micro if physically present in region AND storage <= 150 GB
  if (( CUR_STORAGE_GB + 50 <= 200 )); then
    for ad in $ADS_LIST; do
      HAS_MICRO="$(oci compute shape list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
        python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); print("1" if any(x.get("shape")=="VM.Standard.E2.1.Micro" for x in d) else "0")')"
      MICRO_AV="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-e2-micro-core-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
      if [[ "$HAS_MICRO" == "1" ]] && python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) >= 1.0 else 1)' "${MICRO_AV:-0}"; then
        IMG_ID="$(oci compute image list --region "$REGION" --compartment-id "$TENANCY_ID" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "VM.Standard.E2.1.Micro" --sort-by TIMECREATED --sort-order DESC --all | \
          python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); imgs=[x["id"] for x in d if "aarch64" not in x.get("display-name","").lower() and "minimal" not in x.get("display-name","").lower()]; print(imgs[0] if imgs else "")')"
        if [[ -n "$IMG_ID" ]]; then
          printf '  -> Launching %s (VM.Standard.E2.1.Micro, 50 GB, $0/mo) in %s...\n' "$MAIL_DISPLAY_NAME" "$ad"
          MAIL_INSTANCE_ID="$(oci compute instance launch \
            --region "$REGION" \
            --compartment-id "$TENANCY_ID" \
            --availability-domain "$ad" \
            --shape "VM.Standard.E2.1.Micro" \
            --display-name "$MAIL_DISPLAY_NAME" \
            --image-id "$IMG_ID" \
            --subnet-id "$SUBNET_ID" \
            --assign-public-ip true \
            --nsg-ids "[\"${MAIL_NSG_ID}\"]" \
            --boot-volume-size-in-gbs 50 \
            --ssh-authorized-keys-file "$MAIL_SSH_PUB" \
            --wait-for-state RUNNING \
            --query 'data.id' --raw-output 2>/dev/null || true)"
          [[ -n "$MAIL_INSTANCE_ID" ]] && break
        fi
      fi
    done
  fi

  # Strategy 2B: If E2.1.Micro hardware isn't offered in us-chicago-1, try Always Free VM.Standard.A1.Flex (1 OCPU / 6 GB)
  if [[ -z "$MAIL_INSTANCE_ID" ]] && (( CUR_STORAGE_GB + 50 <= 200 )); then
    for ad in $ADS_LIST; do
      A1_AV="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-a1-core-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
      if python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) >= 1.0 else 1)' "${A1_AV:-0}"; then
        A1_IMG_ID="$(oci compute image list --region "$REGION" --compartment-id "$TENANCY_ID" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "VM.Standard.A1.Flex" --sort-by TIMECREATED --sort-order DESC --all | \
          python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); imgs=[x["id"] for x in d if "aarch64" in x.get("display-name","").lower() and "minimal" not in x.get("display-name","").lower()]; print(imgs[0] if imgs else "")')"
        if [[ -n "$A1_IMG_ID" ]]; then
          printf '  -> Launching %s (Always Free VM.Standard.A1.Flex 1 OCPU / 6 GB, 50 GB, $0/mo) in %s...\n' "$MAIL_DISPLAY_NAME" "$ad"
          MAIL_INSTANCE_ID="$(oci compute instance launch \
            --region "$REGION" \
            --compartment-id "$TENANCY_ID" \
            --availability-domain "$ad" \
            --shape "VM.Standard.A1.Flex" \
            --shape-config '{"ocpus":1,"memoryInGBs":6}' \
            --display-name "$MAIL_DISPLAY_NAME" \
            --image-id "$A1_IMG_ID" \
            --subnet-id "$SUBNET_ID" \
            --assign-public-ip true \
            --nsg-ids "[\"${MAIL_NSG_ID}\"]" \
            --boot-volume-size-in-gbs 50 \
            --ssh-authorized-keys-file "$MAIL_SSH_PUB" \
            --wait-for-state RUNNING \
            --query 'data.id' --raw-output 2>/dev/null || true)"
          [[ -n "$MAIL_INSTANCE_ID" ]] && break
        fi
      fi
    done
  fi

  # Strategy 2C: If jobiest-a1 already exists and holds A1 quota (or storage == 200 GB), co-host cleanly on jobiest-a1 ($0/mo, 0 extra GB)
  if [[ -z "$MAIL_INSTANCE_ID" ]]; then
    EXISTING_A1_ID="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "jobiest-a1" --all | \
      python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); live=[x["id"] for x in d if x.get("lifecycle-state")=="RUNNING"]; print(live[0] if live else "")')"
    if [[ -n "$EXISTING_A1_ID" && -f "$SSH_DIR/jobiest_a1_rsa" ]]; then
      printf '  -> Co-hosting mail stack on Always Free jobiest-a1 (%s) — 0 extra storage, $0.00/mo!\n' "$EXISTING_A1_ID"
      MAIL_INSTANCE_ID="$EXISTING_A1_ID"
      TARGET_SSH_KEY="$SSH_DIR/jobiest_a1_rsa"
      COHOST_MODE=1
    else
      die "No free Always-Free VM slot or storage available (projected > 200 GB or A1 capacity temporarily full). Retrying later is 100% safe."
    fi
  fi
fi

# Ensure NSG is attached to target VNIC & resolve public IP
VNIC_ID="$(oci compute vnic-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --instance-id "$MAIL_INSTANCE_ID" --all | \
  python3 -c 'import json,sys; d=(json.loads(sys.stdin.read() or "{}").get("data") or []); live=[x["vnic-id"] for x in d if x.get("lifecycle-state")=="ATTACHED"]; print(live[0] if live else "")')"
[[ -n "$VNIC_ID" ]] || die "Could not resolve attached VNIC on $MAIL_INSTANCE_ID"

EXISTING_NSGS="$(oci network vnic get --region "$REGION" --vnic-id "$VNIC_ID" --query 'data."nsg-ids"' --raw-output)"
UPDATED_NSGS="$(python3 -c 'import json,sys; cur=json.loads(sys.argv[1] or "[]"); nsg=sys.argv[2]; cur.append(nsg) if nsg not in cur else None; print(json.dumps(cur))' "$EXISTING_NSGS" "$MAIL_NSG_ID")"
oci network vnic update --region "$REGION" --vnic-id "$VNIC_ID" --nsg-ids "$UPDATED_NSGS" --force >/dev/null
MAIL_PUBLIC_IP="$(oci network vnic get --region "$REGION" --vnic-id "$VNIC_ID" --query 'data."public-ip"' --raw-output)"
printf '  -> Active Mail Server Public IP     : %s\n' "$MAIL_PUBLIC_IP"

banner "PHASE 3/5: Deploying Stalwart + SnappyMail + Caddy & Provisioning @jobiest.com Mailboxes"

git clone --depth 1 "$REPO_URL" "$WORK_DIR/repo" >/dev/null 2>&1
BUNDLE_DIR="$WORK_DIR/repo/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci-mail"

SSH_COMMON=(-i "$TARGET_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=15)
printf '  -> Waiting for SSH readiness on ubuntu@%s...\n' "$MAIL_PUBLIC_IP"
SSH_OK=0
for _ in $(seq 1 30); do
  if ssh "${SSH_COMMON[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "echo ready" >/dev/null 2>&1; then
    SSH_OK=1
    break
  fi
  sleep 5
done
[[ "$SSH_OK" -eq 1 ]] || die "SSH did not become ready on ubuntu@${MAIL_PUBLIC_IP}"

scp "${SSH_COMMON[@]}" -r "$BUNDLE_DIR" "ubuntu@${MAIL_PUBLIC_IP}:/tmp/oci-mail-bundle" >/dev/null

ssh "${SSH_COMMON[@]}" "ubuntu@${MAIL_PUBLIC_IP}" \
  "COHOST_MODE='${COHOST_MODE}' TRUSTED_SSH_CIDR='${TRUSTED_SSH_CIDR}' BREVO_SMTP_LOGIN='${BREVO_SMTP_LOGIN}' BREVO_SMTP_KEY='${BREVO_SMTP_KEY}' bash -s" <<'REMOTE_SETUP'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ufw fail2ban docker.io docker-compose-v2 curl jq openssl python3 >/dev/null
  sudo systemctl enable --now docker fail2ban >/dev/null
fi

if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  sudo sysctl -w vm.swappiness=10 >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf >/dev/null
fi

sudo ufw allow from "${TRUSTED_SSH_CIDR}" to any port 22 proto tcp >/dev/null || true
for p in 25 80 443 465 587 993 4190; do
  sudo ufw allow "${p}/tcp" >/dev/null || true
done
sudo ufw --force enable >/dev/null || true

sudo mkdir -p /opt/jobiest-mail
sudo chmod 700 /opt/jobiest-mail
sudo cp -f /tmp/oci-mail-bundle/* /tmp/oci-mail-bundle/.env.example /opt/jobiest-mail/
rm -rf /tmp/oci-mail-bundle
sudo chmod +x /opt/jobiest-mail/*.sh

if [[ ! -f /opt/jobiest-mail/.env ]]; then
  ADMIN_PW="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 28)"
  BACKUP_PW="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"
  sudo cp /opt/jobiest-mail/.env.example /opt/jobiest-mail/.env
  sudo chmod 600 /opt/jobiest-mail/.env
  sudo sed -i "s|REPLACE_WITH_32_CHAR_RANDOM_SECRET|${ADMIN_PW}|g" /opt/jobiest-mail/.env
  sudo sed -i "s|REPLACE_WITH_STRONG_BACKUP_PASSPHRASE|${BACKUP_PW}|g" /opt/jobiest-mail/.env
fi

if [[ -n "${BREVO_SMTP_LOGIN:-}" && -n "${BREVO_SMTP_KEY:-}" ]]; then
  sudo sed -i "s|^RELAY_USER=.*|RELAY_USER=${BREVO_SMTP_LOGIN}|g" /opt/jobiest-mail/.env
  sudo sed -i "s|^RELAY_PASSWORD=.*|RELAY_PASSWORD=${BREVO_SMTP_KEY}|g" /opt/jobiest-mail/.env
fi

cd /opt/jobiest-mail
if [[ "${COHOST_MODE}" == "1" ]] && sudo ss -tlnp | grep -q ':443 '; then
  # Existing Caddy already serves :80/:443 on jobiest-a1; bind SnappyMail on 127.0.0.1:8888 and start stalwart+snappymail only
  sudo python3 - <<'PY'
p = "/opt/jobiest-mail/docker-compose.yml"
txt = open(p).read()
if "127.0.0.1:8888:8888" not in txt:
    txt = txt.replace("    environment:\n      - TZ=UTC\n      - UPLOAD_MAX_SIZE=25M", "    ports:\n      - \"127.0.0.1:8888:8888\"\n    environment:\n      - TZ=UTC\n      - UPLOAD_MAX_SIZE=25M")
open(p, "w").write(txt)
PY
  sudo docker compose up -d stalwart snappymail
else
  sudo docker compose up -d
fi

sudo /opt/jobiest-mail/bootstrap-mailboxes.sh

echo "15 3 * * * root /opt/jobiest-mail/backup-mailboxes.sh >> /var/log/jobiest-mail-backup.log 2>&1" | sudo tee /etc/cron.d/jobiest-mail-backup >/dev/null
sudo chmod 644 /etc/cron.d/jobiest-mail-backup
REMOTE_SETUP

banner "PHASE 4/5: Fetching Generated Credentials & DKIM Key into Cloud Shell Vault"

REMOTE_DATA="$(ssh "${SSH_COMMON[@]}" "ubuntu@${MAIL_PUBLIC_IP}" 'sudo bash -s' <<'FETCH_INFO'
set -euo pipefail
source /opt/jobiest-mail/.env
NO_REPLY_PW="$(awk -F'\t' '$2=="no-reply@jobiest.com" {val=$3} END{print val}' /root/.jobiest-mailboxes.secret)"
DKIM_JSON="$(curl -fsS -u "${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}" http://127.0.0.1:8080/api/dkim 2>/dev/null || echo '{}')"
echo "ADMIN_USER=${STALWART_ADMIN_USER}"
echo "ADMIN_PW=${STALWART_ADMIN_PASSWORD}"
echo "NO_REPLY_PW=${NO_REPLY_PW}"
echo "---MAILBOX_VAULT_BEGIN---"
cat /root/.jobiest-mailboxes.secret
echo "---MAILBOX_VAULT_END---"
echo "---DKIM_BEGIN---"
echo "$DKIM_JSON"
echo "---DKIM_END---"
FETCH_INFO
)"

STALWART_ADMIN_USER_VAL="$(grep '^ADMIN_USER=' <<<"$REMOTE_DATA" | head -n1 | cut -d= -f2-)"
STALWART_ADMIN_PW_VAL="$(grep '^ADMIN_PW=' <<<"$REMOTE_DATA" | head -n1 | cut -d= -f2-)"
NO_REPLY_PW_VAL="$(grep '^NO_REPLY_PW=' <<<"$REMOTE_DATA" | head -n1 | cut -d= -f2-)"

umask 077
cat > "$CREDS_OUT_FILE" <<EOF
# Jobiest Self-Hosted Mail Server Credentials (Generated $(date -u +%Y-%m-%dT%H:%M:%SZ))
# Strictly chmod 600 in your Oracle Cloud Shell ($CREDS_OUT_FILE)

Mail Server Public IP : ${MAIL_PUBLIC_IP}
Staff Webmail Portal  : https://webmail.jobiest.com
Stalwart Admin Console: https://mail.jobiest.com
Stalwart Admin Login  : ${STALWART_ADMIN_USER_VAL}
Stalwart Admin Pass   : ${STALWART_ADMIN_PW_VAL}

--- Initial @jobiest.com Mailbox Passwords (Timestamp | Email | Password) ---
$(sed -n '/---MAILBOX_VAULT_BEGIN---/,/---MAILBOX_VAULT_END---/{/---MAILBOX_VAULT_/d;p;}' <<<"$REMOTE_DATA")
EOF
chmod 600 "$CREDS_OUT_FILE"
printf '  -> Saved all @jobiest.com credentials safely to: %s (chmod 600)\n' "$CREDS_OUT_FILE"

VERCEL_ENV_HELPER="$SSH_DIR/print_vercel_mail_env.sh"
cat > "$VERCEL_ENV_HELPER" <<EOF
#!/usr/bin/env bash
cat <<'ENVBLOCK'
TRANSACTIONAL_STRATEGY=auto
EMAIL_PROVIDER_ORDER=smtp,brevo,resend
SMTP_HOST=mail.jobiest.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@jobiest.com
STALWART_API_URL=https://mail.jobiest.com
STALWART_ADMIN_USER=${STALWART_ADMIN_USER_VAL}
ENVBLOCK
echo "SMTP_PASSWORD=${NO_REPLY_PW_VAL}"
echo "STALWART_ADMIN_PASSWORD=${STALWART_ADMIN_PW_VAL}"
EOF
chmod 700 "$VERCEL_ENV_HELPER"

# Optional automated Vercel Environment Variables sync if VERCEL_TOKEN was supplied
if [[ -n "$VERCEL_TOKEN" && -n "$NO_REPLY_PW_VAL" ]]; then
  banner "PHASE 4B: Automatically Updating Vercel Environment Variables ($VERCEL_PROJECT)"
  upsert_vercel_env() {
    local k="$1" v="$2" t="$3"
    curl -fsS -X POST "https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env?upsert=true" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"key":sys.argv[1],"value":sys.argv[2],"type":sys.argv[3],"target":["production","preview"]}))' "$k" "$v" "$t")" >/dev/null
  }
  upsert_vercel_env "TRANSACTIONAL_STRATEGY" "auto" "plain"
  upsert_vercel_env "EMAIL_PROVIDER_ORDER" "smtp,brevo,resend" "plain"
  upsert_vercel_env "SMTP_HOST" "mail.jobiest.com" "plain"
  upsert_vercel_env "SMTP_PORT" "465" "plain"
  upsert_vercel_env "SMTP_SECURE" "true" "plain"
  upsert_vercel_env "SMTP_USER" "no-reply@jobiest.com" "plain"
  upsert_vercel_env "SMTP_PASSWORD" "$NO_REPLY_PW_VAL" "encrypted"
  upsert_vercel_env "STALWART_API_URL" "https://mail.jobiest.com" "plain"
  upsert_vercel_env "STALWART_ADMIN_USER" "$STALWART_ADMIN_USER_VAL" "plain"
  upsert_vercel_env "STALWART_ADMIN_PASSWORD" "$STALWART_ADMIN_PW_VAL" "encrypted"
  [[ -n "$BREVO_API_KEY_OPT" ]] && upsert_vercel_env "BREVO_API_KEY" "$BREVO_API_KEY_OPT" "encrypted"
  printf '  -> Successfully synced all email environment variables to Vercel project %s!\n' "$VERCEL_PROJECT"

  REPO_ID="$(curl -fsS -H "Authorization: Bearer ${VERCEL_TOKEN}" "https://api.vercel.com/v9/projects/${VERCEL_PROJECT}" | \
    python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "{}"); print((d.get("link") or {}).get("repoId") or "")' 2>/dev/null || true)"
  if [[ -n "$REPO_ID" ]]; then
    curl -fsS -X POST "https://api.vercel.com/v13/deployments" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"${VERCEL_PROJECT}\",\"project\":\"${VERCEL_PROJECT}\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"ref\":\"main\",\"repoId\":${REPO_ID}}}" >/dev/null && \
      printf '  -> Triggered automatic Vercel production redeploy on main!\n' || true
  fi
fi

# Optional automated Cloudflare DNS sync if CF_API_TOKEN was supplied
if [[ -n "$CF_API_TOKEN" ]]; then
  banner "PHASE 4C: Automatically Configuring Staging DNS in Cloudflare ($PRIMARY_DOMAIN)"
  CF_ZONE_ID="$(curl -fsS -H "Authorization: Bearer ${CF_API_TOKEN}" "https://api.cloudflare.com/client/v4/zones?name=${PRIMARY_DOMAIN}" | python3 -c 'import json,sys; r=(json.loads(sys.stdin.read()).get("result") or []); print(r[0]["id"] if r else "")')"
  if [[ -n "$CF_ZONE_ID" ]]; then
    upsert_cf_record() {
      local rtype="$1" rname="$2" rcontent="$3"
      local ex_id
      ex_id="$(curl -fsS -H "Authorization: Bearer ${CF_API_TOKEN}" "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?type=${rtype}&name=${rname}" | python3 -c 'import json,sys; r=(json.loads(sys.stdin.read()).get("result") or []); print(r[0]["id"] if r else "")')"
      local payload
      payload="$(python3 -c 'import json,sys; print(json.dumps({"type":sys.argv[1],"name":sys.argv[2],"content":sys.argv[3],"ttl":300,"proxied":False}))' "$rtype" "$rname" "$rcontent")"
      if [[ -n "$ex_id" ]]; then
        curl -fsS -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" -d "$payload" "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${ex_id}" >/dev/null
      else
        curl -fsS -X POST -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" -d "$payload" "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" >/dev/null
      fi
    }
    upsert_cf_record "A" "mail.${PRIMARY_DOMAIN}" "$MAIL_PUBLIC_IP"
    upsert_cf_record "CNAME" "webmail.${PRIMARY_DOMAIN}" "mail.${PRIMARY_DOMAIN}"
    upsert_cf_record "CNAME" "mta-sts.${PRIMARY_DOMAIN}" "mail.${PRIMARY_DOMAIN}"
    upsert_cf_record "TXT" "_mta-sts.${PRIMARY_DOMAIN}" "v=STSv1; id=20261102"
    upsert_cf_record "TXT" "_smtp._tls.${PRIMARY_DOMAIN}" "v=TLSRPTv1; rua=mailto:admin@${PRIMARY_DOMAIN}"
    printf '  -> Cloudflare DNS records (mail, webmail, mta-sts) configured automatically!\n'
  fi
fi

banner "PHASE 5/5: $0.00/MO SELF-HOSTED EMAIL STACK IS LIVE ON ORACLE CLOUD!"

cat <<SUMMARY
1. YOUR LIVE MAIL SERVER IP:
   ${MAIL_PUBLIC_IP}

2. VIEW YOUR GENERATED @jobiest.com PASSWORDS (philip@, support@, admin@, etc.):
   Run in this Cloud Shell:
     cat ~/.ssh/jobiest_mail_credentials.txt

3. CLOUDFLARE DNS RECORDS (skip if you passed CF_API_TOKEN above):
   - A      mail      -> ${MAIL_PUBLIC_IP}        (DNS-only / Grey Cloud!)
   - CNAME  webmail   -> mail.jobiest.com         (DNS-only)
   - CNAME  mta-sts   -> mail.jobiest.com         (DNS-only)
   - TXT    _mta-sts  -> v=STSv1; id=20261102
   - MX     @         -> mail.jobiest.com (Priority 10 - switch after testing!)
   (Retrieve your DKIM TXT record at https://mail.jobiest.com -> Settings -> DKIM)

4. VERCEL ENVIRONMENT VARIABLES (skip if you passed VERCEL_TOKEN above):
   Run this in Cloud Shell to print your ready-to-import Vercel .env block:
     ~/.ssh/print_vercel_mail_env.sh
   Then in Vercel -> modernjob -> Settings -> Environment Variables -> click "Import .env",
   paste it once, Save, and click Redeploy!

5. PERMANENT TEAM LINKS:
   - Staff Webmail Inbox : https://webmail.jobiest.com
   - Jobiest Email Admin : https://jobiest.com/admin/email
   - Stalwart Console    : https://mail.jobiest.com
SUMMARY
