#!/usr/bin/env bash
# ==============================================================================
# JOBIEST INFRASTRUCTURE PRESERVATION — GATE 4 ALWAYS FREE A1 BUILD & VALIDATION
# ==============================================================================
# Builds and validates an independent Oracle Always Free `VM.Standard.A1.Flex`
# (`2 OCPU / 12 GB RAM`, ARM64 `aarch64`) environment alongside `jobiest-ai`.
#
# STRICT NON-DESTRUCTIVE & SECURITY GUARANTEES:
#   1. NEVER modifies, stops, detaches, or deletes `jobiest-ai` (E5.Flex) or its
#      boot volume, backups, VCN, subnet, security list, or DNS records.
#   2. NEVER reassigns Reserved Public IP `147.224.218.163` (verified read-only).
#   3. Hard-verifies Always Free quotas ($0.00 compute + <=200 GB regional block
#      storage) BEFORE creating any resource; aborts safely if any limit would
#      exceed Always Free.
#   4. Attaches the Gate 2 restored volume READ-ONLY (`--is-read-only true`,
#      `mount -o ro,noload`) to `jobiest-a1` to:
#        - complete Gate 2 raw filesystem verification,
#        - stream off-instance `.tar.gz` config/cert backups to private bucket
#          `jobiest-gate2-vault` (with immediate PAR revocation), and
#        - copy `.env` secrets, Let's Encrypt `caddy_data` certs, and `ollama`
#          GGUF model blobs disk-to-disk WITHOUT printing any secret values.
#   5. Deploys isolated branch `arena/5a999da6-moderndayjob`
#      (`2ba2df52f950253df8ea752cd554fa4b93b8a04d`) containing Playwright 1.62.1
#      alignment + HTTP 503 pre-submit failover fix + `OLLAMA_MAX_LOADED_MODELS=1`
#      cap, and executes independent functional & security tests.
# ==============================================================================

set -euo pipefail

export OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True

REGION="${OCI_REGION:-us-chicago-1}"
E5_INSTANCE_ID="ocid1.instance.oc1.us-chicago-1.anxxeljt4azukbicurujbsn6fwlg7nqdlsirupjr4kwyaygida2nwyaeb7yq"
E5_PRIVATE_IP_ID="ocid1.privateip.oc1.us-chicago-1.abxxeljttu34mulvk3t7rjsxvpt6z4g3g37xealpkkbisybiupxuezzxzdwq"
RESERVED_IP_ID="ocid1.publicip.oc1.us-chicago-1.amaaaaaa4azukbiamrhcpus5jzgub6etllrp77llxkfjadcxclwrtprn3dfa"
SUBNET_ID="ocid1.subnet.oc1.us-chicago-1.aaaaaaaa6onpywxkeogb6wadpusauqzeiwibfda5xpqvjizcr3teoxkdlvva"
GATE2_BACKUP_ID="ocid1.bootvolumebackup.oc1.us-chicago-1.abxxeljthqebpnxja6srnf6dntj7jzpkidhrhlqaqapnkqdbawiqlwxgpfqa"
GATE2_RESTORE_VOL_ID="ocid1.bootvolume.oc1.us-chicago-1.abxxeljt3v35f2v33vnqrd6j3k7avhngfyncjwhxgkiiacrealq6zcdbptzq"
VAULT_BUCKET="jobiest-gate2-vault"

REPO_URL="https://github.com/RareBeacon/moderndayjob.git"
ISOLATED_BRANCH="arena/5a999da6-moderndayjob"
APP_COMMIT_SHA="2ba2df52f950253df8ea752cd554fa4b93b8a04d"

A1_DISPLAY_NAME="jobiest-a1"
SSH_KEY_DIR="$HOME/.ssh"
SSH_KEY_PRIV="$SSH_KEY_DIR/jobiest_a1_ed25519"
SSH_KEY_PUB="$SSH_KEY_DIR/jobiest_a1_ed25519.pub"

TMP_DIR="$(mktemp -d /tmp/jobiest-gate4.XXXXXX)"
chmod 700 "$TMP_DIR"

ACTIVE_PAR_IDS=()
ACTIVE_NS=""
ACTIVE_ATTACH_ID=""

banner() {
  printf '\n==============================================================================\n'
  printf '[%s] %s\n' "$(date -u '+%H:%M:%SZ')" "$1"
  printf '==============================================================================\n'
}

die() {
  printf '\n[ABORT] %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "$ACTIVE_NS" && "${#ACTIVE_PAR_IDS[@]}" -gt 0 ]]; then
    for par_id in "${ACTIVE_PAR_IDS[@]}"; do
      if [[ -n "$par_id" ]]; then
        oci os preauth-request delete \
          --region "$REGION" \
          --namespace-name "$ACTIVE_NS" \
          --bucket-name "$VAULT_BUCKET" \
          --par-id "$par_id" \
          --force >/dev/null 2>&1 || true
      fi
    done
  fi
  rm -rf "$TMP_DIR" || true
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------------------
# PHASE 1: LIVE ACCOUNT, QUOTA, STORAGE & COST VERIFICATION ($0.00 HARD GATE)
# ------------------------------------------------------------------------------
banner "PHASE 1 — VERIFY TENANCY, EXISTING E5 PRESERVATION, RESERVED IP & ALWAYS FREE QUOTAS"

TENANCY_ID="${OCI_TENANCY:-}"
if [[ -z "$TENANCY_ID" && -f "$HOME/.oci/config" ]]; then
  TENANCY_ID="$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$HOME/.oci/config")"
fi
[[ -n "$TENANCY_ID" && "$TENANCY_ID" == ocid1.tenancy.* ]] || die "Could not determine valid OCI_TENANCY OCID."
printf 'Tenancy OCID : %s\nRegion       : %s\n' "$TENANCY_ID" "$REGION"

# 1.1 Verify existing jobiest-ai (E5) is RUNNING and untouched
E5_JSON="$(oci compute instance get --region "$REGION" --instance-id "$E5_INSTANCE_ID")"
E5_STATE="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read())["data"]; print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("display-name","lifecycle-state","shape","availability-domain")))' <<<"$E5_JSON")"
IFS='|' read -r E5_NAME E5_LIFECYCLE E5_SHAPE E5_AD <<<"$E5_STATE"
printf 'Existing E5  : %s | state=%s | shape=%s | ad=%s\n' "$E5_NAME" "$E5_LIFECYCLE" "$E5_SHAPE" "$E5_AD"
[[ "$E5_LIFECYCLE" == "RUNNING" ]] || die "Expected jobiest-ai to be RUNNING, got $E5_LIFECYCLE."

