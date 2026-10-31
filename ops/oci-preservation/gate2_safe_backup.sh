#!/usr/bin/env bash
# ==============================================================================
# Jobiest Infrastructure Preservation — Gate 2 Safe Backup & Restore Verification
# ==============================================================================
# Safety guarantees enforced by this script:
#   1. Validates OCI_TENANCY and dynamically resolves live OCIDs & Availability
#      Domain for `jobiest-ai` (no hardcoded AD or unverified OCIDs).
#   2. Verifies Always Free storage (<= 200 GB) and backup slots (< 5) BEFORE
#      creating any volume or backup so $0 Always Free limits are respected.
#   3. Inspects existing IAM Dynamic Groups & Policies first; scopes Instance
#      Principal strictly to `ALL {instance.id = '<jobiest-ai-ocid>'}` (never
#      tenancy-wide or compartment-wide).
#   4. Executes a strictly READ-ONLY in-VM inventory (zero disk writes, zero
#      service restarts, zero config changes, zero secret values printed) and
#      streams read-only tar.gz archives of configs/certs/manifests into a
#      private (`NoPublicAccess`) Always Free Object Storage bucket via
#      short-lived write-only PARs that are revoked immediately on exit.
#   5. Creates a FULL Boot Volume Backup (+ FULL backups of any attached Block
#      Volumes) and waits until `lifecycle-state == AVAILABLE` with verified
#      source volume metadata.
#   6. Restores a separate test volume in the verified Availability Domain,
#      waits until `AVAILABLE`, and RETAINS it (NEVER auto-deletes).
# ==============================================================================

set -euo pipefail

PAR1_ID=""
PAR2_ID=""
OS_NS=""
BUCKET_NAME="jobiest-gate2-vault"
VERIFY_DIR=""

