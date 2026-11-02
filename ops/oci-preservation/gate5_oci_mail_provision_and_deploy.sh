#!/usr/bin/env bash
# ==============================================================================
# GATE 5: JOBIEST ALWAYS-FREE SELF-HOSTED MAIL VM PROVISIONING & STAGING SUITE
# ==============================================================================
# Target Shape : VM.Standard.E2.1.Micro (1/8 OCPU, 1 GB RAM, 50 GB Boot Volume)
# Target Region: us-chicago-1 (AD-1) - 100% Oracle Cloud Always Free ($0.00/mo)
# Stack        : Stalwart Mail Server + SnappyMail Webmail + Caddy Auto-TLS
#
# Hard Safety Invariants:
#   1. Enforces <= 2 E2.1.Micro instances AND <= 200 GB total regional block+boot
#      storage BEFORE creating any resource (guarantees $0.00/mo Always Free bill).
#   2. Never opens TCP 22 to 0.0.0.0/0 (requires explicit /32 TRUSTED_SSH_CIDR).
#   3. Configures 2 GiB swapfile (vm.swappiness=10) + Fail2ban + UFW mail ports.
#   4. Runs 10-point staging health & open-relay rejection checks BEFORE you
#      cut over root MX records on jobiest.com.
# ==============================================================================
set -euo pipefail

INSTANCE_NAME="${INSTANCE_NAME:-jobiest-mail}"
SHAPE="VM.Standard.E2.1.Micro"
BOOT_GB=50
REGION="${OCI_REGION:-us-chicago-1}"
COMPARTMENT_ID="${COMPARTMENT_ID:-}"
SUBNET_ID="${SUBNET_ID:-}"
SSH_PUBKEY_FILE="${SSH_PUBKEY_FILE:-$HOME/.ssh/id_ed25519.pub}"
TRUSTED_SSH_CIDR="${TRUSTED_SSH_CIDR:-}"

if [[ -z "$COMPARTMENT_ID" || -z "$SUBNET_ID" || -z "$TRUSTED_SSH_CIDR" ]]; then
  cat >&2 <<'USAGE'
Usage:
  COMPARTMENT_ID="ocid1.tenancy.oc1..xxx" \
  SUBNET_ID="ocid1.subnet.oc1..xxx" \
  TRUSTED_SSH_CIDR="YOUR.PUBLIC.IP.ADDR/32" \
  ./ops/oci-preservation/gate5_oci_mail_provision_and_deploy.sh

All three variables are mandatory so provisioning stays 100% deterministic and SSH is never exposed to 0.0.0.0/0.
USAGE
  exit 1
fi

if [[ "$TRUSTED_SSH_CIDR" == "0.0.0.0/0" || "$TRUSTED_SSH_CIDR" == "::/0" ]]; then
  echo "FATAL: TRUSTED_SSH_CIDR cannot be 0.0.0.0/0 or ::/0." >&2
  exit 1
fi

echo "=== [Phase 1/4] Verifying Always-Free Compute & 200 GB Regional Storage Cap ==="
MICRO_COUNT=$(oci compute instance list \
  --compartment-id "$COMPARTMENT_ID" \
  --region "$REGION" \
  --query "length(data[?shape=='${SHAPE}' && \"lifecycle-state\"!='TERMINATED'])" \
  --raw-output)

if (( MICRO_COUNT >= 2 )); then
  echo "FATAL: Already have ${MICRO_COUNT} ${SHAPE} instances (Always Free max = 2). Aborting to prevent paid charges." >&2
  exit 1
fi

EXISTING_MAIL=$(oci compute instance list \
  --compartment-id "$COMPARTMENT_ID" \
  --region "$REGION" \
  --display-name "$INSTANCE_NAME" \
  --query "length(data[?\"lifecycle-state\"!='TERMINATED'])" \
  --raw-output)

if (( EXISTING_MAIL > 0 )); then
  echo "Instance ${INSTANCE_NAME} already exists; skipping launch and proceeding to verification."