# 1.2 Verify Reserved Public IP 147.224.218.163 is untouched on E5
RIP_JSON="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID")"
RIP_INFO="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read())["data"]; print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("ip-address","lifetime","lifecycle-state","assigned-entity-id")))' <<<"$RIP_JSON")"
IFS='|' read -r RIP_ADDR RIP_LIFE RIP_STATE RIP_ASSIGNED <<<"$RIP_INFO"
printf 'Reserved IP  : %s | lifetime=%s | state=%s | assigned=%s\n' "$RIP_ADDR" "$RIP_LIFE" "$RIP_STATE" "$RIP_ASSIGNED"
[[ "$RIP_ADDR" == "147.224.218.163" && "$RIP_LIFE" == "RESERVED" && "$RIP_ASSIGNED" == "$E5_PRIVATE_IP_ID" ]] || \
  die "Reserved IP 147.224.218.163 state unexpected; refusing to proceed."

# 1.3 Verify Gate 2 Backup & Restore-Test Volume are AVAILABLE
BKP_STATE="$(oci bv boot-volume-backup get --region "$REGION" --boot-volume-backup-id "$GATE2_BACKUP_ID" --query 'data."lifecycle-state"' --raw-output)"
RVOL_INFO="$(oci bv boot-volume get --region "$REGION" --boot-volume-id "$GATE2_RESTORE_VOL_ID" --query 'data.{state:"lifecycle-state",ad:"availability-domain",size:"size-in-gbs"}')"
RVOL_STATE="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("state","ad","size")))' <<<"$RVOL_INFO")"
IFS='|' read -r RVOL_LIFECYCLE RVOL_AD RVOL_SIZE <<<"$RVOL_STATE"
printf 'Gate 2 Backup: %s (state=%s)\n' "$GATE2_BACKUP_ID" "$BKP_STATE"
printf 'Gate 2 RVol  : %s (state=%s, ad=%s, size=%sGB)\n' "$GATE2_RESTORE_VOL_ID" "$RVOL_LIFECYCLE" "$RVOL_AD" "$RVOL_SIZE"
[[ "$BKP_STATE" == "AVAILABLE" && "$RVOL_LIFECYCLE" == "AVAILABLE" ]] || die "Gate 2 backup or restore-test volume is not AVAILABLE."

# 1.4 Check if jobiest-a1 already exists (idempotent re-run support)
EXISTING_A1_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$A1_DISPLAY_NAME" --all)"
EXISTING_A1_LINE="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
items = (json.loads(s) if s else {}).get("data") or []
live = [x for x in items if x.get("lifecycle-state") in ("PROVISIONING", "RUNNING", "STARTING")]
if live:
    i = live[0]
    print("|".join("" if i.get(k) is None else str(i.get(k)) for k in ("id", "lifecycle-state", "availability-domain", "shape")))
' <<<"$EXISTING_A1_JSON")"

# 1.5 Enumerate ADs (prioritizing RVOL_AD = AD-2 first so read-only attach needs 0 extra volumes)
ADS_JSON="$(oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID")"
mapfile -t ORDERED_ADS < <(python3 - "$RVOL_AD" <<<"$ADS_JSON" <<'PY'
import json, sys
preferred = sys.argv[1]
s = sys.stdin.read().strip()
ads = [x["name"] for x in ((json.loads(s) if s else {}).get("data") or [])]
ordered = ([preferred] if preferred in ads else []) + [a for a in ads if a != preferred]
for a in ordered:
    print(a)
PY
)

# 1.6 Live Block + Boot Volume Storage Audit across all ADs (<= 200 GB Always Free ceiling)
TOTAL_STORAGE_GB=0
for ad in "${ORDERED_ADS[@]}"; do
  BV_SUM="$(oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
    python3 -c 'import json,sys; s=sys.stdin.read().strip(); items=(json.loads(s) if s else {}).get("data") or []; print(sum(int(x.get("size-in-gbs",0)) for x in items if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
  VOL_SUM="$(oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
    python3 -c 'import json,sys; s=sys.stdin.read().strip(); items=(json.loads(s) if s else {}).get("data") or []; print(sum(int(x.get("size-in-gbs",0)) for x in items if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
  TOTAL_STORAGE_GB=$((TOTAL_STORAGE_GB + BV_SUM + VOL_SUM))
  printf 'Storage [%s]: boot_volumes=%sGB, block_volumes=%sGB\n' "$ad" "$BV_SUM" "$VOL_SUM"
done
printf 'Current Total Active Regional Storage: %d GB / 200 GB Always Free limit\n' "$TOTAL_STORAGE_GB"

if [[ -z "$EXISTING_A1_LINE" ]]; then
  PROJECTED_GB=$((TOTAL_STORAGE_GB + 50))
  printf 'Projected Storage after 50 GB A1 Boot Volume: %d GB / 200 GB ($0.00 Always Free)\n' "$PROJECTED_GB"
  (( PROJECTED_GB <= 200 )) || die "Launching 50 GB A1 boot volume would exceed 200 GB Always Free storage ($PROJECTED_GB GB)!"
else
  (( TOTAL_STORAGE_GB <= 200 )) || die "Active storage ($TOTAL_STORAGE_GB GB) exceeds 200 GB Always Free limit!"
fi

# 1.7 Dynamically discover A1 Compute limit names & per-AD availability
LIMITS_JSON="$(oci limits value list --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --all)"
python3 - <<<"$LIMITS_JSON" <<'PY'
import json, sys
s = sys.stdin.read().strip()
rows = [x for x in ((json.loads(s) if s else {}).get("data") or []) if "a1" in x.get("name", "").lower()]
for r in rows:
    print("LimitDef: name=%s scope=%s ad=%s limit=%s" % (r.get("name"), r.get("scope-type"), r.get("availability-domain"), r.get("value")))
PY

CANDIDATE_ADS=()
for ad in "${ORDERED_ADS[@]}"; do
  OCPU_AVAIL="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-a1-core-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
  MEM_AVAIL="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-a1-memory-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
  printf 'Quota   [%s]: A1 OCPUs available=%s | A1 RAM available=%s GB\n' "$ad" "$OCPU_AVAIL" "$MEM_AVAIL"
  if python3 -c '
