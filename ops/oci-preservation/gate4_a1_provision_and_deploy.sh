#!/usr/bin/env bash
# ==============================================================================
# JOBIEST INFRASTRUCTURE PRESERVATION — GATE 4 ALWAYS FREE A1 BUILD & VALIDATION
# ==============================================================================
# Builds and validates an independent Oracle Always Free `VM.Standard.A1.Flex`
# (`2 OCPU / 12 GB RAM`, ARM64 `aarch64`) environment alongside `jobiest-ai`.
#
# STRICT NON-DESTRUCTIVE & SECURITY GUARANTEES:
#   1. NEVER modifies, stops, detaches, or deletes `jobiest-ai` (E5.Flex) or its
#      boot volume, backups, retained Gate 2 restore volume, VCN, subnet,
#      security list, DNS records, or Vercel routing.
#   2. NEVER reassigns Reserved Public IP `147.224.218.163` (verified read-only).
#   3. Hard-verifies Always Free quotas ($0.00 compute + <=200 GB regional block
#      storage) BEFORE creating any resource; aborts safely if any limit would
#      exceed Always Free.
#   4. Enforces `2 OCPU / 12 GB` on BOTH new launches AND existing-instance
#      reuse. `1 OCPU / 12 GB` is strictly blocked unless `ALLOW_1OCPU_FALLBACK`
#      is explicitly set to `true` by the owner (`false` by default).
#   5. Requires live OCI `iam fault-domain list` discovery per AD; aborts if the
#      API fails or returns empty rather than assuming fault domain names.
#   6. Authenticates `jobiest-a1`'s SSH host public keys out-of-band via the
#      IAM-authenticated OCI hypervisor serial console (`console-history`) and
#      enforces `StrictHostKeyChecking=yes` BEFORE any SSH session or transfer.
#   7. Attaches the Gate 2 recovery volume STRICTLY READ-ONLY
#      (`--is-read-only true` + OCI API `is-read-only==true` + Linux kernel
#      `blockdev --getro == 1` + `mount -o ro,noload`). NEVER downgrades to
#      writable.
#   8. Encrypts off-instance archives client-side with Encrypt-then-MAC
#      (`AES-256-CBC` + `PBKDF2-HMAC-SHA256` 600k + `HMAC-SHA256`, `*.tar.gz.enc`),
#      verifies round-trip decryption + SHA-256 + tar integrity locally BEFORE
#      upload, and shreds plaintext prior to upload.
#   9. Zero production secrets or production TLS private keys are copied onto
#      `jobiest-a1`: Gate 4 generates dedicated ephemeral 256-bit test secrets
#      and isolated Caddy local-PKI TLS (`tls internal`), seeding ONLY public
#      `ollama/models` GGUF weights (excluding Ollama node private keys).
#  10. Enforces hard pass/fail assertions across all health, 401 auth, port
#      isolation, SSRF, ARM64 Chromium, API-to-worker, and Ollama `READY` tests.
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
ALLOW_1OCPU_FALLBACK="${ALLOW_1OCPU_FALLBACK:-false}"
A1_MAX_RETRY_ROUNDS="${A1_MAX_RETRY_ROUNDS:-30}"
A1_RETRY_SLEEP_SEC="${A1_RETRY_SLEEP_SEC:-45}"

GATE4_WORKER_DOMAIN="worker.gate4.jobiest.internal"
GATE4_API_DOMAIN="api.gate4.jobiest.internal"
GATE4_AI_DOMAIN="ai.gate4.jobiest.internal"

SSH_KEY_DIR="$HOME/.ssh"
SSH_KEY_PRIV="$SSH_KEY_DIR/jobiest_a1_rsa"
SSH_KEY_PUB="$SSH_KEY_DIR/jobiest_a1_rsa.pub"
KNOWN_HOSTS_FILE="$SSH_KEY_DIR/known_hosts_gate4"
VAULT_KEY_PRIV="$SSH_KEY_DIR/jobiest_gate2_vault.key"

TMP_DIR="$(umask 077 && mktemp -d /tmp/jobiest-gate4.XXXXXX)"
chmod 700 "$TMP_DIR"

ACTIVE_PAR_IDS=()
ACTIVE_NS=""
ACTIVE_ATTACH_ID=""
ACTIVE_CONSOLE_HISTORY_ID=""
A1_PUBLIC_IP=""
REMOTE_SECRETS_DIR=""
SSH_OPTS=()

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
  if [[ -n "$A1_PUBLIC_IP" && -n "$REMOTE_SECRETS_DIR" && "${#SSH_OPTS[@]}" -gt 0 ]]; then
    ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" \
      "find '$REMOTE_SECRETS_DIR' -type f -exec shred -u {} + 2>/dev/null || true; rm -rf '$REMOTE_SECRETS_DIR' 2>/dev/null || true" \
      >/dev/null 2>&1 || true
  fi
  if [[ -n "$ACTIVE_CONSOLE_HISTORY_ID" ]]; then
    oci compute console-history delete \
      --region "$REGION" \
      --instance-console-history-id "$ACTIVE_CONSOLE_HISTORY_ID" \
      --force >/dev/null 2>&1 || true
  fi
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
  if [[ -n "$ACTIVE_ATTACH_ID" ]]; then
    oci compute volume-attachment detach \
      --region "$REGION" \
      --volume-attachment-id "$ACTIVE_ATTACH_ID" \
      --force >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR" || true
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------------------
# PHASE 1: LIVE ACCOUNT, QUOTA, STORAGE & COST VERIFICATION ($0.00 HARD GATE)
# ------------------------------------------------------------------------------
banner "PHASE 1 — VERIFY TENANCY, EXISTING E5 PRESERVATION, RESERVED IP & ALWAYS FREE QUOTAS"

if [[ "$ALLOW_1OCPU_FALLBACK" != "true" && "$ALLOW_1OCPU_FALLBACK" != "false" ]]; then
  die "Invalid ALLOW_1OCPU_FALLBACK='$ALLOW_1OCPU_FALLBACK' (must be 'true' or 'false')."
fi

TENANCY_ID="${OCI_TENANCY:-}"
if [[ -z "$TENANCY_ID" && -f "$HOME/.oci/config" ]]; then
  TENANCY_ID="$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$HOME/.oci/config")"
fi
[[ -n "$TENANCY_ID" && "$TENANCY_ID" == ocid1.tenancy.* ]] || die "Could not determine valid OCI_TENANCY OCID."
printf 'Tenancy OCID         : %s\nRegion               : %s\n1-OCPU Fallback Gate : %s (requires explicit owner approval if false)\n' \
  "$TENANCY_ID" "$REGION" "$ALLOW_1OCPU_FALLBACK"

# 1.1 Verify existing jobiest-ai (E5) is RUNNING and untouched
E5_JSON="$(oci compute instance get --region "$REGION" --instance-id "$E5_INSTANCE_ID")"
E5_STATE="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read())["data"]; print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("display-name","lifecycle-state","shape","availability-domain")))' <<<"$E5_JSON")"
IFS='|' read -r E5_NAME E5_LIFECYCLE E5_SHAPE E5_AD <<<"$E5_STATE"
printf 'Existing E5          : %s | state=%s | shape=%s | ad=%s\n' "$E5_NAME" "$E5_LIFECYCLE" "$E5_SHAPE" "$E5_AD"
[[ "$E5_LIFECYCLE" == "RUNNING" ]] || die "Expected jobiest-ai to be RUNNING, got $E5_LIFECYCLE."

# 1.2 Verify Reserved Public IP 147.224.218.163 is untouched on E5
RIP_JSON="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID")"
RIP_INFO="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read())["data"]; print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("ip-address","lifetime","lifecycle-state","assigned-entity-id")))' <<<"$RIP_JSON")"
IFS='|' read -r RIP_ADDR RIP_LIFE RIP_STATE RIP_ASSIGNED <<<"$RIP_INFO"
printf 'Reserved IP          : %s | lifetime=%s | state=%s | assigned=%s\n' "$RIP_ADDR" "$RIP_LIFE" "$RIP_STATE" "$RIP_ASSIGNED"
[[ "$RIP_ADDR" == "147.224.218.163" && "$RIP_LIFE" == "RESERVED" && "$RIP_ASSIGNED" == "$E5_PRIVATE_IP_ID" ]] || \
  die "Reserved IP 147.224.218.163 state unexpected; refusing to proceed."

# 1.3 Verify Gate 2 Backup & Restore-Test Volume are AVAILABLE
BKP_STATE="$(oci bv boot-volume-backup get --region "$REGION" --boot-volume-backup-id "$GATE2_BACKUP_ID" --query 'data."lifecycle-state"' --raw-output)"
RVOL_INFO="$(oci bv boot-volume get --region "$REGION" --boot-volume-id "$GATE2_RESTORE_VOL_ID" --query 'data.{state:"lifecycle-state",ad:"availability-domain",size:"size-in-gbs"}')"
RVOL_STATE="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print("|".join("" if d.get(k) is None else str(d.get(k)) for k in ("state","ad","size")))' <<<"$RVOL_INFO")"
IFS='|' read -r RVOL_LIFECYCLE RVOL_AD RVOL_SIZE <<<"$RVOL_STATE"
printf 'Gate 2 Backup        : %s (state=%s)\n' "$GATE2_BACKUP_ID" "$BKP_STATE"
printf 'Gate 2 RVol          : %s (state=%s, ad=%s, size=%sGB)\n' "$GATE2_RESTORE_VOL_ID" "$RVOL_LIFECYCLE" "$RVOL_AD" "$RVOL_SIZE"
[[ "$BKP_STATE" == "AVAILABLE" && "$RVOL_LIFECYCLE" == "AVAILABLE" ]] || die "Gate 2 backup or restore-test volume is not AVAILABLE."

# 1.4 Check if jobiest-a1 already exists AND enforce exact shape + 1-OCPU approval gate on reuse
EXISTING_A1_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$A1_DISPLAY_NAME" --all)"
EXISTING_A1_COUNT="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
items = (json.loads(s) if s else {}).get("data") or []
live = [x for x in items if x.get("lifecycle-state") in ("PROVISIONING", "RUNNING", "STARTING")]
print(len(live))
' <<<"$EXISTING_A1_JSON")"