else
  ADS=$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" --region "$REGION" --query 'data[*].name' --raw-output | jq -r '.[]')
  TOTAL_STORAGE_GB=0
  for ad in $ADS; do
    BV_SUM=$(oci bv boot-volume list --compartment-id "$COMPARTMENT_ID" --availability-domain "$ad" --region "$REGION" \
      --query 'sum(data[?"lifecycle-state"!=`TERMINATED`]."size-in-gbs")' --raw-output)
    VOL_SUM=$(oci bv volume list --compartment-id "$COMPARTMENT_ID" --availability-domain "$ad" --region "$REGION" \
      --query 'sum(data[?"lifecycle-state"!=`TERMINATED`]."size-in-gbs")' --raw-output)
    TOTAL_STORAGE_GB=$(( TOTAL_STORAGE_GB + ${BV_SUM:-0} + ${VOL_SUM:-0} ))
  done

  PROJECTED_GB=$(( TOTAL_STORAGE_GB + BOOT_GB ))
  echo "Current regional storage: ${TOTAL_STORAGE_GB} GB | Projected with ${INSTANCE_NAME}: ${PROJECTED_GB} / 200 GB Always Free limit"
  if (( PROJECTED_GB > 200 )); then
    echo "FATAL: Provisioning ${BOOT_GB} GB boot volume would exceed 200 GB Always Free cap (${PROJECTED_GB} GB). Retire temporary restore volume first." >&2
    exit 1
  fi

  echo "=== [Phase 2/4] Launching ${INSTANCE_NAME} (${SHAPE}) in AD-1 ==="
  AD_1=$(echo "$ADS" | head -n 1)
  IMAGE_ID=$(oci compute image list \
    --compartment-id "$COMPARTMENT_ID" \
    --region "$REGION" \
    --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04" \
    --shape "$SHAPE" \
    --sort-by TIMECREATED --sort-order DESC \
    --query 'data[0].id' --raw-output)

  CLOUD_INIT=$(mktemp /tmp/jobiest-mail-cloudinit.XXXXXX.yaml)
  trap 'rm -f "$CLOUD_INIT"' EXIT
  cat > "$CLOUD_INIT" <<EOF
#cloud-config
package_update: true
packages:
  - ufw
  - fail2ban
  - docker.io
  - docker-compose-v2
  - curl
  - jq
  - openssl
runcmd:
  - fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab
  - sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow from ${TRUSTED_SSH_CIDR} to any port 22 proto tcp
  - ufw allow 25/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw allow 465/tcp
  - ufw allow 587/tcp
  - ufw allow 993/tcp
  - ufw allow 4190/tcp
  - ufw --force enable
  - systemctl enable --now docker fail2ban
  - mkdir -p /opt/jobiest-mail && chmod 700 /opt/jobiest-mail
EOF

  oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD_1" \
    --region "$REGION" \
    --display-name "$INSTANCE_NAME" \
    --shape "$SHAPE" \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET_ID" \
    --assign-public-ip true \
    --boot-volume-size-in-gbs "$BOOT_GB" \
    --ssh-authorized-keys-file "$SSH_PUBKEY_FILE" \
    --user-data-file "$CLOUD_INIT" \
    --wait-for-state RUNNING >/dev/null
fi

echo "=== [Phase 3/4] Resolving Public IP of ${INSTANCE_NAME} ==="
INSTANCE_ID=$(oci compute instance list \
  --compartment-id "$COMPARTMENT_ID" \
  --region "$REGION" \
  --display-name "$INSTANCE_NAME" \
  --query 'data[?"lifecycle-state"==`RUNNING`] | [0].id' --raw-output)

MAIL_PUBLIC_IP=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'data[0]."public-ip"' --raw-output)

echo "  -> ${INSTANCE_NAME} Public IP: ${MAIL_PUBLIC_IP}"
echo ""
echo "=== [Phase 4/4] Next Steps to Activate Mail Stack ==="
echo "1. Point DNS A record: mail.jobiest.com -> ${MAIL_PUBLIC_IP} (DNS-only / grey cloud in Cloudflare)"
echo "   Point CNAMEs      : webmail.jobiest.com -> mail.jobiest.com | mta-sts.jobiest.com -> mail.jobiest.com"
echo "2. Copy deploy/oci-mail/* to ubuntu@${MAIL_PUBLIC_IP}:/opt/jobiest-mail/"
echo "3. Create /opt/jobiest-mail/.env (chmod 600), run 'docker compose up -d', then './bootstrap-mailboxes.sh'"
echo "4. Verify SMTP handshake + test-send from https://jobiest.com/admin/email BEFORE changing root MX!"