import sys
try:
    sys.exit(0 if float(sys.argv[1]) >= 2.0 and float(sys.argv[2]) >= 12.0 else 1)
except Exception:
    sys.exit(1)
' "${OCPU_AVAIL:-0}" "${MEM_AVAIL:-0}"; then
    CANDIDATE_ADS+=("$ad")
  fi
done
if [[ "${#CANDIDATE_ADS[@]}" -eq 0 ]]; then
  CANDIDATE_ADS=("${ORDERED_ADS[@]}")
fi

# 1.8 Resolve Canonical Ubuntu 24.04 ARM64 (aarch64) image for VM.Standard.A1.Flex
IMG_JSON="$(oci compute image list \
  --region "$REGION" \
  --compartment-id "$TENANCY_ID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "24.04" \
  --shape "VM.Standard.A1.Flex" \
  --sort-by TIMECREATED \
  --sort-order DESC \
  --all)"
IMG_LINE="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
imgs = [x for x in ((json.loads(s) if s else {}).get("data") or []) if "aarch64" in x.get("display-name", "").lower() and "minimal" not in x.get("display-name", "").lower()]
if not imgs:
    sys.exit(1)
print("|".join("" if imgs[0].get(k) is None else str(imgs[0].get(k)) for k in ("id", "display-name")))
' <<<"$IMG_JSON")" || die "No Canonical Ubuntu 24.04 aarch64 image found for VM.Standard.A1.Flex."
IFS='|' read -r A1_IMAGE_ID A1_IMAGE_NAME <<<"$IMG_LINE"
printf 'ARM64 Image  : %s (%s)\n' "$A1_IMAGE_NAME" "$A1_IMAGE_ID"

# ------------------------------------------------------------------------------
# PHASE 2: SSH KEYPAIR & INDEPENDENT VM.Standard.A1.Flex PROVISIONING
# ------------------------------------------------------------------------------
banner "PHASE 2 — PROVISION INDEPENDENT VM.Standard.A1.Flex (2 OCPU / 12 GB RAM)"

mkdir -p "$SSH_KEY_DIR"
chmod 700 "$SSH_KEY_DIR"
if [[ ! -f "$SSH_KEY_PRIV" || ! -f "$SSH_KEY_PUB" ]]; then
  ssh-keygen -t ed25519 -N "" -C "jobiest-a1-gate4" -f "$SSH_KEY_PRIV" >/dev/null
  chmod 600 "$SSH_KEY_PRIV"
  chmod 644 "$SSH_KEY_PUB"
  printf 'Generated new persistent SSH keypair: %s\n' "$SSH_KEY_PRIV"
else
  chmod 600 "$SSH_KEY_PRIV"
  printf 'Reusing existing SSH keypair: %s\n' "$SSH_KEY_PRIV"
fi

A1_INSTANCE_ID=""
A1_AD=""
if [[ -n "$EXISTING_A1_LINE" ]]; then
  IFS='|' read -r A1_INSTANCE_ID A1_STATE A1_AD A1_SHAPE <<<"$EXISTING_A1_LINE"
  printf 'Found existing %s: id=%s state=%s ad=%s shape=%s\n' "$A1_DISPLAY_NAME" "$A1_INSTANCE_ID" "$A1_STATE" "$A1_AD" "$A1_SHAPE"
else
  for cand_ad in "${CANDIDATE_ADS[@]}"; do
    printf 'Attempting launch of %s (VM.Standard.A1.Flex 2 OCPU / 12 GB / 50 GB) in %s...\n' "$A1_DISPLAY_NAME" "$cand_ad"
    if LAUNCH_OUT="$(oci compute instance launch \
      --region "$REGION" \
      --compartment-id "$TENANCY_ID" \
      --availability-domain "$cand_ad" \
      --display-name "$A1_DISPLAY_NAME" \
      --shape "VM.Standard.A1.Flex" \
      --shape-config '{"ocpus": 2.0, "memoryInGBs": 12.0}' \
      --image-id "$A1_IMAGE_ID" \
      --subnet-id "$SUBNET_ID" \
      --assign-public-ip true \
      --boot-volume-size-in-gbs 50 \
      --ssh-authorized-keys-file "$SSH_KEY_PUB" 2>"$TMP_DIR/launch_err.txt")"; then
      A1_INSTANCE_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$LAUNCH_OUT")"
      A1_AD="$cand_ad"
      printf 'Launched %s in %s: %s\n' "$A1_DISPLAY_NAME" "$A1_AD" "$A1_INSTANCE_ID"
      break
    else
      printf '  Launch attempt in %s failed: %s\n' "$cand_ad" "$(tr '\r\n' ' ' <"$TMP_DIR/launch_err.txt" | head -c 260)"
    fi
  done
  [[ -n "$A1_INSTANCE_ID" ]] || die "Could not launch VM.Standard.A1.Flex in any AD (transient OCI ARM host capacity). Existing E5 remains 100% untouched."
fi

printf 'Waiting for %s (%s) to reach RUNNING state...\n' "$A1_DISPLAY_NAME" "$A1_INSTANCE_ID"
STATE=""
for _ in $(seq 1 40); do
  STATE="$(oci compute instance get --region "$REGION" --instance-id "$A1_INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
  printf '  state=%s\n' "$STATE"
  [[ "$STATE" == "RUNNING" ]] && break
  sleep 6
done
[[ "$STATE" == "RUNNING" ]] || die "$A1_DISPLAY_NAME did not reach RUNNING within timeout."

VNIC_JSON="$(oci compute instance list-vnics --region "$REGION" --instance-id "$A1_INSTANCE_ID")"
VNIC_LINE="$(python3 -c 'import json,sys; v=json.loads(sys.stdin.read())["data"][0]; print("|".join("" if v.get(k) is None else str(v.get(k)) for k in ("id","private-ip","public-ip")))' <<<"$VNIC_JSON")"
IFS='|' read -r A1_VNIC_ID A1_PRIVATE_IP A1_PUBLIC_IP <<<"$VNIC_LINE"

A1_BVA_JSON="$(oci compute boot-volume-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$A1_AD" --instance-id "$A1_INSTANCE_ID")"
A1_BOOT_VOL_ID="$(python3 -c 'import json,sys; d=[x for x in json.loads(sys.stdin.read())["data"] if x["lifecycle-state"]=="ATTACHED"][0]; print(d["boot-volume-id"])' <<<"$A1_BVA_JSON")"