if (( EXISTING_A1_COUNT > 1 )); then
  die "Found $EXISTING_A1_COUNT live instances named $A1_DISPLAY_NAME; refusing ambiguous reuse."
fi

EXISTING_A1_LINE=""
if (( EXISTING_A1_COUNT == 1 )); then
  EXISTING_A1_ID="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
items = (json.loads(s) if s else {}).get("data") or []
live = [x for x in items if x.get("lifecycle-state") in ("PROVISIONING", "RUNNING", "STARTING")]
print(live[0]["id"])
' <<<"$EXISTING_A1_JSON")"
  EXISTING_A1_DETAIL="$(oci compute instance get --region "$REGION" --instance-id "$EXISTING_A1_ID")"
  EXISTING_A1_LINE="$(python3 -c '
import json, sys
d = json.loads(sys.stdin.read())["data"]
sc = d.get("shape-config") or {}
vals = [
    d.get("id"),
    d.get("lifecycle-state"),
    d.get("availability-domain"),
    d.get("fault-domain"),
    d.get("shape"),
    sc.get("ocpus"),
    sc.get("memory-in-gbs"),
]
print("|".join("" if v is None else str(v) for v in vals))
' <<<"$EXISTING_A1_DETAIL")"
  IFS='|' read -r EX_ID EX_STATE EX_AD EX_FD EX_SHAPE EX_OCPUS EX_MEM <<<"$EXISTING_A1_LINE"
  printf 'Existing A1 Check    : id=%s state=%s shape=%s ocpus=%s mem=%sGB ad=%s fd=%s\n' \
    "$EX_ID" "$EX_STATE" "$EX_SHAPE" "$EX_OCPUS" "$EX_MEM" "$EX_AD" "$EX_FD"

  [[ "$EX_SHAPE" == "VM.Standard.A1.Flex" ]] || \
    die "Existing $A1_DISPLAY_NAME ($EX_ID) has unexpected shape '$EX_SHAPE' (expected VM.Standard.A1.Flex)."

  SHAPE_VERDICT="$(python3 -c '
import sys
allow_1ocpu = sys.argv[1] == "true"
try:
    ocpus = float(sys.argv[2])
    mem = float(sys.argv[3])
except Exception:
    print("INVALID_NUMBERS")
    sys.exit(0)
if abs(mem - 12.0) > 0.01:
    print("INVALID_MEM")
elif abs(ocpus - 2.0) <= 0.01:
    print("OK_2OCPU")
elif abs(ocpus - 1.0) <= 0.01:
    print("OK_1OCPU" if allow_1ocpu else "REJECT_1OCPU_UNAPPROVED")
else:
    print("INVALID_OCPU")
' "$ALLOW_1OCPU_FALLBACK" "$EX_OCPUS" "$EX_MEM")"

  case "$SHAPE_VERDICT" in
    OK_2OCPU)
      ;;
    OK_1OCPU)
      ;;
    REJECT_1OCPU_UNAPPROVED)
      die "Existing instance $A1_DISPLAY_NAME ($EX_ID) has ${EX_OCPUS} OCPU / ${EX_MEM} GB RAM, which is blocked while ALLOW_1OCPU_FALLBACK=false. Explicit owner approval is required."
      ;;
    INVALID_MEM)
      die "Existing instance $A1_DISPLAY_NAME ($EX_ID) has ${EX_MEM} GB RAM (expected 12.0 GB)."
      ;;
    *)
      die "Existing instance $A1_DISPLAY_NAME ($EX_ID) has unsupported shape-config ocpus='${EX_OCPUS}', memory='${EX_MEM}'."
      ;;
  esac
fi

# 1.5 Enumerate ADs (prioritizing RVOL_AD = AD-2 first so same-AD read-only attach needs 0 extra volumes)
oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" >"$TMP_DIR/ads.json"
mapfile -t ORDERED_ADS < <(python3 - "$TMP_DIR/ads.json" "$RVOL_AD" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
preferred = sys.argv[2]
ads = [x["name"] for x in ((json.loads(s) if s else {}).get("data") or [])]
ordered = ([preferred] if preferred in ads else []) + [a for a in ads if a != preferred]
for a in ordered:
    print(a)
PY
)
[[ "${#ORDERED_ADS[@]}" -gt 0 ]] || die "Could not enumerate any Availability Domains in $REGION."

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

# 1.7 Dynamically discover A1 Compute limit names & per-AD quota eligibility
oci limits value list --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --all >"$TMP_DIR/limits.json"
python3 - "$TMP_DIR/limits.json" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
rows = [x for x in ((json.loads(s) if s else {}).get("data") or []) if "standard-a1" in x.get("name", "").lower()]
for r in rows:
    print("LimitDef: name=%s scope=%s ad=%s limit=%s" % (r.get("name"), r.get("scope-type"), r.get("availability-domain"), r.get("value")))
PY

declare -A AD_OCPU_AVAIL=()
declare -A AD_MEM_AVAIL=()
ADS_2OCPU_ELIGIBLE=()
ADS_1OCPU_ELIGIBLE=()

for ad in "${ORDERED_ADS[@]}"; do
  OCPU_AVAIL="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-a1-core-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
  MEM_AVAIL="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name standard-a1-memory-count --availability-domain "$ad" --query 'data.available' --raw-output 2>/dev/null || echo 0)"
  AD_OCPU_AVAIL["$ad"]="$OCPU_AVAIL"
  AD_MEM_AVAIL["$ad"]="$MEM_AVAIL"
  printf 'Quota   [%s]: A1 OCPUs available=%s | A1 RAM available=%s GB\n' "$ad" "$OCPU_AVAIL" "$MEM_AVAIL"

  if python3 -c '
import sys
try:
    sys.exit(0 if float(sys.argv[1]) >= 2.0 and float(sys.argv[2]) >= 12.0 else 1)
except Exception:
    sys.exit(1)
' "${OCPU_AVAIL:-0}" "${MEM_AVAIL:-0}"; then
    ADS_2OCPU_ELIGIBLE+=("$ad")
  fi

  if python3 -c '
import sys
try:
    sys.exit(0 if float(sys.argv[1]) >= 1.0 and float(sys.argv[2]) >= 12.0 else 1)
except Exception:
    sys.exit(1)
' "${OCPU_AVAIL:-0}" "${MEM_AVAIL:-0}"; then
    ADS_1OCPU_ELIGIBLE+=("$ad")
  fi
done

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
printf 'ARM64 Image          : %s (%s)\n' "$A1_IMAGE_NAME" "$A1_IMAGE_ID"

# ------------------------------------------------------------------------------
# PHASE 2: KEYS, PROVISIONING & OUT-OF-BAND SERIAL CONSOLE HOST-KEY VERIFICATION
# ------------------------------------------------------------------------------
banner "PHASE 2 — PROVISION VM.Standard.A1.Flex & VERIFY SSH HOST KEY VIA OCI CONSOLE-HISTORY"

mkdir -p "$SSH_KEY_DIR"
chmod 700 "$SSH_KEY_DIR"
if [[ ! -f "$SSH_KEY_PRIV" || ! -f "$SSH_KEY_PUB" ]]; then
  rm -f "$SSH_KEY_PRIV" "$SSH_KEY_PUB"
  ssh-keygen -t rsa -b 4096 -N "" -C "jobiest-a1-gate4" -f "$SSH_KEY_PRIV" >/dev/null
  chmod 600 "$SSH_KEY_PRIV"
  chmod 644 "$SSH_KEY_PUB"
  printf 'Generated new FIPS-compliant RSA-4096 SSH keypair: %s\n' "$SSH_KEY_PRIV"
else
  chmod 600 "$SSH_KEY_PRIV"
  printf 'Reusing existing SSH keypair: %s\n' "$SSH_KEY_PRIV"
fi

if [[ ! -s "$VAULT_KEY_PRIV" ]]; then
  (umask 077 && openssl rand -base64 32 >"$VAULT_KEY_PRIV")
  chmod 600 "$VAULT_KEY_PRIV"
  printf 'Generated new 256-bit client-side vault encryption key: %s (mode 600; value NEVER printed)\n' "$VAULT_KEY_PRIV"
else
  chmod 600 "$VAULT_KEY_PRIV"
  printf 'Reusing existing 256-bit client-side vault encryption key: %s (mode 600; value NEVER printed)\n' "$VAULT_KEY_PRIV"
fi
VAULT_KEY_ID="$(python3 -c 'import hashlib,hmac,sys; k=open(sys.argv[1],"rb").read().strip(); print(hmac.new(k,b"jobiest-gate2-vault-key-id-v1",hashlib.sha256).hexdigest()[:16])' "$VAULT_KEY_PRIV")"
printf 'Vault Key Identifier : hmac-id=%s (non-reversible identifier)\n' "$VAULT_KEY_ID"

# Cloud-init user-data emits exact SSH host public keys to the hypervisor serial console (/dev/console)
cat >"$TMP_DIR/a1_userdata.yaml" <<'CLOUDINIT'
#cloud-config
runcmd:
  - |
    {
      echo "===== GATE4_SSH_HOST_PUBKEYS_BEGIN ====="
      cat /etc/ssh/ssh_host_rsa_key.pub /etc/ssh/ssh_host_ecdsa_key.pub 2>/dev/null || true
      echo "===== GATE4_SSH_HOST_PUBKEYS_END ====="
    } > /dev/console
CLOUDINIT

A1_INSTANCE_ID=""
A1_AD=""
A1_ALLOCATED_SHAPE_CFG=""

if [[ -n "$EXISTING_A1_LINE" ]]; then
  IFS='|' read -r A1_INSTANCE_ID EX_STATE A1_AD EX_FD EX_SHAPE EX_OCPUS EX_MEM <<<"$EXISTING_A1_LINE"
  A1_ALLOCATED_SHAPE_CFG="${EX_OCPUS} OCPU / ${EX_MEM} GB (${EX_FD}) [verified existing]"
  printf 'Reusing verified %s: id=%s shape=%s (%s)\n' "$A1_DISPLAY_NAME" "$A1_INSTANCE_ID" "$EX_SHAPE" "$A1_ALLOCATED_SHAPE_CFG"