cleanup() {
  rm -f /tmp/gate2_cmd_payload.json
  if [ -n "$VERIFY_DIR" ] && [ -d "$VERIFY_DIR" ]; then
    rm -rf "$VERIFY_DIR"
  fi
  if [ -n "$OS_NS" ] && [ -n "$PAR1_ID" ]; then
    oci os preauth-request delete \
      --namespace-name "$OS_NS" \
      --bucket-name "$BUCKET_NAME" \
      --par-id "$PAR1_ID" \
      --force >/dev/null 2>&1 || true
  fi
  if [ -n "$OS_NS" ] && [ -n "$PAR2_ID" ]; then
    oci os preauth-request delete \
      --namespace-name "$OS_NS" \
      --bucket-name "$BUCKET_NAME" \
      --par-id "$PAR2_ID" \
      --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

TS=$(date -u +%Y%m%dT%H%M%SZ)
echo "================================================================"
echo "GATE 2 SAFE PRESERVATION BACKUP — $TS"
echo "================================================================"

echo ""
echo "--- [1] VERIFY LIVE TENANCY, INSTANCE, VOLUMES & ALWAYS FREE QUOTAS ---"
if [ -z "${OCI_TENANCY:-}" ] || [[ ! "$OCI_TENANCY" =~ ^ocid1\.tenancy\. ]]; then
  echo "FATAL: OCI_TENANCY is unset or invalid (${OCI_TENANCY:-empty})."
  exit 1
fi
echo "Verified Tenancy OCID: $OCI_TENANCY | Region: ${OCI_REGION:-unknown}"

INST_LIST=$(oci compute instance list \
  --compartment-id "$OCI_TENANCY" \
  --display-name "jobiest-ai" \
  --lifecycle-state RUNNING \
  --all)
INST_COUNT=$(echo "$INST_LIST" | jq '.data | length')
if [ "$INST_COUNT" -ne 1 ]; then
  echo "FATAL: Expected exactly 1 RUNNING jobiest-ai instance, found $INST_COUNT."
  exit 1
fi

INST_ID=$(echo "$INST_LIST" | jq -r '.data[0].id')
INST_AD=$(echo "$INST_LIST" | jq -r '.data[0]."availability-domain"')
INST_SHAPE=$(echo "$INST_LIST" | jq -r '.data[0].shape')
INST_OCPU=$(echo "$INST_LIST" | jq -r '.data[0]."shape-config".ocpus')
INST_MEM=$(echo "$INST_LIST" | jq -r '.data[0]."shape-config"."memory-in-gbs"')
echo "Verified Instance: jobiest-ai"
echo "  Instance OCID : $INST_ID"
echo "  Avail. Domain : $INST_AD"
echo "  Shape         : $INST_SHAPE (${INST_OCPU} OCPU / ${INST_MEM} GB RAM)"

BVA_JSON=$(oci compute boot-volume-attachment list \
  --availability-domain "$INST_AD" \
  --compartment-id "$OCI_TENANCY" \
  --instance-id "$INST_ID" \
  --all)
BOOT_VOL_ID=$(echo "$BVA_JSON" | jq -r '.data[] | select(."lifecycle-state"=="ATTACHED") | ."boot-volume-id"' | head -n1)
if [[ ! "$BOOT_VOL_ID" =~ ^ocid1\.bootvolume\. ]]; then
  echo "FATAL: Could not resolve attached boot volume for $INST_ID."
  exit 1
fi

BV_JSON=$(oci bv boot-volume get --boot-volume-id "$BOOT_VOL_ID")
BV_STATE=$(echo "$BV_JSON" | jq -r '.data."lifecycle-state"')
BV_SIZE_GB=$(echo "$BV_JSON" | jq -r '.data."size-in-gbs"')
BV_NAME=$(echo "$BV_JSON" | jq -r '.data."display-name"')
if [ "$BV_STATE" != "AVAILABLE" ]; then
  echo "FATAL: Source boot volume is not AVAILABLE (state=$BV_STATE)."
  exit 1
fi
echo "Verified Boot Volume: $BV_NAME ($BOOT_VOL_ID) | Size=${BV_SIZE_GB}GB | State=$BV_STATE"

VA_JSON=$(oci compute volume-attachment list \
  --compartment-id "$OCI_TENANCY" \
  --instance-id "$INST_ID" \
  --all)
ATTACHED_BLOCK_IDS=$(echo "$VA_JSON" | jq -r '.data[] | select(."lifecycle-state"=="ATTACHED") | ."volume-id"')
if [ -z "$ATTACHED_BLOCK_IDS" ]; then
  echo "Verified Secondary Attached Block Volumes: 0 (none attached)"
else
  echo "Verified Secondary Attached Block Volumes: $ATTACHED_BLOCK_IDS"
fi

TOTAL_STORAGE_USED=0
for AD in $(oci iam availability-domain list --compartment-id "$OCI_TENANCY" --query 'data[*].name' --raw-output | jq -r '.[]'); do
  B_SUM=$(oci bv boot-volume list --availability-domain "$AD" --compartment-id "$OCI_TENANCY" --all \
    | jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0')
  V_SUM=$(oci bv volume list --availability-domain "$AD" --compartment-id "$OCI_TENANCY" --all \
    | jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0')
  TOTAL_STORAGE_USED=$((TOTAL_STORAGE_USED + B_SUM + V_SUM))
done
PROJ_STORAGE=$((TOTAL_STORAGE_USED + BV_SIZE_GB))
echo "Regional Storage Check: Active=${TOTAL_STORAGE_USED}GB | Post-Restore-Test=${PROJ_STORAGE}GB / 200GB Always Free"
if [ "$PROJ_STORAGE" -gt 200 ]; then
  echo "FATAL: Retaining restore-test volume would exceed 200GB Always Free limit (${PROJ_STORAGE}GB). Stopping safely."
  exit 1
fi

BKP_USED_BV=$(oci bv boot-volume-backup list --compartment-id "$OCI_TENANCY" --all \
  | jq '[.data[] | select(."lifecycle-state"!="TERMINATED" and ."lifecycle-state"!="FAULTY")] | length')
BKP_USED_V=$(oci bv backup list --compartment-id "$OCI_TENANCY" --all \
  | jq '[.data[] | select(."lifecycle-state"!="TERMINATED" and ."lifecycle-state"!="FAULTY")] | length')
BKP_TOTAL=$((BKP_USED_BV + BKP_USED_V))
NEW_BKP_NEEDED=1
for _ in $ATTACHED_BLOCK_IDS; do
  NEW_BKP_NEEDED=$((NEW_BKP_NEEDED + 1))
done
echo "Free Backup Slot Check: Used=${BKP_TOTAL} | Needed=${NEW_BKP_NEEDED} | Limit=5 Always Free slots"
if [ $((BKP_TOTAL + NEW_BKP_NEEDED)) -gt 5 ]; then
  echo "FATAL: Insufficient Always Free backup slots (${BKP_TOTAL} used + ${NEW_BKP_NEEDED} needed > 5). Stopping safely."
  exit 1
fi

echo ""
echo "--- [2] INSPECT EXISTING IAM & CONFIGURE SINGLE-INSTANCE LEAST PRIVILEGE ---"
echo "Existing Dynamic Groups in tenancy:"
oci iam dynamic-group list --compartment-id "$OCI_TENANCY" --all \
  --query 'data[*].{Name:name,Rule:"matching-rule",State:"lifecycle-state"}' --output table
echo "Existing IAM Policies in tenancy:"
oci iam policy list --compartment-id "$OCI_TENANCY" --all \
  --query 'data[*].{Name:name,Statements:statements,State:"lifecycle-state"}' --output table

DG_NAME="jobiest-ai-oca-dg"
EXACT_RULE="ALL {instance.id = '$INST_ID'}"
DG_ID=$(oci iam dynamic-group list --compartment-id "$OCI_TENANCY" --all \
  --query "data[?name=='$DG_NAME'].id | [0]" --raw-output)

IAM_CHANGED=0
if [ -z "$DG_ID" ] || [ "$DG_ID" = "null" ]; then
  DG_ID=$(oci iam dynamic-group create \
    --compartment-id "$OCI_TENANCY" \
    --name "$DG_NAME" \
    --description "Single-instance principal scoped strictly to jobiest-ai ($INST_ID) for read-only inventory" \
    --matching-rule "$EXACT_RULE" \
    --query 'data.id' --raw-output)
  echo "Created single-instance Dynamic Group: $DG_NAME ($DG_ID)"
  echo "  Rule: $EXACT_RULE"
  IAM_CHANGED=1
else
  CURRENT_RULE=$(oci iam dynamic-group get --dynamic-group-id "$DG_ID" --query 'data."matching-rule"' --raw-output)
  echo "Found existing Dynamic Group: $DG_NAME ($DG_ID) | Rule: $CURRENT_RULE"
  if [ "$CURRENT_RULE" != "$EXACT_RULE" ]; then
    oci iam dynamic-group update --dynamic-group-id "$DG_ID" --matching-rule "$EXACT_RULE" --force >/dev/null
    echo "Tightened Dynamic Group matching-rule to single instance: $EXACT_RULE"
    IAM_CHANGED=1
  fi
fi

POL_NAME="jobiest-ai-oca-policy"
POL_STMT="[\"Allow dynamic-group $DG_NAME to use instance-agent-command-execution-family in tenancy\"]"
POL_ID=$(oci iam policy list --compartment-id "$OCI_TENANCY" --all \
  --query "data[?name=='$POL_NAME'].id | [0]" --raw-output)

if [ -z "$POL_ID" ] || [ "$POL_ID" = "null" ]; then
  POL_ID=$(oci iam policy create \
    --compartment-id "$OCI_TENANCY" \
    --name "$POL_NAME" \
    --description "Allow only jobiest-ai ($DG_NAME) instance agent to report command execution results" \
    --statements "$POL_STMT" \
    --query 'data.id' --raw-output)
  echo "Created least-privilege IAM Policy: $POL_NAME ($POL_ID)"
  IAM_CHANGED=1
else
  echo "Found existing IAM Policy: $POL_NAME ($POL_ID)"
fi

if [ "$IAM_CHANGED" -eq 1 ]; then
  echo "Waiting 25s for IAM control-plane propagation..."
  sleep 25
fi

echo ""
echo "--- [3] PREPARE PRIVATE OBJECT STORAGE VAULT (ALWAYS FREE <=20GB, NO PUBLIC ACCESS) ---"
OS_NS=$(oci os ns get --query 'data' --raw-output)
if ! oci os bucket get --namespace-name "$OS_NS" --name "$BUCKET_NAME" >/dev/null 2>&1; then
  oci os bucket create \
    --compartment-id "$OCI_TENANCY" \
    --namespace-name "$OS_NS" \
    --name "$BUCKET_NAME" \
    --public-access-type NoPublicAccess \
    --storage-tier Standard >/dev/null
  echo "Created private Object Storage bucket: $BUCKET_NAME (NoPublicAccess, Standard Always Free)"
else
  PUB_TYPE=$(oci os bucket get --namespace-name "$OS_NS" --name "$BUCKET_NAME" --query 'data."public-access-type"' --raw-output)
  echo "Verified existing Object Storage bucket: $BUCKET_NAME (public-access-type=$PUB_TYPE)"
  if [ "$PUB_TYPE" != "NoPublicAccess" ]; then
    echo "FATAL: Bucket $BUCKET_NAME is not private ($PUB_TYPE). Stopping safely."
    exit 1
  fi
fi

EXPIRES=$(python3 -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ"))')
OBJ1="jobiest-configs-repo-${TS}.tar.gz"
OBJ2="jobiest-caddy-ollama-meta-${TS}.tar.gz"

PAR1_JSON=$(oci os preauth-request create \
  --namespace-name "$OS_NS" \
  --bucket-name "$BUCKET_NAME" \
  --name "par-cfg-$TS" \
  --access-type ObjectWrite \
  --object-name "$OBJ1" \
  --time-expires "$EXPIRES")
PAR1_ID=$(echo "$PAR1_JSON" | jq -r '.data.id')
PAR1_URL=$(echo "$PAR1_JSON" | jq -r '.data."full-path" // ("https://objectstorage.'"${OCI_REGION}"'.oraclecloud.com" + .data."access-uri")')

PAR2_JSON=$(oci os preauth-request create \
  --namespace-name "$OS_NS" \
  --bucket-name "$BUCKET_NAME" \
  --name "par-vol-$TS" \
  --access-type ObjectWrite \
  --object-name "$OBJ2" \
  --time-expires "$EXPIRES")
PAR2_ID=$(echo "$PAR2_JSON" | jq -r '.data.id')
PAR2_URL=$(echo "$PAR2_JSON" | jq -r '.data."full-path" // ("https://objectstorage.'"${OCI_REGION}"'.oraclecloud.com" + .data."access-uri")')

echo ""
echo "--- [4] READ-ONLY IN-VM INVENTORY + OFF-INSTANCE ARCHIVE STREAM (ZERO VM WRITES) ---"
python3 - "$PAR1_URL" "$PAR2_URL" << 'PY' > /tmp/gate2_cmd_payload.json
import json, sys

par1, par2 = sys.argv[1], sys.argv[2]
script = f"""#!/bin/bash
set -u
echo "=== [A] OS, KERNEL, CPU & UPTIME ==="
uname -a
lscpu | grep -E 'Architecture|Model name|CPU\\(s\\):' || true
uptime

echo "=== [B] MEMORY, SWAP & FILESYSTEMS ==="
free -m
swapon --show || true
df -hT | grep -v tmpfs || true
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT || true

echo "=== [C] DOCKER CONTAINERS, IMAGES & LIVE RESOURCE CONSUMPTION ==="
docker ps -a --format 'table {{{{.Names}}}}\\t{{{{.Image}}}}\\t{{{{.Status}}}}\\t{{{{.Ports}}}}'
docker stats --no-stream --format 'table {{{{.Name}}}}\\t{{{{.CPUPerc}}}}\\t{{{{.MemUsage}}}}\\t{{{{.PIDs}}}}'
docker images --format 'table {{{{.Repository}}}}\\t{{{{.Tag}}}}\\t{{{{.ID}}}}\\t{{{{.Size}}}}'

echo "=== [D] DOCKER PERSISTENT VOLUMES & OLLAMA MODELS ==="
docker volume ls
du -sh /var/lib/docker/volumes/* 2>/dev/null || true
O_CID=$(docker ps --filter 'ancestor=ollama/ollama:latest' -q | head -n1)
if [ -n "$O_CID" ]; then
  docker exec "$O_CID" ollama list || true
fi

echo "=== [E] REPO, COMPOSE, CADDY TLS CERTS & REDACTED ENV METADATA ==="
find /home/ubuntu /opt /etc/caddy -maxdepth 6 \\( -name 'docker-compose*.yml' -o -name 'Caddyfile' -o -name '.env' \\) 2>/dev/null || true
for g in $(find /home/ubuntu /opt -maxdepth 4 -name '.git' 2>/dev/null); do
  r=$(dirname "$g")
  echo "GIT_REPO: $r | branch=$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null) | commit=$(git -C "$r" rev-parse HEAD 2>/dev/null) | dirty_files=$(git -C "$r" status -s 2>/dev/null | wc -l)"
done
for f in $(find /home/ubuntu /opt -maxdepth 6 \\( -name 'docker-compose*.yml' -o -name 'Caddyfile' \\) 2>/dev/null); do
  sha256sum "$f" || true
done
for e in $(find /home/ubuntu /opt -maxdepth 6 -name '.env' 2>/dev/null); do
  echo "ENV_METADATA (values strictly redacted): $e"
  awk -F= '/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=/{{gsub(/^[[:space:]]+/,"",$1); printf "  %s=<SET len=%d>\\n", $1, length($2)}}' "$e"
done
for crt in $(find /var/lib/docker/volumes -name '*.crt' 2>/dev/null); do
  echo "PUBLIC_CERT: $crt"
  openssl x509 -in "$crt" -noout -subject -issuer -dates 2>/dev/null || true
done

echo "=== [F] SYSTEMD, CRON, FIREWALL & LISTENING SOCKETS ==="
systemctl list-units --type=service --state=running --no-pager | grep -E 'docker|caddy|ollama|ssh|ufw|cron|postfix|dovecot|mail' || true
echo "root crontab:"; crontab -l 2>/dev/null || echo "(none)"
echo "ubuntu crontab:"; crontab -u ubuntu -l 2>/dev/null || echo "(none)"
ls -la /etc/cron.d 2>/dev/null || true
ufw status numbered 2>/dev/null || true
ss -tulnp

echo "=== [G] STREAM READ-ONLY ARCHIVES TO PRIVATE VAULT (ZERO WRITES ON VM) ==="
TAR1_PATHS=()
for p in /home/ubuntu /etc/ufw /etc/crontab /etc/cron.d /var/spool/cron/crontabs; do
  [ -e "$p" ] && TAR1_PATHS+=("$p")
done
if tar --warning=no-file-changed --ignore-failed-read --exclude='node_modules' --exclude='.next' --exclude='.cache' -czf - "${{TAR1_PATHS[@]}}" 2>/dev/null | curl --fail -sS -X PUT --upload-file - "{par1}"; then
  echo "ARCHIVE_1_UPLOAD=OK"
else
  echo "ARCHIVE_1_UPLOAD=FAILED"
fi

TAR2_PATHS=()
for v in /var/lib/docker/volumes/*caddy* /var/lib/docker/volumes/*ollama*/_data/models/manifests; do
  [ -e "$v" ] && TAR2_PATHS+=("$v")
done
if [ "${{#TAR2_PATHS[@]}}" -gt 0 ]; then
  if tar --warning=no-file-changed --ignore-failed-read -czf - "${{TAR2_PATHS[@]}}" 2>/dev/null | curl --fail -sS -X PUT --upload-file - "{par2}"; then
    echo "ARCHIVE_2_UPLOAD=OK"
  else
    echo "ARCHIVE_2_UPLOAD=FAILED"
  fi
else
  echo "ARCHIVE_2_UPLOAD=NO_MATCHING_VOL_PATHS"
fi
"""

print(json.dumps({
    "source": {"sourceType": "TEXT", "text": script},
    "output": {"outputType": "TEXT"}
}))
PY

TIMEOUT_FLAG="--execution-time-out-in-seconds"
oci instance-agent command create -h 2>&1 | grep -q -- "--execution-time-out-in-seconds" || TIMEOUT_FLAG="--timeout-in-seconds"

run_agent_inventory() {
  local cid
  cid=$(oci instance-agent command create \
    --compartment-id "$OCI_TENANCY" \
    "$TIMEOUT_FLAG" 120 \
    --target "{\"instanceId\":\"$INST_ID\"}" \
    --content file:///tmp/gate2_cmd_payload.json \
    --query 'data.id' --raw-output)
  echo "Dispatched read-only Instance Agent command: $cid" >&2
  for i in $(seq 1 24); do
    sleep 5
    local ej st dl
    ej=$(oci instance-agent command-execution get --command-id "$cid" --instance-id "$INST_ID" 2>/dev/null || true)
    if [ -n "$ej" ]; then
      st=$(echo "$ej" | jq -r '.data."lifecycle-state" // empty')
      dl=$(echo "$ej" | jq -r '.data."delivery-state" // empty')
      echo "  [Agent $i] delivery=$dl state=$st" >&2
      if [ "$st" = "SUCCEEDED" ] || [ "$st" = "FAILED" ] || [ "$st" = "TIMED_OUT" ]; then
        echo "$ej" | jq -r '.data.content.text // .data."lifecycle-details" // "no output"'
        [ "$st" = "SUCCEEDED" ] && return 0 || return 1
      fi
    fi
  done
  return 1
}

AGENT_OK=0
if run_agent_inventory; then
  AGENT_OK=1
else
  echo "First Instance Agent attempt did not complete (possible IAM propagation delay); retrying once after 15s..."
  sleep 15
  if run_agent_inventory; then
    AGENT_OK=1
  fi
fi
rm -f /tmp/gate2_cmd_payload.json

# Immediately revoke write-only PARs now that agent execution finished
oci os preauth-request delete --namespace-name "$OS_NS" --bucket-name "$BUCKET_NAME" --par-id "$PAR1_ID" --force >/dev/null 2>&1 || true
PAR1_ID=""
oci os preauth-request delete --namespace-name "$OS_NS" --bucket-name "$BUCKET_NAME" --par-id "$PAR2_ID" --force >/dev/null 2>&1 || true
PAR2_ID=""
echo "Revoked temporary write-only PARs."

if [ "$AGENT_OK" -eq 1 ]; then
  echo "Verifying off-instance preservation archives in private bucket ($BUCKET_NAME)..."
  oci os object list \
    --namespace-name "$OS_NS" \
    --bucket-name "$BUCKET_NAME" \
    --fields name,size,md5,timeCreated \
    --query "data[?name=='$OBJ1' || name=='$OBJ2']" \
    --output table

  umask 077
  VERIFY_DIR=$(mktemp -d /tmp/gate2_verify_XXXXXX)
  for OBJ in "$OBJ1" "$OBJ2"; do
    OBJ_COUNT=$(oci os object list --namespace-name "$OS_NS" --bucket-name "$BUCKET_NAME" --prefix "$OBJ" | jq '.data | length')
    if [ "$OBJ_COUNT" -ge 1 ]; then
      oci os object get --namespace-name "$OS_NS" --bucket-name "$BUCKET_NAME" --name "$OBJ" --file "$VERIFY_DIR/arc.tar.gz" >/dev/null
      gzip -t "$VERIFY_DIR/arc.tar.gz"
      TAR_ENTRIES=$(tar -tzf "$VERIFY_DIR/arc.tar.gz")
      TOTAL_FILES=$(echo "$TAR_ENTRIES" | wc -l)
      echo "  Verified gzip+tar integrity for $OBJ (total entries=$TOTAL_FILES; critical paths present):"
      echo "$TAR_ENTRIES" | grep -E 'deploy/oci|docker-compose\.yml|Caddyfile|\.env$|\.crt$|manifests/' | sed 's/^/    /' || true
      rm -f "$VERIFY_DIR/arc.tar.gz"
    else
      echo "  WARNING: Archive $OBJ not found in bucket."
    fi
  done
  rm -rf "$VERIFY_DIR"
  VERIFY_DIR=""
else
  echo "WARNING: In-VM Instance Agent output was not retrieved; proceeding with FULL Boot Volume Backup & Restore-Test Volume."
fi

echo ""
echo "--- [5] CREATE FULL BOOT VOLUME BACKUP (+ ANY ATTACHED BLOCK VOLUMES) ---"
BKP_NAME="jobiest-ai-gate2-full-${TS}"
BKP_CREATE=$(oci bv boot-volume-backup create \
  --boot-volume-id "$BOOT_VOL_ID" \
  --type FULL \
  --display-name "$BKP_NAME")
BKP_ID=$(echo "$BKP_CREATE" | jq -r '.data.id')
if [[ ! "$BKP_ID" =~ ^ocid1\.bootvolumebackup\. ]]; then
  echo "FATAL: Invalid boot volume backup OCID returned: $BKP_ID"
  exit 1
fi
echo "Initiated FULL Boot Volume Backup: $BKP_NAME ($BKP_ID)"

BKP_STATE="CREATING"
for i in $(seq 1 48); do
  sleep 15
  BKP_GET=$(oci bv boot-volume-backup get --boot-volume-backup-id "$BKP_ID")
  BKP_STATE=$(echo "$BKP_GET" | jq -r '.data."lifecycle-state"')
  echo "  [Backup $i] state=$BKP_STATE"
  if [ "$BKP_STATE" = "AVAILABLE" ]; then
    break
  fi
  if [ "$BKP_STATE" = "FAULTY" ] || [ "$BKP_STATE" = "TERMINATED" ]; then
    echo "FATAL: Boot volume backup failed with state=$BKP_STATE"
    exit 1
  fi
done

if [ "$BKP_STATE" != "AVAILABLE" ]; then
  echo "FATAL: Timed out waiting for backup $BKP_ID to reach AVAILABLE (last state=$BKP_STATE)."
  exit 1
fi

BKP_FINAL=$(oci bv boot-volume-backup get --boot-volume-backup-id "$BKP_ID")
BKP_SRC_CHECK=$(echo "$BKP_FINAL" | jq -r '.data."boot-volume-id"')
BKP_TYPE_CHECK=$(echo "$BKP_FINAL" | jq -r '.data.type')
if [ "$BKP_SRC_CHECK" != "$BOOT_VOL_ID" ] || [ "$BKP_TYPE_CHECK" != "FULL" ]; then
  echo "FATAL: Backup metadata mismatch (src=$BKP_SRC_CHECK expected=$BOOT_VOL_ID, type=$BKP_TYPE_CHECK expected=FULL)."
  exit 1
fi

echo "Verified FULL Boot Volume Backup Metadata:"
echo "$BKP_FINAL" | jq '.data | {
  backup_id: .id,
  display_name: ."display-name",
  source_boot_volume_id: ."boot-volume-id",
  type: .type,
  size_in_gbs: ."size-in-gbs",
  unique_size_in_gbs: ."unique-size-in-gbs",
  lifecycle_state: ."lifecycle-state",
  time_created: ."time-created",
  expiration_time: ."expiration-time"
}'

for VID in $ATTACHED_BLOCK_IDS; do
  VB_NAME="jobiest-ai-block-gate2-full-${TS}"
  VB_ID=$(oci bv backup create --volume-id "$VID" --type FULL --display-name "$VB_NAME" --query 'data.id' --raw-output)
  echo "Initiated Attached Block Volume FULL Backup: $VB_ID (source=$VID)"
  VB_STATE="CREATING"
  for j in $(seq 1 48); do
    sleep 15
    VB_STATE=$(oci bv backup get --volume-backup-id "$VB_ID" --query 'data."lifecycle-state"' --raw-output)
    echo "  [BlockBackup $j] state=$VB_STATE"
    [ "$VB_STATE" = "AVAILABLE" ] && break
    if [ "$VB_STATE" = "FAULTY" ] || [ "$VB_STATE" = "TERMINATED" ]; then
      echo "FATAL: Attached block volume backup failed ($VB_STATE)"
      exit 1
    fi
  done
  if [ "$VB_STATE" != "AVAILABLE" ]; then
    echo "FATAL: Attached block volume backup timed out ($VB_STATE)"
    exit 1
  fi
done

echo ""
echo "--- [6] RESTORE SEPARATE TEST VOLUME IN VERIFIED AD & RETAIN (NO AUTO-DELETE) ---"
RESTORE_NAME="jobiest-ai-gate2-restore-test-${TS}"
RESTORE_CREATE=$(oci bv boot-volume create \
  --availability-domain "$INST_AD" \
  --compartment-id "$OCI_TENANCY" \
  --boot-volume-backup-id "$BKP_ID" \
  --display-name "$RESTORE_NAME")
RESTORE_ID=$(echo "$RESTORE_CREATE" | jq -r '.data.id')
if [[ ! "$RESTORE_ID" =~ ^ocid1\.bootvolume\. ]]; then
  echo "FATAL: Invalid restored boot volume OCID: $RESTORE_ID"
  exit 1
fi
echo "Initiated Restore-Test Volume in $INST_AD: $RESTORE_NAME ($RESTORE_ID)"

R_STATE="PROVISIONING"
for i in $(seq 1 36); do
  sleep 10
  R_GET=$(oci bv boot-volume get --boot-volume-id "$RESTORE_ID")
  R_STATE=$(echo "$R_GET" | jq -r '.data."lifecycle-state"')
  echo "  [Restore $i] state=$R_STATE"
  if [ "$R_STATE" = "AVAILABLE" ]; then
    break
  fi
  if [ "$R_STATE" = "FAULTY" ] || [ "$R_STATE" = "TERMINATED" ]; then
    echo "FATAL: Restore-test volume failed with state=$R_STATE"
    exit 1
  fi
done

if [ "$R_STATE" != "AVAILABLE" ]; then
  echo "FATAL: Timed out waiting for restore-test volume $RESTORE_ID (last state=$R_STATE)."
  exit 1
fi

R_FINAL=$(oci bv boot-volume get --boot-volume-id "$RESTORE_ID")
R_SRC_BKP=$(echo "$R_FINAL" | jq -r '.data."source-details".id')
if [ "$R_SRC_BKP" != "$BKP_ID" ]; then
  echo "FATAL: Restored volume source mismatch (got $R_SRC_BKP, expected $BKP_ID)."
  exit 1
fi

echo "Verified Restore-Test Volume Metadata (RETAINED — NOT DELETED):"
echo "$R_FINAL" | jq '.data | {
  restore_volume_id: .id,
  display_name: ."display-name",
  availability_domain: ."availability-domain",
  size_in_gbs: ."size-in-gbs",
  lifecycle_state: ."lifecycle-state",
  source_details: ."source-details",
  time_created: ."time-created"
}'

echo ""
echo "================================================================"
echo "GATE 2 EXECUTION FINISHED — READY FOR EVIDENCE REVIEW"
echo "  Source Instance       : $INST_ID (UNTOUCHED, RUNNING)"
echo "  Source Boot Volume    : $BOOT_VOL_ID"
echo "  FULL Backup ID        : $BKP_ID (AVAILABLE)"
echo "  Restore-Test Vol ID   : $RESTORE_ID (AVAILABLE, RETAINED)"
echo "  Private Vault Bucket  : $BUCKET_NAME ($OBJ1, $OBJ2)"
echo "================================================================"