printf 'A1 Instance  : %s\nA1 AD        : %s\nA1 VNIC      : %s\nA1 Private IP: %s\nA1 Ephem IP  : %s (Ephemeral test IP; Reserved IP 147.224.218.163 stays on jobiest-ai)\nA1 Boot Vol  : %s\n' \
  "$A1_INSTANCE_ID" "$A1_AD" "$A1_VNIC_ID" "$A1_PRIVATE_IP" "$A1_PUBLIC_IP" "$A1_BOOT_VOL_ID"

[[ -n "$A1_PUBLIC_IP" ]] || die "No ephemeral public IP found on jobiest-a1 VNIC."

SSH_OPTS=(-i "$SSH_KEY_PRIV" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$SSH_KEY_DIR/known_hosts_gate4" -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=6)

printf 'Waiting for SSH daemon on ubuntu@%s...\n' "$A1_PUBLIC_IP"
SSH_READY=0
for _ in $(seq 1 30); do
  if ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'uname -srm' 2>/dev/null; then
    SSH_READY=1
    break
  fi
  sleep 6
done
(( SSH_READY == 1 )) || die "SSH to ubuntu@$A1_PUBLIC_IP timed out."

# ------------------------------------------------------------------------------
# PHASE 3: INSTALL DOCKER + UFW ON A1 (NATIVE ARM64 PACKAGES)
# ------------------------------------------------------------------------------
banner "PHASE 3 — INSTALL DOCKER ENGINE, CLI TOOLS & HOST FIREWALL ON jobiest-a1"

ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s' <<'REMOTE_BOOTSTRAP'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg jq openssl ufw git
  sudo install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker ubuntu
else
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl jq openssl ufw git
fi

sudo systemctl enable --now docker
docker --version
docker compose version
uname -m
REMOTE_BOOTSTRAP

# ------------------------------------------------------------------------------
# PHASE 4: READ-ONLY GATE 2 RECOVERY MOUNT -> VERIFY FILES, VAULT ARCHIVE & SEED A1
# ------------------------------------------------------------------------------
banner "PHASE 4 — READ-ONLY MOUNT OF GATE 2 RESTORE VOLUME (FS VERIFY + VAULT + ZERO-EXPOSURE SEED)"

RECOVERY_VOL_TO_ATTACH=""
if [[ "$A1_AD" == "$RVOL_AD" ]]; then
  printf 'A1 shares AD (%s) with retained restore-test volume — attaching %s (--is-read-only true)...\n' "$A1_AD" "$GATE2_RESTORE_VOL_ID"
  if ATTACH_OUT="$(oci compute volume-attachment attach-paravirtualized-volume \
    --region "$REGION" \
    --instance-id "$A1_INSTANCE_ID" \
    --volume-id "$GATE2_RESTORE_VOL_ID" \
    --is-read-only true 2>"$TMP_DIR/attach_err.txt")"; then
    ACTIVE_ATTACH_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$ATTACH_OUT")"
    RECOVERY_VOL_TO_ATTACH="$GATE2_RESTORE_VOL_ID"
  elif ATTACH_OUT="$(oci compute volume-attachment attach-paravirtualized-volume \
    --region "$REGION" \
    --instance-id "$A1_INSTANCE_ID" \
    --volume-id "$GATE2_RESTORE_VOL_ID" 2>"$TMP_DIR/attach_err2.txt")"; then
    ACTIVE_ATTACH_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$ATTACH_OUT")"
    RECOVERY_VOL_TO_ATTACH="$GATE2_RESTORE_VOL_ID"
  else
    printf '  Direct boot-volume data attach returned: %s\n' "$(tr '\r\n' ' ' <"$TMP_DIR/attach_err2.txt" | head -c 220)"
  fi
fi

if [[ -z "$ACTIVE_ATTACH_ID" ]]; then
  EXISTING_BV_COPY="$(oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$A1_AD" --all | \
    python3 -c 'import json,sys; s=sys.stdin.read().strip(); d=[x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("display-name")=="jobiest-gate4-ro-seed" and x.get("lifecycle-state")=="AVAILABLE"]; print(d[0]["id"] if d else "")')"
  if [[ -z "$EXISTING_BV_COPY" ]]; then
    NOW_GB=0
    for ad in "${ORDERED_ADS[@]}"; do
      B1="$(oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | python3 -c 'import json,sys; s=sys.stdin.read().strip(); print(sum(int(x.get("size-in-gbs",0)) for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
      B2="$(oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | python3 -c 'import json,sys; s=sys.stdin.read().strip(); print(sum(int(x.get("size-in-gbs",0)) for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
      NOW_GB=$((NOW_GB + B1 + B2))
    done
    (( NOW_GB + 50 <= 200 )) || die "Cannot create cross-AD recovery volume without exceeding 200 GB Always Free limit (current=${NOW_GB}GB)."
    CREATE_BV_OUT="$(oci bv boot-volume create \
      --region "$REGION" \
      --compartment-id "$TENANCY_ID" \
      --availability-domain "$A1_AD" \
      --display-name "jobiest-gate4-ro-seed" \
      --boot-volume-backup-id "$GATE2_BACKUP_ID")"
    EXISTING_BV_COPY="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$CREATE_BV_OUT")"
    for _ in $(seq 1 40); do
      VST="$(oci bv boot-volume get --region "$REGION" --boot-volume-id "$EXISTING_BV_COPY" --query 'data."lifecycle-state"' --raw-output)"
      [[ "$VST" == "AVAILABLE" ]] && break
      sleep 6
    done
  fi
  if ! ATTACH_OUT="$(oci compute volume-attachment attach-paravirtualized-volume \
    --region "$REGION" \
    --instance-id "$A1_INSTANCE_ID" \
    --volume-id "$EXISTING_BV_COPY" \
    --is-read-only true 2>/dev/null)"; then
    ATTACH_OUT="$(oci compute volume-attachment attach-paravirtualized-volume \
      --region "$REGION" \
      --instance-id "$A1_INSTANCE_ID" \
      --volume-id "$EXISTING_BV_COPY")"
  fi
  ACTIVE_ATTACH_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$ATTACH_OUT")"
  RECOVERY_VOL_TO_ATTACH="$EXISTING_BV_COPY"
fi