else
  # Strict Fault-Domain discovery across ALL regional ADs (abort if OCI API fails or returns empty)
  declare -A AD_FDS=()
  ALL_REGIONAL_SLOTS=()
  for reg_ad in "${ORDERED_ADS[@]}"; do
    FD_FILE="$TMP_DIR/fds_$(echo "$reg_ad" | tr -cd 'A-Za-z0-9_-').json"
    if ! oci iam fault-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$reg_ad" >"$FD_FILE" 2>"$TMP_DIR/fd_err.txt"; then
      FD_ERR="$(tr '\r\n' ' ' <"$TMP_DIR/fd_err.txt" | head -c 260)"
      die "OCI fault-domain discovery API failed for $reg_ad: ${FD_ERR}. Refusing to assume fault domain names."
    fi
    if ! FDS_STR="$(python3 -c '
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
if not s:
    sys.exit(1)
names = [x.get("name", "").strip() for x in (json.loads(s).get("data") or []) if x.get("name", "").strip()]
if not names:
    sys.exit(1)
print(" ".join(names))
' "$FD_FILE")"; then
      die "OCI fault-domain discovery returned zero fault domains (or invalid JSON) for $reg_ad; refusing to assume fault domain names."
    fi
    AD_FDS["$reg_ad"]="$FDS_STR"
    for fd in $FDS_STR; do
      ALL_REGIONAL_SLOTS+=("${reg_ad}|${fd}")
    done
    printf 'FaultDomains [%s]: %s (ocpu_avail=%s, mem_avail=%sGB)\n' \
      "$reg_ad" "$FDS_STR" "${AD_OCPU_AVAIL["$reg_ad"]}" "${AD_MEM_AVAIL["$reg_ad"]}"
  done

  SLOTS_2OCPU=()
  for el_ad in "${ADS_2OCPU_ELIGIBLE[@]}"; do
    for fd in ${AD_FDS["$el_ad"]}; do
      SLOTS_2OCPU+=("${el_ad}|${fd}")
    done
  done

  SLOTS_1OCPU=()
  if [[ "$ALLOW_1OCPU_FALLBACK" == "true" ]]; then
    for el_ad in "${ADS_1OCPU_ELIGIBLE[@]}"; do
      for fd in ${AD_FDS["$el_ad"]}; do
        SLOTS_1OCPU+=("${el_ad}|${fd}")
      done
    done
  fi

  if [[ "${#SLOTS_2OCPU[@]}" -eq 0 && "${#SLOTS_1OCPU[@]}" -eq 0 ]]; then
    die "Zero AD/Fault-Domain placement combinations have sufficient Always Free A1 quota (2 OCPU/12 GB eligible slots=0; ALLOW_1OCPU_FALLBACK=$ALLOW_1OCPU_FALLBACK)."
  fi

  declare -A UNIQUE_PROBED_SLOTS=()
  declare -A SLOT_ATTEMPTS=()
  declare -A SLOT_LAST_STATUS=()
  for slot_key in "${ALL_REGIONAL_SLOTS[@]}"; do
    SLOT_ATTEMPTS["$slot_key"]=0
    SLOT_LAST_STATUS["$slot_key"]="not_probed (insufficient_quota)"
  done
  for slot_key in "${SLOTS_2OCPU[@]}"; do
    SLOT_LAST_STATUS["$slot_key"]="not_yet_probed"
  done
  for slot_key in "${SLOTS_1OCPU[@]}"; do
    SLOT_LAST_STATUS["$slot_key"]="not_yet_probed"
  done

  TOTAL_REGIONAL_SLOT_COUNT="${#ALL_REGIONAL_SLOTS[@]}"
  ELIGIBLE_2OCPU_SLOT_COUNT="${#SLOTS_2OCPU[@]}"
  ELIGIBLE_1OCPU_SLOT_COUNT="${#SLOTS_1OCPU[@]}"
  TOTAL_LAUNCH_ATTEMPTS=0
  SWEEP_START_EPOCH="$(date +%s)"

  print_sweep_summary() {
    local now_epoch elapsed_sec mins secs unique_probed_count
    now_epoch="$(date +%s)"
    elapsed_sec=$((now_epoch - SWEEP_START_EPOCH))
    mins=$((elapsed_sec / 60))
    secs=$((elapsed_sec % 60))
    unique_probed_count="${#UNIQUE_PROBED_SLOTS[@]}"

    printf '\n---------------- CAPACITY PLACEMENT SWEEP SUMMARY ----------------\n'
    printf 'Regional AD x Fault-Domain topology : %d total combinations\n' "$TOTAL_REGIONAL_SLOT_COUNT"
    printf 'Quota-eligible 2 OCPU / 12 GB slots : %d combinations\n' "$ELIGIBLE_2OCPU_SLOT_COUNT"
    if [[ "$ALLOW_1OCPU_FALLBACK" == "true" ]]; then
      printf 'Owner-approved 1 OCPU / 12 GB slots : %d combinations\n' "$ELIGIBLE_1OCPU_SLOT_COUNT"
    else
      printf '1 OCPU / 12 GB fallback status      : DISABLED (requires explicit owner approval)\n'
    fi
    printf 'Distinct AD/FD combinations probed  : %d / %d regional slots\n' "$unique_probed_count" "$TOTAL_REGIONAL_SLOT_COUNT"
    printf 'Total launch API attempts executed  : %d\n' "$TOTAL_LAUNCH_ATTEMPTS"
    printf 'Total sweep elapsed time            : %dm %02ds (%ds)\n' "$mins" "$secs" "$elapsed_sec"
    printf '\nPer-Slot Placement Results:\n'
    for slot_key in "${ALL_REGIONAL_SLOTS[@]}"; do
      local s_ad s_fd
      IFS='|' read -r s_ad s_fd <<<"$slot_key"
      printf '  - %-26s | %-15s | attempts=%-3d | last=%s\n' \
        "$s_ad" "$s_fd" "${SLOT_ATTEMPTS["$slot_key"]}" "${SLOT_LAST_STATUS["$slot_key"]}"
    done
    printf -- '------------------------------------------------------------------\n'
  }

  for round in $(seq 1 "$A1_MAX_RETRY_ROUNDS"); do
    printf '\n[Capacity Sweep %d/%d — %s] Probing %d quota-eligible 2 OCPU / 12 GB AD/FD slot(s)%s...\n' \
      "$round" "$A1_MAX_RETRY_ROUNDS" "$(date -u '+%H:%M:%SZ')" "$ELIGIBLE_2OCPU_SLOT_COUNT" \
      "$([[ "$ALLOW_1OCPU_FALLBACK" == "true" ]] && printf ' (+ %d approved 1 OCPU / 12 GB fallback slot(s))' "$ELIGIBLE_1OCPU_SLOT_COUNT" || printf ' (1 OCPU fallback disabled)')"

    for slot_key in "${SLOTS_2OCPU[@]}"; do
      IFS='|' read -r cand_ad fd <<<"$slot_key"
      UNIQUE_PROBED_SLOTS["$slot_key"]=1
      SLOT_ATTEMPTS["$slot_key"]=$(( ${SLOT_ATTEMPTS["$slot_key"]} + 1 ))
      TOTAL_LAUNCH_ATTEMPTS=$((TOTAL_LAUNCH_ATTEMPTS + 1))

      printf '  Trying 2 OCPU / 12 GB in %s / %s ... ' "$cand_ad" "$fd"
      if LAUNCH_OUT="$(oci compute instance launch \
        --region "$REGION" \
        --compartment-id "$TENANCY_ID" \
        --availability-domain "$cand_ad" \
        --fault-domain "$fd" \
        --display-name "$A1_DISPLAY_NAME" \
        --shape "VM.Standard.A1.Flex" \
        --shape-config '{"ocpus": 2.0, "memoryInGBs": 12.0}' \
        --image-id "$A1_IMAGE_ID" \
        --subnet-id "$SUBNET_ID" \
        --assign-public-ip true \
        --boot-volume-size-in-gbs 50 \
        --ssh-authorized-keys-file "$SSH_KEY_PUB" \
        --user-data-file "$TMP_DIR/a1_userdata.yaml" 2>"$TMP_DIR/launch_err.txt")"; then
        A1_INSTANCE_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$LAUNCH_OUT")"
        A1_AD="$cand_ad"
        A1_ALLOCATED_SHAPE_CFG="2 OCPU / 12 GB ($fd)"
        SLOT_LAST_STATUS["$slot_key"]="LAUNCHED (2 OCPU / 12 GB)"
        printf 'SUCCESS! (%s)\n' "$A1_INSTANCE_ID"
        break 2
      else
        ERR_FLAT="$(tr '\r\n' ' ' <"$TMP_DIR/launch_err.txt")"
        if [[ "$ERR_FLAT" == *"Out of host capacity"* ]]; then
          SLOT_LAST_STATUS["$slot_key"]="out_of_host_capacity (2 OCPU / 12 GB)"
          printf 'out of host capacity\n'
        else
          SHORT_ERR="$(printf '%s' "$ERR_FLAT" | head -c 180)"
          SLOT_LAST_STATUS["$slot_key"]="error: $SHORT_ERR"
          printf 'error: %s\n' "$SHORT_ERR"
        fi
      fi
      sleep 2
    done

    if [[ -z "$A1_INSTANCE_ID" && "$ALLOW_1OCPU_FALLBACK" == "true" ]]; then
      for slot_key in "${SLOTS_1OCPU[@]}"; do
        IFS='|' read -r cand_ad fd <<<"$slot_key"
        UNIQUE_PROBED_SLOTS["$slot_key"]=1
        SLOT_ATTEMPTS["$slot_key"]=$(( ${SLOT_ATTEMPTS["$slot_key"]} + 1 ))
        TOTAL_LAUNCH_ATTEMPTS=$((TOTAL_LAUNCH_ATTEMPTS + 1))

        printf '  Trying approved fallback 1 OCPU / 12 GB in %s / %s ... ' "$cand_ad" "$fd"
        if LAUNCH_OUT="$(oci compute instance launch \
          --region "$REGION" \
          --compartment-id "$TENANCY_ID" \
          --availability-domain "$cand_ad" \
          --fault-domain "$fd" \
          --display-name "$A1_DISPLAY_NAME" \
          --shape "VM.Standard.A1.Flex" \
          --shape-config '{"ocpus": 1.0, "memoryInGBs": 12.0}' \
          --image-id "$A1_IMAGE_ID" \
          --subnet-id "$SUBNET_ID" \
          --assign-public-ip true \
          --boot-volume-size-in-gbs 50 \
          --ssh-authorized-keys-file "$SSH_KEY_PUB" \
          --user-data-file "$TMP_DIR/a1_userdata.yaml" 2>"$TMP_DIR/launch_err.txt")"; then
          A1_INSTANCE_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$LAUNCH_OUT")"
          A1_AD="$cand_ad"
          A1_ALLOCATED_SHAPE_CFG="1 OCPU / 12 GB ($fd) [owner-approved fallback]"
          SLOT_LAST_STATUS["$slot_key"]="LAUNCHED (1 OCPU / 12 GB)"
          printf 'SUCCESS! (%s)\n' "$A1_INSTANCE_ID"
          break 2
        else
          ERR_FLAT="$(tr '\r\n' ' ' <"$TMP_DIR/launch_err.txt")"
          if [[ "$ERR_FLAT" == *"Out of host capacity"* ]]; then
            SLOT_LAST_STATUS["$slot_key"]="out_of_host_capacity (1 OCPU / 12 GB)"
            printf 'out of host capacity\n'
          else
            SHORT_ERR="$(printf '%s' "$ERR_FLAT" | head -c 180)"
            SLOT_LAST_STATUS["$slot_key"]="error: $SHORT_ERR"
            printf 'error: %s\n' "$SHORT_ERR"
          fi
        fi
        sleep 2
      done
    fi

    ELAPSED_NOW=$(( $(date +%s) - SWEEP_START_EPOCH ))
    if (( round < A1_MAX_RETRY_ROUNDS )); then
      printf 'Sweep %d complete: probed %d/%d distinct regional AD/FD slot(s) (%d attempts, %ds elapsed). Sleeping %ds before next sweep...\n' \
        "$round" "${#UNIQUE_PROBED_SLOTS[@]}" "$TOTAL_REGIONAL_SLOT_COUNT" "$TOTAL_LAUNCH_ATTEMPTS" "$ELAPSED_NOW" "$A1_RETRY_SLEEP_SEC"
      sleep "$A1_RETRY_SLEEP_SEC"
    fi
  done

  print_sweep_summary

  if [[ -z "$A1_INSTANCE_ID" ]]; then
    if [[ "$ALLOW_1OCPU_FALLBACK" != "true" ]]; then
      die "No 2 OCPU / 12 GB capacity found after probing ${#UNIQUE_PROBED_SLOTS[@]}/${TOTAL_REGIONAL_SLOT_COUNT} AD/FD combinations (${TOTAL_LAUNCH_ATTEMPTS} attempts). 1 OCPU / 12 GB was NOT attempted because owner approval is required. Please decide whether to wait and re-run for 2 OCPU / 12 GB or explicitly approve ALLOW_1OCPU_FALLBACK=true. Existing E5 remains 100% untouched."
    else
      die "No capacity found for 2 OCPU / 12 GB or owner-approved 1 OCPU / 12 GB across ${#UNIQUE_PROBED_SLOTS[@]}/${TOTAL_REGIONAL_SLOT_COUNT} AD/FD combinations (${TOTAL_LAUNCH_ATTEMPTS} attempts). Existing E5 remains 100% untouched."
    fi
  fi
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