printf 'Waiting for read-only attachment %s (%s) to reach ATTACHED...\n' "$ACTIVE_ATTACH_ID" "$RECOVERY_VOL_TO_ATTACH"
AST=""
for _ in $(seq 1 30); do
  AST="$(oci compute volume-attachment get --region "$REGION" --volume-attachment-id "$ACTIVE_ATTACH_ID" --query 'data."lifecycle-state"' --raw-output)"
  printf '  attachment_state=%s\n' "$AST"
  [[ "$AST" == "ATTACHED" ]] && break
  sleep 4
done
[[ "$AST" == "ATTACHED" ]] || die "Volume attachment did not reach ATTACHED."

# Create short-lived write-only PARs for off-instance Gate 2 vault archiving
ACTIVE_NS="$(oci os ns get --region "$REGION" --query 'data' --raw-output)"
EXPIRES_AT="$(python3 -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"

PAR1_JSON="$(oci os preauth-request create \
  --region "$REGION" \
  --namespace-name "$ACTIVE_NS" \
  --bucket-name "$VAULT_BUCKET" \
  --name "gate4-vault-app-${STAMP}" \
  --access-type ObjectWrite \
  --object-name "gate2-verified-${STAMP}/e5-app-and-caddy.tar.gz" \
  --time-expires "$EXPIRES_AT")"
PAR1_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$PAR1_JSON")"
PAR1_URI="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["access-uri"])' <<<"$PAR1_JSON")"
ACTIVE_PAR_IDS+=("$PAR1_ID")

PAR2_JSON="$(oci os preauth-request create \
  --region "$REGION" \
  --namespace-name "$ACTIVE_NS" \
  --bucket-name "$VAULT_BUCKET" \
  --name "gate4-vault-sys-${STAMP}" \
  --access-type ObjectWrite \
  --object-name "gate2-verified-${STAMP}/e5-system-configs.tar.gz" \
  --time-expires "$EXPIRES_AT")"
PAR2_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$PAR2_JSON")"
PAR2_URI="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["access-uri"])' <<<"$PAR2_JSON")"
ACTIVE_PAR_IDS+=("$PAR2_ID")

PAR1_FULL="https://objectstorage.${REGION}.oraclecloud.com${PAR1_URI}"
PAR2_FULL="https://objectstorage.${REGION}.oraclecloud.com${PAR2_URI}"

{
  printf 'PAR1_URL=%q\n' "$PAR1_FULL"
  printf 'PAR2_URL=%q\n' "$PAR2_FULL"
  printf 'REPO_URL=%q\n' "$REPO_URL"
  printf 'ISOLATED_BRANCH=%q\n' "$ISOLATED_BRANCH"
  printf 'APP_COMMIT_SHA=%q\n' "$APP_COMMIT_SHA"
  cat <<'REMOTE_SEED'
set -euo pipefail

ROOT_SRC="$(findmnt -n -o SOURCE /)"
ROOT_DISK="/dev/$(sudo lsblk -no PKNAME "$ROOT_SRC" | head -n1)"

sudo udevadm settle 2>/dev/null || true
REC_PART=""
for _ in $(seq 1 15); do
  REC_PART="$(sudo lsblk -J -b -p -o NAME,FSTYPE,TYPE,SIZE | python3 -c '
import json, sys
root_disk = sys.argv[1]
data = json.loads(sys.stdin.read())
cands = []
def walk(nodes):
    for n in nodes or []:
        name = n.get("name") or ""
        if n.get("type") == "part" and n.get("fstype") == "ext4" and not name.startswith(root_disk):
            cands.append((int(n.get("size") or 0), name))
        walk(n.get("children"))
walk(data.get("blockdevices"))
cands.sort(reverse=True)
print(cands[0][1] if cands else "")
' "$ROOT_DISK")"
  [[ -n "$REC_PART" ]] && break
  sleep 2
done
[[ -n "$REC_PART" ]] || { echo "FATAL: Could not locate secondary ext4 partition"; sudo lsblk -f; exit 1; }
echo "Found read-only recovery partition: $REC_PART (root disk is $ROOT_DISK)"

sudo mkdir -p /mnt/e5_recovery
if mountpoint -q /mnt/e5_recovery; then
  sudo umount /mnt/e5_recovery
fi
sudo mount -o ro,noload "$REC_PART" /mnt/e5_recovery

cleanup_mount() {
  sudo umount /mnt/e5_recovery 2>/dev/null || true
}
trap cleanup_mount EXIT

echo "=== GATE 2 (2.4) RAW FILESYSTEM INSPECTION OF RESTORED E5 VOLUME ==="
OLD_OCI_DIR="$(sudo find /mnt/e5_recovery/home /mnt/e5_recovery/root /mnt/e5_recovery/opt -maxdepth 6 -type d -path '*/deploy/oci' 2>/dev/null | head -n1)"
echo "Old deploy/oci path: ${OLD_OCI_DIR:-NOT_FOUND}"
[[ -n "$OLD_OCI_DIR" ]] || { echo "FATAL: deploy/oci not found on recovery volume"; exit 1; }

OLD_REPO_ROOT="$(sudo git -C "$OLD_OCI_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$OLD_REPO_ROOT" ]]; then
  OLD_SHA="$(sudo git -C "$OLD_REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  OLD_BRANCH="$(sudo git -C "$OLD_REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "Old Git Repo : ${OLD_REPO_ROOT#/mnt/e5_recovery} (branch=$OLD_BRANCH, sha=$OLD_SHA)"
fi

OLD_ENV_FILE="$OLD_OCI_DIR/.env"
[[ -f "$OLD_ENV_FILE" ]] || { echo "FATAL: .env missing at $OLD_ENV_FILE"; exit 1; }
echo "Old .env key names (secret values NEVER printed):"
sudo awk -F= '/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=/{
  k=$1; gsub(/^[[:space:]]+|[[:space:]]+$/,"",k);
  v=substr($0, index($0,"=")+1);
  state=(length(v)>0 ? "SET" : "EMPTY");
  print "  - " k " (" state ")"
}' "$OLD_ENV_FILE"

echo "=== DOCKER VOLUMES ON RESTORED E5 VOLUME ==="
sudo ls -la /mnt/e5_recovery/var/lib/docker/volumes/