printf 'A1 Instance  : %s\nA1 Shape/FD  : %s\nA1 AD        : %s\nA1 VNIC      : %s\nA1 Private IP: %s\nA1 Ephem IP  : %s (Ephemeral test IP; Reserved IP 147.224.218.163 stays on jobiest-ai)\nA1 Boot Vol  : %s\n' \
  "$A1_INSTANCE_ID" "$A1_ALLOCATED_SHAPE_CFG" "$A1_AD" "$A1_VNIC_ID" "$A1_PRIVATE_IP" "$A1_PUBLIC_IP" "$A1_BOOT_VOL_ID"

[[ -n "$A1_PUBLIC_IP" ]] || die "No ephemeral public IP found on jobiest-a1 VNIC."

# Out-of-band SSH host-key retrieval & pinning via authenticated OCI Console-History API
printf 'Authenticating %s SSH host public key(s) out-of-band via OCI Serial Console History...\n' "$A1_DISPLAY_NAME"
EXTRACTED_HOST_KEYS_FILE="$TMP_DIR/extracted_host_keys.pub"
: >"$EXTRACTED_HOST_KEYS_FILE"

for attempt in $(seq 1 25); do
  CH_JSON="$(oci compute console-history capture --region "$REGION" --instance-id "$A1_INSTANCE_ID")"
  ACTIVE_CONSOLE_HISTORY_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$CH_JSON")"
  CH_STATE=""
  for _ in $(seq 1 15); do
    CH_STATE="$(oci compute console-history get --region "$REGION" --instance-console-history-id "$ACTIVE_CONSOLE_HISTORY_ID" --query 'data."lifecycle-state"' --raw-output)"
    [[ "$CH_STATE" == "SUCCEEDED" ]] && break
    sleep 2
  done
  CONSOLE_LOG="$TMP_DIR/console_${attempt}.log"
  if [[ "$CH_STATE" == "SUCCEEDED" ]]; then
    oci compute console-history get-content \
      --region "$REGION" \
      --instance-console-history-id "$ACTIVE_CONSOLE_HISTORY_ID" \
      --length 1048576 \
      --file "$CONSOLE_LOG" >/dev/null
  fi
  oci compute console-history delete \
    --region "$REGION" \
    --instance-console-history-id "$ACTIVE_CONSOLE_HISTORY_ID" \
    --force >/dev/null 2>&1 || true
  ACTIVE_CONSOLE_HISTORY_ID=""

  if [[ -s "$CONSOLE_LOG" ]]; then
    python3 - "$CONSOLE_LOG" "$EXTRACTED_HOST_KEYS_FILE" <<'PY'
import re, sys

raw = open(sys.argv[1], "rb").read().decode("utf-8", errors="replace")
# Remove ANSI escapes and carriage returns emitted by serial console
clean = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", raw).replace("\r", "")

blocks = []
for pat in (
    r"===== GATE4_SSH_HOST_PUBKEYS_BEGIN =====\n(.*?)===== GATE4_SSH_HOST_PUBKEYS_END =====",
    r"-----BEGIN SSH HOST KEY KEYS-----\n(.*?)-----END SSH HOST KEY KEYS-----",
):
    blocks.extend(re.findall(pat, clean, re.S))

allowed_types = ("ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521")
seen = set()
valid_lines = []
for blk in blocks:
    for line in blk.splitlines():
        # Strip optional systemd/cloud-init prefix before key type
        m = re.search(r"((?:ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))\s+[A-Za-z0-9+/=]+)", line)
        if m:
            entry = m.group(1).strip()
            if entry not in seen:
                seen.add(entry)
                valid_lines.append(entry)

if valid_lines:
    with open(sys.argv[2], "w", encoding="utf-8") as out:
        for l in valid_lines:
            out.write(l + "\n")
PY
  fi

  if [[ -s "$EXTRACTED_HOST_KEYS_FILE" ]]; then
    break
  fi
  printf '  Console boot log has not emitted SSH host keys yet (attempt %d/25); waiting 6s...\n' "$attempt"
  sleep 6
done

[[ -s "$EXTRACTED_HOST_KEYS_FILE" ]] || \
  die "Could not obtain verifiable SSH host public keys from OCI console-history; refusing unverified SSH connection."

# Validate each extracted key with ssh-keygen and build pinned known_hosts_gate4 (mode 600)
touch "$KNOWN_HOSTS_FILE"
chmod 600 "$KNOWN_HOSTS_FILE"
ssh-keygen -R "$A1_PUBLIC_IP" -f "$KNOWN_HOSTS_FILE" >/dev/null 2>&1 || true

VERIFIED_KEY_COUNT=0
while IFS= read -r publine; do
  [[ -n "$publine" ]] || continue
  KEY_TMP="$TMP_DIR/verify_single.pub"
  printf '%s\n' "$publine" >"$KEY_TMP"
  FP_OUT="$(ssh-keygen -lf "$KEY_TMP")" || die "Console-history SSH public key failed ssh-keygen validation!"
  printf '  Pinned console-verified host key: %s\n' "$FP_OUT"
  printf '%s %s\n' "$A1_PUBLIC_IP" "$publine" >>"$KNOWN_HOSTS_FILE"
  VERIFIED_KEY_COUNT=$((VERIFIED_KEY_COUNT + 1))
done <"$EXTRACTED_HOST_KEYS_FILE"

(( VERIFIED_KEY_COUNT > 0 )) || die "Zero valid FIPS-compatible SSH host keys verified; aborting."
chmod 600 "$KNOWN_HOSTS_FILE"

# StrictHostKeyChecking=yes enforced for EVERY SSH invocation from this point forward
SSH_OPTS=(
  -i "$SSH_KEY_PRIV"
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$KNOWN_HOSTS_FILE"
  -o IdentitiesOnly=yes
  -o LogLevel=ERROR
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
)

printf 'Connecting to ubuntu@%s with StrictHostKeyChecking=yes...\n' "$A1_PUBLIC_IP"
SSH_READY=0
for _ in $(seq 1 20); do
  if ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'uname -srm' 2>"$TMP_DIR/ssh_verify_err.txt"; then
    SSH_READY=1
    break
  fi
  if grep -qi "REMOTE HOST IDENTIFICATION HAS CHANGED\|Host key verification failed" "$TMP_DIR/ssh_verify_err.txt" 2>/dev/null; then
    die "SSH host key verification FAILED against OCI console-pinned key: $(tr '\r\n' ' ' <"$TMP_DIR/ssh_verify_err.txt" | head -c 260)"
  fi
  sleep 5
done
(( SSH_READY == 1 )) || die "SSH to ubuntu@$A1_PUBLIC_IP timed out under StrictHostKeyChecking=yes."

# ------------------------------------------------------------------------------
# PHASE 3: INSTALL DOCKER + CLI TOOLS ON A1 (NATIVE ARM64 PACKAGES)
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
  sudo apt-get install -y ca-certificates curl gnupg jq openssl ufw git
fi

sudo systemctl enable --now docker
docker --version
docker compose version
openssl version
uname -m
REMOTE_BOOTSTRAP

# ------------------------------------------------------------------------------
# PHASE 4: STRICT READ-ONLY GATE 2 MOUNT -> ENCRYPTED VAULT ARCHIVE & MODEL-ONLY SEED
# ------------------------------------------------------------------------------
banner "PHASE 4 — STRICT READ-ONLY RECOVERY MOUNT, ENCRYPTED VAULT & PUBLIC-MODEL-ONLY SEED"

RECOVERY_VOL_TO_ATTACH=""
if [[ "$A1_AD" == "$RVOL_AD" ]]; then
  printf 'A1 shares AD (%s) with retained restore-test volume — attaching %s STRICTLY READ-ONLY (--is-read-only true)...\n' \
    "$A1_AD" "$GATE2_RESTORE_VOL_ID"
  if ! ATTACH_OUT="$(oci compute volume-attachment attach-paravirtualized-volume \
    --region "$REGION" \
    --instance-id "$A1_INSTANCE_ID" \
    --volume-id "$GATE2_RESTORE_VOL_ID" \
    --is-read-only true 2>"$TMP_DIR/attach_err.txt")"; then
    ATTACH_ERR="$(tr '\r\n' ' ' <"$TMP_DIR/attach_err.txt" | head -c 320)"
    die "Read-only attachment (--is-read-only true) of retained Gate 2 recovery volume ($GATE2_RESTORE_VOL_ID) failed: ${ATTACH_ERR}. Refusing to attach writable."
  fi
  ACTIVE_ATTACH_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$ATTACH_OUT")"
  RECOVERY_VOL_TO_ATTACH="$GATE2_RESTORE_VOL_ID"
else
  printf 'A1 is in %s while retained restore-test volume is in %s (untouched); preparing cross-AD read-only recovery volume from Gate 2 backup...\n' \
    "$A1_AD" "$RVOL_AD"
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
    --is-read-only true 2>"$TMP_DIR/attach_err_cross.txt")"; then
    ATTACH_ERR="$(tr '\r\n' ' ' <"$TMP_DIR/attach_err_cross.txt" | head -c 320)"
    die "Read-only attachment (--is-read-only true) of cross-AD recovery volume ($EXISTING_BV_COPY) failed: ${ATTACH_ERR}. Refusing to attach writable."
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

# Hard-verify OCI control plane reports is-read-only == True before touching block device
ATT_META_JSON="$(oci compute volume-attachment get --region "$REGION" --volume-attachment-id "$ACTIVE_ATTACH_ID")"
ATT_IS_RO="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read())["data"]; print("true" if d.get("is-read-only") is True else "false")' <<<"$ATT_META_JSON")"
printf 'Verified OCI attachment read-only flag: is-read-only=%s\n' "$ATT_IS_RO"
if [[ "$ATT_IS_RO" != "true" ]]; then
  oci compute volume-attachment detach --region "$REGION" --volume-attachment-id "$ACTIVE_ATTACH_ID" --force >/dev/null 2>&1 || true
  ACTIVE_ATTACH_ID=""
  die "SECURITY ABORT: OCI volume attachment did not enforce is-read-only=true. Detached immediately."
fi

# Create short-lived write-only PARs ONLY for client-side encrypted .tar.gz.enc objects
ACTIVE_NS="$(oci os ns get --region "$REGION" --query 'data' --raw-output)"
EXPIRES_AT="$(python3 -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"

OBJ1_NAME="gate2-verified-${STAMP}/e5-app-and-caddy.tar.gz.enc"
OBJ2_NAME="gate2-verified-${STAMP}/e5-system-configs.tar.gz.enc"

PAR1_JSON="$(oci os preauth-request create \
  --region "$REGION" \
  --namespace-name "$ACTIVE_NS" \
  --bucket-name "$VAULT_BUCKET" \
  --name "gate4-vault-app-${STAMP}" \
  --access-type ObjectWrite \
  --object-name "$OBJ1_NAME" \
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
  --object-name "$OBJ2_NAME" \
  --time-expires "$EXPIRES_AT")"
PAR2_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["id"])' <<<"$PAR2_JSON")"
PAR2_URI="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["data"]["access-uri"])' <<<"$PAR2_JSON")"
ACTIVE_PAR_IDS+=("$PAR2_ID")

PAR1_FULL="https://objectstorage.${REGION}.oraclecloud.com${PAR1_URI}"
PAR2_FULL="https://objectstorage.${REGION}.oraclecloud.com${PAR2_URI}"

# Stage encryption key and PAR URLs into an ephemeral 0700 RAM directory (/dev/shm) over host-verified SSH
REMOTE_SECRETS_DIR="$(ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'umask 077 && mktemp -d /dev/shm/gate4-sec.XXXXXX')"
ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" "umask 077 && cat > '${REMOTE_SECRETS_DIR}/vault.key' && chmod 600 '${REMOTE_SECRETS_DIR}/vault.key'" <"$VAULT_KEY_PRIV"
printf 'url = "%s"\n' "$PAR1_FULL" | ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" "umask 077 && cat > '${REMOTE_SECRETS_DIR}/par1.curl' && chmod 600 '${REMOTE_SECRETS_DIR}/par1.curl'"
printf 'url = "%s"\n' "$PAR2_FULL" | ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" "umask 077 && cat > '${REMOTE_SECRETS_DIR}/par2.curl' && chmod 600 '${REMOTE_SECRETS_DIR}/par2.curl'"
PAR1_FULL=""
PAR2_FULL=""