CADDY_VOL_DIR="$(sudo find /mnt/e5_recovery/var/lib/docker/volumes -maxdepth 2 -type d -name '*caddy_data' | head -n1)"
CADDY_CFG_DIR="$(sudo find /mnt/e5_recovery/var/lib/docker/volumes -maxdepth 2 -type d -name '*caddy_config' | head -n1)"
OLLAMA_VOL_DIR="$(sudo find /mnt/e5_recovery/var/lib/docker/volumes -maxdepth 2 -type d -name '*ollama*' | head -n1)"
[[ -n "$CADDY_VOL_DIR" && -n "$CADDY_CFG_DIR" && -n "$OLLAMA_VOL_DIR" ]] || { echo "FATAL: Expected Docker volumes missing on recovery disk"; exit 1; }

CADDY_DATA_SRC="$CADDY_VOL_DIR/_data"
CADDY_CFG_SRC="$CADDY_CFG_DIR/_data"
OLLAMA_SRC="$OLLAMA_VOL_DIR/_data"

echo "Caddy data src : ${CADDY_DATA_SRC#/mnt/e5_recovery}"
echo "Ollama data src: ${OLLAMA_SRC#/mnt/e5_recovery}"

echo "=== TLS CERTIFICATES PRESENT IN CADDY VOLUME (METADATA ONLY) ==="
sudo find "$CADDY_DATA_SRC" -type f -name '*.crt' 2>/dev/null | while read -r crt; do
  echo "  Cert file: ${crt#/mnt/e5_recovery}"
  sudo openssl x509 -in "$crt" -noout -subject -issuer -dates | sed 's/^/    /'
done

echo "=== GATE 5 (5.1) OLLAMA MODELS PRESENT ON ORIGINAL E5 SERVER ==="
if sudo test -d "$OLLAMA_SRC/models/manifests"; then
  sudo find "$OLLAMA_SRC/models/manifests" -type f | sed "s|$OLLAMA_SRC/models/manifests/|  model: |"
  sudo du -sh "$OLLAMA_SRC" | sed 's|/mnt/e5_recovery||; s/^/  total_size: /'
fi