{
  printf 'REMOTE_SECRETS_DIR=%q\n' "$REMOTE_SECRETS_DIR"
  printf 'OBJ1_NAME=%q\n' "$OBJ1_NAME"
  printf 'OBJ2_NAME=%q\n' "$OBJ2_NAME"
  printf 'REPO_URL=%q\n' "$REPO_URL"
  printf 'ISOLATED_BRANCH=%q\n' "$ISOLATED_BRANCH"
  printf 'APP_COMMIT_SHA=%q\n' "$APP_COMMIT_SHA"
  printf 'GATE4_WORKER_DOMAIN=%q\n' "$GATE4_WORKER_DOMAIN"
  printf 'GATE4_API_DOMAIN=%q\n' "$GATE4_API_DOMAIN"
  printf 'GATE4_AI_DOMAIN=%q\n' "$GATE4_AI_DOMAIN"
  cat <<'REMOTE_SEED'
set -euo pipefail

WORK_RAM="$(umask 077 && mktemp -d /dev/shm/gate4-work.XXXXXX)"
chmod 700 "$WORK_RAM"

cleanup_seed() {
  sudo umount /mnt/e5_recovery 2>/dev/null || true
  if [[ -d "$WORK_RAM" ]]; then
    find "$WORK_RAM" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "$WORK_RAM" 2>/dev/null || true
  fi
  if [[ -n "${REMOTE_SECRETS_DIR:-}" && -d "$REMOTE_SECRETS_DIR" ]]; then
    find "$REMOTE_SECRETS_DIR" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "$REMOTE_SECRETS_DIR" 2>/dev/null || true
  fi
}
trap cleanup_seed EXIT

KEY_FILE="${REMOTE_SECRETS_DIR}/vault.key"
PAR1_CFG="${REMOTE_SECRETS_DIR}/par1.curl"
PAR2_CFG="${REMOTE_SECRETS_DIR}/par2.curl"
[[ -s "$KEY_FILE" && -s "$PAR1_CFG" && -s "$PAR2_CFG" ]] || { echo "FATAL: Staged RAM materials missing"; exit 1; }

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

RO_KERNEL_FLAG="$(sudo blockdev --getro "$REC_PART")"
echo "Found recovery partition: $REC_PART (root disk=$ROOT_DISK, kernel_ro=$RO_KERNEL_FLAG)"
[[ "$RO_KERNEL_FLAG" == "1" ]] || { echo "FATAL: Kernel reports $REC_PART is writable (ro=$RO_KERNEL_FLAG)! Aborting."; exit 1; }

sudo mkdir -p /mnt/e5_recovery
if mountpoint -q /mnt/e5_recovery; then
  sudo umount /mnt/e5_recovery
fi
sudo mount -o ro,noload "$REC_PART" /mnt/e5_recovery

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
echo "Old .env key names on E5 (secret values NEVER printed and NEVER copied to A1):"
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

echo "Caddy data src : ${CADDY_DATA_SRC#/mnt/e5_recovery} (archived encrypted to vault ONLY; NOT copied to A1)"
echo "Ollama data src: ${OLLAMA_SRC#/mnt/e5_recovery}"

echo "=== TLS CERTIFICATES PRESENT IN E5 CADDY VOLUME (PUBLIC CERT METADATA ONLY) ==="
sudo find "$CADDY_DATA_SRC" -type f -name '*.crt' 2>/dev/null | while read -r crt; do
  echo "  Cert file: ${crt#/mnt/e5_recovery}"
  sudo openssl x509 -in "$crt" -noout -subject -issuer -dates | sed 's/^/    /'
done

echo "=== GATE 5 (5.1) OLLAMA MODELS PRESENT ON ORIGINAL E5 SERVER ==="
if sudo test -d "$OLLAMA_SRC/models/manifests"; then
  sudo find "$OLLAMA_SRC/models/manifests" -type f | sed "s|$OLLAMA_SRC/models/manifests/|  model: |"
  sudo du -sh "$OLLAMA_SRC/models" | sed 's|/mnt/e5_recovery||; s/^/  models_size: /'
fi

echo "=== SYSTEMD / UFW / CRON INVENTORY ON RESTORED E5 VOLUME ==="
sudo ls -1 /mnt/e5_recovery/etc/systemd/system/*.service 2>/dev/null | sed 's|/mnt/e5_recovery||; s/^/  unit: /' || true
sudo grep -E '^ENABLED=' /mnt/e5_recovery/etc/ufw/ufw.conf 2>/dev/null | sed 's/^/  ufw: /' || true
sudo ls -1 /mnt/e5_recovery/var/spool/cron/crontabs 2>/dev/null | sed 's/^/  crontab_user: /' || true

cat >"${WORK_RAM}/vault_crypto.py" <<'PYCRYPTO'
import hashlib, hmac, os, secrets, subprocess, sys

MAGIC = b"JBV1\x00"
SALT_LEN = 32
TAG_LEN = 32

def load_master(path):
    raw = open(path, "rb").read().strip()
    if len(raw) < 32:
        raise SystemExit("Master key too short")
    return raw

def derive_subkeys(master, salt):
    enc_sub = hmac.new(master, b"JBV1-ENC|" + salt, hashlib.sha256).hexdigest().encode("ascii")
    mac_sub = hmac.new(master, b"JBV1-MAC|" + salt, hashlib.sha256).digest()
    return enc_sub, mac_sub

def encrypt_file(key_path, in_path, out_path):
    master = load_master(key_path)
    salt = secrets.token_bytes(SALT_LEN)
    enc_sub, mac_sub = derive_subkeys(master, salt)

    r_fd, w_fd = os.pipe()
    os.write(w_fd, enc_sub + b"\n")
    os.close(w_fd)
    try:
        proc = subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "600000", "-md", "sha256",
             "-pass", "fd:%d" % r_fd, "-in", in_path],
            pass_fds=(r_fd,),
            capture_output=True,
            check=True,
        )
    finally:
        os.close(r_fd)

    body = MAGIC + salt + proc.stdout
    tag = hmac.new(mac_sub, body, hashlib.sha256).digest()
    with open(out_path, "wb") as f:
        f.write(body + tag)

def decrypt_to_stdout(key_path, in_path):
    master = load_master(key_path)
    blob = open(in_path, "rb").read()
    min_len = len(MAGIC) + SALT_LEN + 16 + TAG_LEN
    if len(blob) < min_len or blob[:len(MAGIC)] != MAGIC:
        raise SystemExit("Invalid JBV1 header")
    body = blob[:-TAG_LEN]
    tag = blob[-TAG_LEN:]
    salt = body[len(MAGIC):len(MAGIC) + SALT_LEN]
    ciphertext = body[len(MAGIC) + SALT_LEN:]
    enc_sub, mac_sub = derive_subkeys(master, salt)

    expected_tag = hmac.new(mac_sub, body, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise SystemExit("HMAC-SHA256 authentication failed (tampered ciphertext or wrong key)")

    r_fd, w_fd = os.pipe()
    os.write(w_fd, enc_sub + b"\n")
    os.close(w_fd)
    try:
        proc = subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-md", "sha256",
             "-pass", "fd:%d" % r_fd],
            input=ciphertext,
            pass_fds=(r_fd,),
            capture_output=True,
            check=True,
        )
    finally:
        os.close(r_fd)
    sys.stdout.buffer.write(proc.stdout)

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "encrypt":
        encrypt_file(sys.argv[2], sys.argv[3], sys.argv[4])
    elif mode == "decrypt":
        decrypt_to_stdout(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("Unknown mode: %s" % mode)
PYCRYPTO
chmod 600 "${WORK_RAM}/vault_crypto.py"

encrypt_verify_and_upload() {
  local label="$1"
  local obj_name="$2"
  local par_cfg="$3"
  shift 3
  local plain_tar="${WORK_RAM}/${label}.tar.gz"
  local enc_file="${WORK_RAM}/${label}.tar.gz.enc"

  sudo tar -czf "$plain_tar" -C /mnt/e5_recovery "$@"
  sudo chown ubuntu:ubuntu "$plain_tar"
  chmod 600 "$plain_tar"

  local plain_sha256 plain_entries
  plain_sha256="$(sha256sum "$plain_tar" | awk '{print $1}')"
  plain_entries="$(tar -tzf "$plain_tar" | wc -l | tr -d ' ')"
  (( plain_entries > 0 )) || { echo "FATAL: Archive $label has 0 tar entries"; exit 1; }

  python3 "${WORK_RAM}/vault_crypto.py" encrypt "$KEY_FILE" "$plain_tar" "$enc_file"
  chmod 600 "$enc_file"

  shred -u "$plain_tar" 2>/dev/null || rm -f "$plain_tar"
  [[ ! -e "$plain_tar" ]] || { echo "FATAL: Plaintext archive still exists"; exit 1; }

  local magic_hex dec_sha256 dec_entries cipher_sha256 cipher_bytes
  magic_hex="$(head -c 5 "$enc_file" | od -An -tx1 | tr -d ' \n')"
  [[ "$magic_hex" == "4a42563100" ]] || { echo "FATAL: Unexpected magic header ($magic_hex) for $label!"; exit 1; }

  dec_sha256="$(python3 "${WORK_RAM}/vault_crypto.py" decrypt "$KEY_FILE" "$enc_file" | sha256sum | awk '{print $1}')"
  dec_entries="$(python3 "${WORK_RAM}/vault_crypto.py" decrypt "$KEY_FILE" "$enc_file" | tar -tzf - | wc -l | tr -d ' ')"

  [[ "$dec_sha256" == "$plain_sha256" ]] || { echo "FATAL: Round-trip decrypted SHA-256 mismatch for $label!"; exit 1; }
  [[ "$dec_entries" == "$plain_entries" ]] || { echo "FATAL: Round-trip tar entry count mismatch for $label!"; exit 1; }

  cipher_sha256="$(sha256sum "$enc_file" | awk '{print $1}')"
  cipher_bytes="$(wc -c <"$enc_file" | tr -d ' ')"

  curl -fsS -X PUT \
    -H 'Content-Type: application/octet-stream' \
    --data-binary "@${enc_file}" \
    --config "$par_cfg" >/dev/null

  shred -u "$enc_file" 2>/dev/null || rm -f "$enc_file"
  echo "  [Encrypted Vault Upload OK] object=${obj_name} bytes=${cipher_bytes} cipher_sha256=${cipher_sha256} hmac_verified=YES roundtrip_sha256_match=YES entries_verified=${dec_entries}"
}

echo "=== CLIENT-SIDE AES-256 ENCRYPTION, LOCAL DECRYPTION/INTEGRITY CHECK & VAULT UPLOAD ==="
encrypt_verify_and_upload \
  "e5-app-and-caddy" \
  "$OBJ1_NAME" \
  "$PAR1_CFG" \
  "${OLD_OCI_DIR#/mnt/e5_recovery/}" \
  "${CADDY_DATA_SRC#/mnt/e5_recovery/}" \
  "${CADDY_CFG_SRC#/mnt/e5_recovery/}"

SYS_PATHS=()
for rel in etc/ufw etc/systemd/system var/spool/cron; do
  if sudo test -e "/mnt/e5_recovery/$rel"; then
    SYS_PATHS+=("$rel")
  fi
done
if [[ "${#SYS_PATHS[@]}" -gt 0 ]]; then
  encrypt_verify_and_upload \
    "e5-system-configs" \
    "$OBJ2_NAME" \
    "$PAR2_CFG" \
    "${SYS_PATHS[@]}"
fi

find "$REMOTE_SECRETS_DIR" -type f -exec shred -u {} + 2>/dev/null || true
rm -rf "$REMOTE_SECRETS_DIR"

echo "=== CLONING ISOLATED BRANCH ON jobiest-a1 ($ISOLATED_BRANCH @ $APP_COMMIT_SHA) ==="
if [[ ! -d "$HOME/jobiest/.git" ]]; then
  git clone --no-checkout "$REPO_URL" "$HOME/jobiest"
fi
git -C "$HOME/jobiest" fetch origin "$ISOLATED_BRANCH"
git -C "$HOME/jobiest" checkout -f "$APP_COMMIT_SHA"
ACTUAL_HEAD="$(git -C "$HOME/jobiest" rev-parse HEAD)"
[[ "$ACTUAL_HEAD" == "$APP_COMMIT_SHA" ]] || { echo "FATAL: Checked out $ACTUAL_HEAD != $APP_COMMIT_SHA"; exit 1; }
echo "Checked out verified commit: $ACTUAL_HEAD"

NEW_OCI_DIR="$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci"

echo "=== GENERATING DEDICATED EPHEMERAL GATE 4 TEST CREDENTIALS & ISOLATED PKI CONFIG ==="
(
  umask 077
  G4_WORKER_SEC="$(openssl rand -hex 32)"
  G4_API_KEY="$(openssl rand -hex 32)"
  G4_OLLAMA_KEY="$(openssl rand -hex 32)"
  cat >"$NEW_OCI_DIR/.env" <<EOF
# Dedicated Gate 4 isolated test configuration (ZERO production secrets shared)
BROWSER_WORKER_SECRET=${G4_WORKER_SEC}
API_KEYS=${G4_API_KEY}
OLLAMA_API_KEY=${G4_OLLAMA_KEY}
WORKER_DOMAIN=${GATE4_WORKER_DOMAIN}
API_DOMAIN=${GATE4_API_DOMAIN}
AI_DOMAIN=${GATE4_AI_DOMAIN}
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=60000
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_NUM_PARALLEL=1
OLLAMA_KEEP_ALIVE=5m
EOF
  chmod 600 "$NEW_OCI_DIR/.env"
)
echo "Generated isolated Gate 4 .env (mode 600; 0 production credentials copied; values NEVER printed)."

cat >"$NEW_OCI_DIR/Caddyfile.gate4" <<'EOF'
{$WORKER_DOMAIN} {
	tls internal
	reverse_proxy worker:8082
}

{$API_DOMAIN} {
	tls internal
	reverse_proxy api:8081
}

{$AI_DOMAIN} {
	tls internal
	reverse_proxy ai:8083
}
EOF

cat >"$NEW_OCI_DIR/docker-compose.gate4.yml" <<'EOF'
services:
  caddy:
    volumes:
      - ./Caddyfile.gate4:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
EOF

echo "=== SEEDING ONLY PUBLIC OLLAMA MODEL WEIGHTS (NO PROD TLS KEYS, NO OLLAMA NODE KEYS) ==="
for base_vol in caddy_data caddy_config ollama; do
  sudo docker volume create \
    --label com.docker.compose.project=oci \
    --label "com.docker.compose.volume=${base_vol}" \
    "oci_${base_vol}" >/dev/null
done

if sudo test -d "$OLLAMA_SRC/models" && ! sudo test -d /var/lib/docker/volumes/oci_ollama/_data/models/blobs; then
  echo "Copying ONLY public GGUF model blobs/manifests (excluding id_ed25519* node keys)..."
  sudo mkdir -p /var/lib/docker/volumes/oci_ollama/_data/models
  sudo cp -a "$OLLAMA_SRC/models/." /var/lib/docker/volumes/oci_ollama/_data/models/
fi
# Ensure zero Ollama identity keys were copied
if sudo ls /var/lib/docker/volumes/oci_ollama/_data/id_* >/dev/null 2>&1; then
  echo "FATAL: Unexpected Ollama identity key present before first start"; exit 1
fi
sudo du -sh /var/lib/docker/volumes/oci_ollama/_data/models 2>/dev/null || true

sudo umount /mnt/e5_recovery
cleanup_seed
trap - EXIT
echo "Unmounted /mnt/e5_recovery and shredded RAM staging directory cleanly."
REMOTE_SEED
} | ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s'
REMOTE_SECRETS_DIR=""

# Immediately revoke temporary PARs and verify encrypted vault objects
for par_id in "${ACTIVE_PAR_IDS[@]}"; do
  oci os preauth-request delete \
    --region "$REGION" \
    --namespace-name "$ACTIVE_NS" \
    --bucket-name "$VAULT_BUCKET" \
    --par-id "$par_id" \
    --force >/dev/null
done
ACTIVE_PAR_IDS=()
printf 'Revoked temporary Object Storage PARs. Encrypted vault objects verified:\n'
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
[[ "$AST" == "DETACHED" ]] || die "Recovery volume did not reach DETACHED within timeout (state=$AST)."
printf 'Read-only recovery volume detached (%s); volume remains AVAILABLE and intact.\n' "$AST"
ACTIVE_ATTACH_ID=""

# ------------------------------------------------------------------------------
# PHASE 5: CONFIGURE HOST FIREWALL & BUILD/START ARM64 STACK ON jobiest-a1
# ------------------------------------------------------------------------------
banner "PHASE 5 — HARDEN UFW/IPTABLES & DEPLOY ISOLATED ARM64 STACK ON jobiest-a1"

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
COMPOSE_ARGS=(-p oci -f docker-compose.yml -f docker-compose.gate4.yml)

echo "Building native ARM64 images and starting isolated Gate 4 oci stack..."
sudo docker compose "${COMPOSE_ARGS[@]}" up -d --build

echo "Waiting for containers to stabilize..."
sleep 10
sudo docker compose "${COMPOSE_ARGS[@]}" ps

# Assert all 5 long-running services are strictly running
RUNNING_SERVICES="$(sudo docker compose "${COMPOSE_ARGS[@]}" ps --status running --services | sort | tr '\n' ' ')"
echo "Running services: $RUNNING_SERVICES"
for req_svc in ai api caddy ollama worker; do
  echo " $RUNNING_SERVICES " | grep -Fq " ${req_svc} " || { echo "FATAL: Required service '$req_svc' is not running!"; exit 1; }
done

for m in qwen2.5:7b llama3.2:3b; do
  if ! sudo docker compose "${COMPOSE_ARGS[@]}" exec -T ollama ollama list | awk 'NR>1{print $1}' | grep -Fxq "$m"; then
    echo "Ensuring model $m is pulled in ollama..."
    sudo docker compose "${COMPOSE_ARGS[@]}" exec -T ollama ollama pull "$m"
  fi
done

echo "=== ARM64 IMAGE & PLAYWRIGHT BINARY ASSERTIONS ==="
for img in $(sudo docker compose "${COMPOSE_ARGS[@]}" images -q | sort -u); do
  ARCH_STR="$(sudo docker image inspect "$img" --format '{{.Architecture}}')"
  TAG_STR="$(sudo docker image inspect "$img" --format '{{index .RepoTags 0}}')"
  echo "  image=${TAG_STR} arch=${ARCH_STR}"
  [[ "$ARCH_STR" == "arm64" ]] || { echo "FATAL: Image $TAG_STR architecture is '$ARCH_STR' (expected arm64)!"; exit 1; }
done

PW_VER="$(sudo docker compose "${COMPOSE_ARGS[@]}" exec -T worker node -p 'require("playwright/package.json").version' | tr -d '\r\n')"
PW_BIN_OK="$(sudo docker compose "${COMPOSE_ARGS[@]}" exec -T worker node -p 'const fs=require("fs"),{chromium}=require("playwright"); fs.existsSync(chromium.executablePath())' | tr -d '\r\n')"
echo "  worker node_version=$(sudo docker compose "${COMPOSE_ARGS[@]}" exec -T worker node -v | tr -d '\r\n')"
echo "  worker playwright_version=${PW_VER}"
echo "  worker chromium_binary_exists=${PW_BIN_OK}"
[[ "$PW_VER" == "1.62.1" ]] || { echo "FATAL: Expected playwright 1.62.1, got '$PW_VER'"; exit 1; }
[[ "$PW_BIN_OK" == "true" ]] || { echo "FATAL: Chromium binary missing inside worker container"; exit 1; }

# Export public Caddy local-PKI root CA certificate so external & local HTTPS probes verify TLS strictly (no -k)
CADDY_LOCAL_ROOT="/var/lib/docker/volumes/oci_caddy_data/_data/caddy/pki/authorities/local/root.crt"
for _ in $(seq 1 20); do
  sudo test -s "$CADDY_LOCAL_ROOT" && break
  sleep 2
done
sudo test -s "$CADDY_LOCAL_ROOT" || { echo "FATAL: Caddy local PKI root.crt not generated at $CADDY_LOCAL_ROOT"; exit 1; }
sudo cp "$CADDY_LOCAL_ROOT" /tmp/gate4_caddy_root.crt
sudo chmod 644 /tmp/gate4_caddy_root.crt

echo "=== HOST FIREWALL & SOCKET EXPOSURE ASSERTIONS ==="
UFW_OUT="$(sudo ufw status verbose)"
echo "$UFW_OUT"
echo "$UFW_OUT" | grep -Fq "Status: active" || { echo "FATAL: UFW is not active!"; exit 1; }

LISTEN_OUT="$(sudo ss -tln)"
echo "$LISTEN_OUT"
for internal_port in 8081 8082 8083 11434; do
  if echo "$LISTEN_OUT" | awk '{print $4}' | grep -Eq "(^|:|\\*)${internal_port}$"; then
    echo "FATAL: Internal service port $internal_port is bound on host network stack!"; exit 1
  fi
done
REMOTE_DEPLOY

# Fetch public Caddy local-PKI root certificate to Cloud Shell for strict external TLS verification
A1_CA_CERT="$TMP_DIR/a1_gate4_root.crt"
ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'cat /tmp/gate4_caddy_root.crt' >"$A1_CA_CERT"
[[ -s "$A1_CA_CERT" ]] || die "Failed to retrieve public Gate 4 Caddy root CA certificate."

# ------------------------------------------------------------------------------
# PHASE 6: STRICT ASSERTION-GATED FUNCTIONAL, SECURITY & RESOURCE VALIDATION
# ------------------------------------------------------------------------------
banner "PHASE 6A — EXTERNAL TLS (STRICT CA VERIFY), HEALTHZ, 401 GATES & PORT ISOLATION"

for dom in "$GATE4_WORKER_DOMAIN" "$GATE4_API_DOMAIN" "$GATE4_AI_DOMAIN"; do
  HC_FILE="$TMP_DIR/hc_${dom}.json"
  HC_META="$(curl -sS --cacert "$A1_CA_CERT" --resolve "${dom}:443:${A1_PUBLIC_IP}" --max-time 15 -o "$HC_FILE" -w '%{http_code}|%{ssl_verify_result}|%{time_total}' "https://${dom}/healthz")"
  IFS='|' read -r HC_CODE HC_SSL HC_TIME <<<"$HC_META"
  HC_OK="$(python3 -c 'import json,sys; d=json.loads(open(sys.argv[1]).read()); print("true" if d.get("ok") is True else "false")' "$HC_FILE" 2>/dev/null || echo false)"
  printf '  [A1 External HTTPS] %s/healthz -> HTTP=%s TLS_VERIFY=%s ok=%s time=%ss\n' "$dom" "$HC_CODE" "$HC_SSL" "$HC_OK" "$HC_TIME"
  [[ "$HC_CODE" == "200" && "$HC_SSL" == "0" && "$HC_OK" == "true" ]] || \
    die "External healthz assertion failed for $dom (HTTP=$HC_CODE, TLS_VERIFY=$HC_SSL, ok=$HC_OK)!"
done

printf '  [A1 External Unauthenticated & Invalid-Token 401 Assertions]\n'
for entry in \
  "${GATE4_WORKER_DOMAIN}|/submit" \
  "${GATE4_API_DOMAIN}|/v1/submit" \
  "${GATE4_AI_DOMAIN}|/api/chat"; do
  IFS='|' read -r dom path <<<"$entry"
  CODE_NOAUTH="$(curl -sS --cacert "$A1_CA_CERT" -o /dev/null -w '%{http_code}' --resolve "${dom}:443:${A1_PUBLIC_IP}" -X POST "https://${dom}${path}" -H 'Content-Type: application/json' -d '{}' --max-time 15)"
  CODE_BADTOK="$(curl -sS --cacert "$A1_CA_CERT" -o /dev/null -w '%{http_code}' --resolve "${dom}:443:${A1_PUBLIC_IP}" -X POST "https://${dom}${path}" -H 'Authorization: Bearer invalid-gate4-probe-token' -H 'Content-Type: application/json' -d '{}' --max-time 15)"
  printf '    %-32s : no_auth=HTTP %s | bad_token=HTTP %s\n' "${dom}${path}" "$CODE_NOAUTH" "$CODE_BADTOK"
  [[ "$CODE_NOAUTH" == "401" && "$CODE_BADTOK" == "401" ]] || \
    die "401 auth gate assertion failed on ${dom}${path} (no_auth=$CODE_NOAUTH, bad_token=$CODE_BADTOK)!"
done

printf '  [A1 External Internal-Port Block Assertions (8081, 8082, 8083, 11434)]\n'
for p in 8081 8082 8083 11434; do
  if curl -sS --max-time 3 "http://${A1_PUBLIC_IP}:${p}/healthz" >/dev/null 2>&1; then
    die "SECURITY FAILURE: Internal port $p is reachable externally on $A1_PUBLIC_IP!"
  else
    printf '    port %d : BLOCKED externally (PASS)\n' "$p"
  fi
done

banner "PHASE 6B — ASSERTION-GATED E2E TESTS ON jobiest-a1 (CHROMIUM + API + OLLAMA READY)"

{
  printf 'GATE4_WORKER_DOMAIN=%q\n' "$GATE4_WORKER_DOMAIN"
  printf 'GATE4_API_DOMAIN=%q\n' "$GATE4_API_DOMAIN"
  printf 'GATE4_AI_DOMAIN=%q\n' "$GATE4_AI_DOMAIN"
  cat <<'REMOTE_E2E'
set -euo pipefail
ENV_PATH="$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci/.env"
CA_CERT="/tmp/gate4_caddy_root.crt"

python3 - "$ENV_PATH" "$CA_CERT" "$GATE4_WORKER_DOMAIN" "$GATE4_API_DOMAIN" "$GATE4_AI_DOMAIN" <<'PY'
import json, re, subprocess, sys, time, urllib.request

env_path, ca_cert, worker_dom, api_dom, ai_dom = sys.argv[1:6]
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

assert len(worker_secret) >= 32, "BROWSER_WORKER_SECRET missing or too short"
assert len(api_key) >= 32, "API_KEYS missing or too short"
assert len(ollama_key) >= 32, "OLLAMA_API_KEY missing or too short"

def call_https_raw(domain, path, token, raw_body, timeout=180):
    t0 = time.monotonic()
    cmd = [
        "curl", "-sS",
        "--cacert", ca_cert,
        "--config", "-",
        "--resolve", "%s:443:127.0.0.1" % domain,
        "--max-time", str(timeout),
        "-X", "POST", "https://%s%s" % (domain, path),
        "-H", "Content-Type: application/json",
        "--data-binary", raw_body,
        "-w", "\n__HTTP_STATUS__=%{http_code}",
    ]
    proc = subprocess.run(
        cmd,
        input='header = "Authorization: Bearer %s"\n' % token,
        text=True,
        capture_output=True,
        check=False,
    )
    dt = time.monotonic() - t0
    if proc.returncode != 0 and "\n__HTTP_STATUS__=" not in proc.stdout:
        raise AssertionError("curl transport error (rc=%d) for %s%s: %s" % (proc.returncode, domain, path, proc.stderr.strip()))
    body, status = proc.stdout.rsplit("\n__HTTP_STATUS__=", 1)
    return status.strip(), body.strip(), dt

def call_https(domain, path, token, payload_obj, timeout=180):
    return call_https_raw(domain, path, token, json.dumps(payload_obj), timeout=timeout)

gh_url = None
for b in ("gitlab", "cloudflare", "vercel", "datadog"):
    try:
        req = urllib.request.Request("https://boards-api.greenhouse.io/v1/boards/%s/jobs" % b, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            jobs = json.loads(r.read().decode("utf-8")).get("jobs") or []
            if jobs and jobs[0].get("absolute_url"):
                gh_url = jobs[0]["absolute_url"]
                break
    except Exception:
        pass
assert gh_url, "Could not resolve a live public Greenhouse job posting URL for safe zero-submit DOM test"

print("1. [Browser Worker Malformed JSON -> HTTP 400 Assertion]")
st, body, dt = call_https_raw(worker_dom, "/submit", worker_secret, "{bad-json", timeout=30)
print("   HTTP %s (%.2fs) -> %s" % (st, dt, body))
assert st == "400", "Expected HTTP 400 on malformed JSON, got %s" % st

print("2. [Browser Worker SSRF Guard -> HTTP 200 STOP POLICY_RESTRICTED Assertion]")
st, body, dt = call_https(worker_dom, "/submit", worker_secret, {
    "jobUrl": "http://169.254.169.254/latest/meta-data/",
    "allowedDomains": ["169.254.169.254"],
    "candidate": {"jobUrl": "http://169.254.169.254/latest/meta-data/", "company": "Test", "title": "Probe", "email": "", "name": None, "phone": None, "cvPath": None, "cvDownloadUrl": None, "coverLetter": None, "answers": []}
}, timeout=30)
print("   HTTP %s (%.2fs) -> %s" % (st, dt, body))
ssrf_json = json.loads(body)
assert st == "200" and ssrf_json.get("outcome") == "STOP" and ssrf_json.get("code") == "POLICY_RESTRICTED" and ssrf_json.get("message") == "SSRF_BLOCKED", \
    "SSRF guard assertion failed: status=%s body=%s" % (st, body)

print("3. [Browser Worker REAL ARM64 Chromium Launch + PDF Materialize + Greenhouse DOM Check (Zero-Submit name=null)]")
print("   Target: %s" % gh_url)
st, body, dt = call_https(worker_dom, "/submit", worker_secret, {
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
print("   HTTP %s (%.2fs) -> %s" % (st, dt, body[:260]))
bw_json = json.loads(body)
assert st == "200", "Browser worker live Greenhouse probe returned HTTP %s (expected 200): %s" % (st, body)
assert bw_json.get("outcome") == "STOP", "Expected safe zero-submit outcome=STOP, got %r" % (bw_json,)
assert bw_json.get("code") not in (None, "POLICY_RESTRICTED", "UNSUPPORTED_PLATFORM"), \
    "Expected post-navigation DOM stop code (proving Chromium launched and loaded page), got %r" % (bw_json,)

print("4. [API Gateway /v1/submit -> Internal Worker Hop Assertion]")
st, body, dt = call_https(api_dom, "/v1/submit", api_key, {
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
print("   HTTP %s (%.2fs) -> %s" % (st, dt, body[:260]))
api_json = json.loads(body)
assert st == "200", "API gateway /v1/submit returned HTTP %s (expected 200): %s" % (st, body)
assert api_json.get("outcome") == "STOP" and api_json.get("code") not in (None, "POLICY_RESTRICTED", "UNSUPPORTED_PLATFORM"), \
    "API gateway -> worker hop did not produce expected post-navigation STOP outcome: %r" % (api_json,)

for model in ("llama3.2:3b", "qwen2.5:7b"):
    print("5. [AI Gateway /api/chat -> Ollama ARM64 Strict READY Assertion (%s)]" % model)
    st, body, dt = call_https(ai_dom, "/api/chat", ollama_key, {
        "model": model,
        "stream": False,
        "messages": [{"role": "user", "content": "Reply with the exact word READY and nothing else."}],
        "options": {"num_predict": 12, "temperature": 0}
    }, timeout=300)
    assert st == "200", "AI gateway /api/chat (%s) returned HTTP %s: %s" % (model, st, body[:240])
    j = json.loads(body)
    assert j.get("done") is True, "Ollama (%s) did not report done=True: %r" % (model, j)
    reply = ((j.get("message") or {}).get("content") or "").strip()
    normalized = re.sub(r"[^A-Za-z]", "", reply).upper()
    eval_cnt = int(j.get("eval_count") or 0)
    eval_ns = int(j.get("eval_duration") or 1) or 1
    load_s = float(j.get("load_duration") or 0) / 1e9
    tok_s = eval_cnt / (eval_ns / 1e9) if eval_cnt else 0.0
    print("   HTTP %s (%.2fs) | load=%.2fs | tok/s=%.2f | reply=%r" % (st, dt, load_s, tok_s, reply))
    assert normalized == "READY", "Model %s failed READY assertion (got %r, normalized=%r)" % (model, reply, normalized)
    assert eval_cnt >= 1, "Model %s reported eval_count=%d (expected >=1)" % (model, eval_cnt)

print("ALL PHASE 6B E2E ASSERTIONS PASSED.")
PY

COMPOSE_ARGS=(-p oci -f "$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci/docker-compose.yml" -f "$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci/docker-compose.gate4.yml")

echo "=== OLLAMA SINGLE-MODEL MEMORY CAP ASSERTION (EXPECT <= 1 LOADED MODEL) ==="
sudo docker compose "${COMPOSE_ARGS[@]}" exec -T ollama ollama list
PS_OUT="$(sudo docker compose "${COMPOSE_ARGS[@]}" exec -T ollama ollama ps)"
echo "$PS_OUT"
LOADED_COUNT="$(printf '%s\n' "$PS_OUT" | awk 'NR>1 && NF>0 {c++} END {print c+0}')"
echo "Loaded Ollama models in RAM: $LOADED_COUNT (limit=1)"
(( LOADED_COUNT <= 1 )) || { echo "FATAL: OLLAMA_MAX_LOADED_MODELS=1 violated (loaded=$LOADED_COUNT)!"; exit 1; }

echo "=== RESOURCE CONSUMPTION ON jobiest-a1 (RAM, DISK, CONTAINER STATS) ==="
free -h
df -h /
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
REMOTE_E2E
} | ssh "${SSH_OPTS[@]}" "ubuntu@$A1_PUBLIC_IP" 'bash -s'

# ------------------------------------------------------------------------------
# PHASE 7: ASSERT PRODUCTION E5, RESERVED IP & LIVE ENDPOINTS REMAIN HEALTHY
# ------------------------------------------------------------------------------
banner "PHASE 7 — RE-VERIFY PRODUCTION E5, RESERVED IP & LIVE PRODUCTION ENDPOINTS"

E5_AFTER="$(oci compute instance get --region "$REGION" --instance-id "$E5_INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
RIP_AFTER="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID" --query 'data."assigned-entity-id"' --raw-output)"
printf 'Production jobiest-ai (E5) state : %s\n' "$E5_AFTER"
printf 'Reserved IP 147.224.218.163 owner: %s (matches E5=%s)\n' "$RIP_AFTER" "$([[ "$RIP_AFTER" == "$E5_PRIVATE_IP_ID" ]] && echo YES || echo NO)"

[[ "$E5_AFTER" == "RUNNING" ]] || die "Production jobiest-ai is not RUNNING ($E5_AFTER)!"
[[ "$RIP_AFTER" == "$E5_PRIVATE_IP_ID" ]] || die "Reserved IP 147.224.218.163 assignment changed unexpectedly ($RIP_AFTER)!"

for url in "https://worker.jobiest.com/healthz" "https://api.jobiest.com/healthz" "https://ai.jobiest.com/healthz" "https://jobiest.com/api/health"; do
  PROD_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url")"
  printf '  [Live Prod] %-36s -> HTTP %s\n' "$url" "$PROD_CODE"
  [[ "$PROD_CODE" == "200" ]] || die "Live production health check failed for $url (HTTP $PROD_CODE)!"
done

banner "GATE 4 PROVISIONING, DEPLOYMENT & ASSERTION-GATED VALIDATION COMPLETE"