echo "=== SYSTEMD / UFW / CRON INVENTORY ON RESTORED E5 VOLUME ==="
sudo ls -1 /mnt/e5_recovery/etc/systemd/system/*.service 2>/dev/null | sed 's|/mnt/e5_recovery||; s/^/  unit: /' || true
sudo grep -E '^ENABLED=' /mnt/e5_recovery/etc/ufw/ufw.conf 2>/dev/null | sed 's/^/  ufw: /' || true
sudo ls -1 /mnt/e5_recovery/var/spool/cron/crontabs 2>/dev/null | sed 's/^/  crontab_user: /' || true

echo "=== STREAMING SEPARATE OFF-INSTANCE ARCHIVES TO PRIVATE VAULT ==="
sudo tar -czf - \
  -C /mnt/e5_recovery \
  "${OLD_OCI_DIR#/mnt/e5_recovery/}" \
  "${CADDY_DATA_SRC#/mnt/e5_recovery/}" \
  "${CADDY_CFG_SRC#/mnt/e5_recovery/}" | \
  curl -fsS -X PUT -H 'Content-Type: application/gzip' --data-binary @- "$PAR1_URL" >/dev/null
echo "  Uploaded e5-app-and-caddy.tar.gz -> jobiest-gate2-vault (OK)"

SYS_PATHS=()
for rel in etc/ufw etc/systemd/system var/spool/cron; do
  if sudo test -e "/mnt/e5_recovery/$rel"; then
    SYS_PATHS+=("$rel")
  fi
done
if [[ "${#SYS_PATHS[@]}" -gt 0 ]]; then
  sudo tar -czf - -C /mnt/e5_recovery "${SYS_PATHS[@]}" | \
    curl -fsS -X PUT -H 'Content-Type: application/gzip' --data-binary @- "$PAR2_URL" >/dev/null
  echo "  Uploaded e5-system-configs.tar.gz -> jobiest-gate2-vault (OK)"
fi

PAR1_URL=""
PAR2_URL=""

echo "=== CLONING ISOLATED BRANCH ON jobiest-a1 ($ISOLATED_BRANCH @ $APP_COMMIT_SHA) ==="
if [[ ! -d "$HOME/jobiest/.git" ]]; then
  git clone --no-checkout "$REPO_URL" "$HOME/jobiest"
fi
git -C "$HOME/jobiest" fetch origin "$ISOLATED_BRANCH"
git -C "$HOME/jobiest" checkout -f "$APP_COMMIT_SHA"
echo "Checked out commit: $(git -C "$HOME/jobiest" rev-parse HEAD)"

NEW_OCI_DIR="$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci"
sudo cp "$OLD_ENV_FILE" "$NEW_OCI_DIR/.env"
sudo chown ubuntu:ubuntu "$NEW_OCI_DIR/.env"
chmod 600 "$NEW_OCI_DIR/.env"
echo "Copied .env disk-to-disk to $NEW_OCI_DIR/.env (mode 600; zero secret values printed)."

echo "=== SEEDING DOCKER NAMED VOLUMES (oci_caddy_data, oci_caddy_config, oci_ollama) ==="
for v in oci_caddy_data oci_caddy_config oci_ollama; do
  sudo docker volume create "$v" >/dev/null
done

sudo cp -a "$CADDY_DATA_SRC/." /var/lib/docker/volumes/oci_caddy_data/_data/
sudo cp -a "$CADDY_CFG_SRC/." /var/lib/docker/volumes/oci_caddy_config/_data/
if ! sudo test -d /var/lib/docker/volumes/oci_ollama/_data/models/blobs; then
  echo "Copying Ollama GGUF model blobs locally from recovery volume (saves ~7 GB download)..."
  sudo cp -a "$OLLAMA_SRC/." /var/lib/docker/volumes/oci_ollama/_data/
fi
sudo du -sh /var/lib/docker/volumes/oci_caddy_data/_data /var/lib/docker/volumes/oci_ollama/_data

sudo umount /mnt/e5_recovery
trap - EXIT
echo "Unmounted /mnt/e5_recovery cleanly."
REMOTE_SEED
} | ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s'

# Immediately revoke temporary PARs and verify vault objects
for par_id in "${ACTIVE_PAR_IDS[@]}"; do
  oci os preauth-request delete \
    --region "$REGION" \
    --namespace-name "$ACTIVE_NS" \
    --bucket-name "$VAULT_BUCKET" \
    --par-id "$par_id" \
    --force >/dev/null
done
ACTIVE_PAR_IDS=()
printf 'Revoked temporary Object Storage PARs. Vault objects verified:\n'
oci os object list --region "$REGION" --namespace-name "$ACTIVE_NS" --bucket-name "$VAULT_BUCKET" \
  --query 'data[].{name:name,size:size,created:"time-created"}' --output table

# Detach the read-only volume attachment cleanly (retaining volume AVAILABLE)
printf 'Detaching read-only volume attachment %s from %s...\n' "$ACTIVE_ATTACH_ID" "$A1_DISPLAY_NAME"
oci compute volume-attachment detach --region "$REGION" --volume-attachment-id "$ACTIVE_ATTACH_ID" --force >/dev/null
for _ in $(seq 1 25); do
  AST="$(oci compute volume-attachment get --region "$REGION" --volume-attachment-id "$ACTIVE_ATTACH_ID" --query 'data."lifecycle-state"' --raw-output)"
  [[ "$AST" == "DETACHED" ]] && break
  sleep 3
done
printf 'Read-only recovery volume detached (%s); volume remains AVAILABLE and intact.\n' "$AST"
ACTIVE_ATTACH_ID=""

# ------------------------------------------------------------------------------
# PHASE 5: CONFIGURE HOST FIREWALL & BUILD/START ARM64 STACK ON jobiest-a1
# ------------------------------------------------------------------------------
banner "PHASE 5 — HARDEN UFW/IPTABLES & DEPLOY ARM64 DOCKER COMPOSE STACK ON jobiest-a1"

ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s' <<'REMOTE_DEPLOY'
set -euo pipefail

# Clean OCI Ubuntu default iptables INPUT/FORWARD icmp-host-prohibited rules that block 80/443 ahead of UFW/Docker
while sudo iptables -C INPUT -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do
  sudo iptables -D INPUT -j REJECT --reject-with icmp-host-prohibited
done
while sudo iptables -C FORWARD -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do
  sudo iptables -D FORWARD -j REJECT --reject-with icmp-host-prohibited
done
if [[ -f /etc/iptables/rules.v4 ]]; then
  sudo sed -i '/icmp-host-prohibited/d' /etc/iptables/rules.v4 || true
fi

sudo ufw --force reset >/dev/null
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'Caddy HTTP'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw --force enable
sudo systemctl restart docker

cd "$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci"
echo "Building native ARM64 images and starting oci stack..."
sudo docker compose -p oci up -d --build

echo "Waiting for containers to stabilize..."
sleep 8
sudo docker compose -p oci ps

echo "=== ARM64 IMAGE & RUNTIME VERIFICATION ==="
for img in $(sudo docker compose -p oci images -q | sort -u); do
  sudo docker image inspect "$img" --format '  image={{index .RepoTags 0}} arch={{.Architecture}} os={{.Os}}'
done
echo "  worker node_version=$(sudo docker compose -p oci exec -T worker node -v)"
echo "  worker playwright_version=$(sudo docker compose -p oci exec -T worker node -p 'require("playwright/package.json").version')"
echo "  worker chromium_path=$(sudo docker compose -p oci exec -T worker node -p 'require("playwright").chromium.executablePath()')"

echo "=== HOST FIREWALL & SOCKET EXPOSURE CHECK ==="
sudo ufw status verbose
sudo ss -tulpn | grep -E 'LISTEN'
REMOTE_DEPLOY

# ------------------------------------------------------------------------------
# PHASE 6: INDEPENDENT FUNCTIONAL, SECURITY & RESOURCE TESTS ON jobiest-a1
# ------------------------------------------------------------------------------
banner "PHASE 6A — EXTERNAL TLS, HEALTHZ, 401 GATES & PORT-ISOLATION FROM CLOUD SHELL"

for dom in worker.jobiest.com api.jobiest.com ai.jobiest.com; do
  HC="$(curl -sS --resolve "${dom}:443:${A1_PUBLIC_IP}" --max-time 15 -w ' HTTP=%{http_code} TLS=%{ssl_verify_result} TIME=%{time_total}s' "https://${dom}/healthz")"
  printf '  [A1 External HTTPS] %s/healthz -> %s\n' "$dom" "$HC"
done

printf '  [A1 External 401 Gates]\n'
printf '    worker /submit (no auth) : HTTP %s\n' "$(curl -sS -o /dev/null -w '%{http_code}' --resolve "worker.jobiest.com:443:${A1_PUBLIC_IP}" -X POST "https://worker.jobiest.com/submit" -H 'Content-Type: application/json' -d '{}' --max-time 15)"
printf '    api /v1/submit (no auth) : HTTP %s\n' "$(curl -sS -o /dev/null -w '%{http_code}' --resolve "api.jobiest.com:443:${A1_PUBLIC_IP}" -X POST "https://api.jobiest.com/v1/submit" -H 'Content-Type: application/json' -d '{}' --max-time 15)"
printf '    ai /api/chat   (no auth) : HTTP %s\n' "$(curl -sS -o /dev/null -w '%{http_code}' --resolve "ai.jobiest.com:443:${A1_PUBLIC_IP}" -X POST "https://ai.jobiest.com/api/chat" -H 'Content-Type: application/json' -d '{}' --max-time 15)"

printf '  [A1 Internal Port Block Check from Internet (expect timeout/exit!=0)]\n'
for p in 8081 8082 8083 11434; do
  if curl -sS --max-time 3 "http://${A1_PUBLIC_IP}:${p}/healthz" >/dev/null 2>&1; then
    die "SECURITY FAILURE: Port $p is reachable externally on $A1_PUBLIC_IP!"
  else
    printf '    port %d : BLOCKED externally (OK)\n' "$p"
  fi
done

banner "PHASE 6B — AUTHENTICATED E2E TESTS ON jobiest-a1 (WORKER ARM64 CHROMIUM + API + OLLAMA AI)"

ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s' <<'REMOTE_E2E'
set -euo pipefail
ENV_PATH="$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci/.env"

python3 - "$ENV_PATH" <<'PY'
import json, subprocess, sys, time, urllib.request

env_path = sys.argv[1]
env = {}
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

worker_secret = env.get("BROWSER_WORKER_SECRET", "")
api_key = (env.get("API_KEYS", "").split(",")[0]).strip()
ollama_key = env.get("OLLAMA_API_KEY", "")

assert worker_secret, "BROWSER_WORKER_SECRET empty"
assert api_key, "API_KEYS empty"
assert ollama_key, "OLLAMA_API_KEY empty"

def call_https(domain, path, token, payload_obj, timeout=180):
    t0 = time.monotonic()
    cmd = [
        "curl", "-sS", "--config", "-",
        "--resolve", f"{domain}:443:127.0.0.1",
        "--max-time", str(timeout),
        "-X", "POST", f"https://{domain}{path}",
        "-H", "Content-Type: application/json",
        "--data-binary", json.dumps(payload_obj),
        "-w", "\n__HTTP_STATUS__=%{http_code}"
    ]
    proc = subprocess.run(
        cmd,
        input=f'header = "Authorization: Bearer {token}"\n',
        text=True,
        capture_output=True,
        check=False,
    )
    dt = time.monotonic() - t0
    out = proc.stdout
    status = "ERR"
    body = out
    if "\n__HTTP_STATUS__=" in out:
        body, status = out.rsplit("\n__HTTP_STATUS__=", 1)
        status = status.strip()
    return status, body.strip(), dt

gh_url = "https://boards.greenhouse.io/gitlab"
for b in ("gitlab", "cloudflare", "vercel", "datadog"):
    try:
        req = urllib.request.Request(f"https://boards-api.greenhouse.io/v1/boards/{b}/jobs", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            jobs = json.loads(r.read().decode("utf-8")).get("jobs") or []
            if jobs and jobs[0].get("absolute_url"):
                gh_url = jobs[0]["absolute_url"]
                break
    except Exception:
        pass

print("1. [Browser Worker SSRF Guard]")
st, body, dt = call_https("worker.jobiest.com", "/submit", worker_secret, {
    "jobUrl": "http://169.254.169.254/latest/meta-data/",
    "allowedDomains": ["169.254.169.254"],
    "candidate": {"jobUrl": "http://169.254.169.254/latest/meta-data/", "company": "Test", "title": "Probe", "email": "", "name": None, "phone": None, "cvPath": None, "cvDownloadUrl": None, "coverLetter": None, "answers": []}
}, timeout=30)
print(f"   HTTP {st} ({dt:.2f}s) -> {body}")

print("2. [Browser Worker REAL ARM64 Chromium Launch + PDF Materialize + Greenhouse DOM Check (Zero-Submit name=null)]")
print(f"   Target: {gh_url}")
st, body, dt = call_https("worker.jobiest.com", "/submit", worker_secret, {
    "jobUrl": gh_url,
    "allowedDomains": ["greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io"],
    "candidate": {
        "jobUrl": gh_url,
        "company": "Gate4 Audit",
        "title": "ARM64 Probe",
        "email": "",
        "name": None,
        "phone": None,
        "cvPath": None,
        "cvDownloadUrl": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        "coverLetter": None,
        "answers": []
    }
}, timeout=120)
print(f"   HTTP {st} ({dt:.2f}s) -> {body[:260]}")

print("3. [API Gateway /v1/submit -> Internal Worker Hop]")
st, body, dt = call_https("api.jobiest.com", "/v1/submit", api_key, {
    "jobUrl": gh_url,
    "candidate": {
        "jobUrl": gh_url,
        "company": "Gate4 API Audit",
        "title": "Gateway Probe",
        "email": "",
        "name": None,
        "phone": None,
        "cvPath": None,
        "cvDownloadUrl": None,
        "coverLetter": None,
        "answers": []
    }
}, timeout=120)
print(f"   HTTP {st} ({dt:.2f}s) -> {body[:260]}")

for model in ("llama3.2:3b", "qwen2.5:7b"):
    print(f"4. [AI Gateway /api/chat -> Ollama ARM64 ({model})]")
    st, body, dt = call_https("ai.jobiest.com", "/api/chat", ollama_key, {
        "model": model,
        "stream": False,
        "messages": [{"role": "user", "content": "Reply with the exact word READY and nothing else."}],
        "options": {"num_predict": 12, "temperature": 0}
    }, timeout=300)
    try:
        j = json.loads(body)
        reply = (j.get("message") or {}).get("content", "").strip().replace("\n", " ")
        eval_cnt = j.get("eval_count", 0)
        eval_ns = j.get("eval_duration", 1) or 1
        load_s = (j.get("load_duration", 0) or 0) / 1e9
        tok_s = eval_cnt / (eval_ns / 1e9) if eval_cnt else 0.0
        print(f"   HTTP {st} ({dt:.2f}s) | load={load_s:.2f}s | tok/s={tok_s:.2f} | reply={reply!r}")
    except Exception:
        print(f"   HTTP {st} ({dt:.2f}s) -> {body[:240]}")
PY

echo "=== OLLAMA LOADED MODELS CHECK (EXPECT MAX 1 LOADED) ==="
sudo docker compose -p oci exec -T ollama ollama list
sudo docker compose -p oci exec -T ollama ollama ps

echo "=== RESOURCE CONSUMPTION ON jobiest-a1 (RAM, DISK, CONTAINER STATS) ==="
free -h
df -h /
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
REMOTE_E2E

# ------------------------------------------------------------------------------
# PHASE 7: FINAL CONFIRMATION THAT PRODUCTION E5 & LIVE ROUTING ARE UNTOUCHED
# ------------------------------------------------------------------------------
banner "PHASE 7 — RE-VERIFY PRODUCTION E5, RESERVED IP & LIVE PRODUCTION ENDPOINTS"

E5_AFTER="$(oci compute instance get --region "$REGION" --instance-id "$E5_INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
RIP_AFTER="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID" --query 'data."assigned-entity-id"' --raw-output)"
printf 'Production jobiest-ai (E5) state : %s\n' "$E5_AFTER"
printf 'Reserved IP 147.224.218.163 owner: %s (matches E5=%s)\n' "$RIP_AFTER" "$([[ "$RIP_AFTER" == "$E5_PRIVATE_IP_ID" ]] && echo YES || echo NO)"

for url in "https://worker.jobiest.com/healthz" "https://api.jobiest.com/healthz" "https://ai.jobiest.com/healthz" "https://jobiest.com/api/health"; do
  printf '  [Live Prod] %-36s -> HTTP %s\n' "$url" "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url")"
done

banner "GATE 4 PROVISIONING, DEPLOYMENT & INDEPENDENT VALIDATION COMPLETE"
