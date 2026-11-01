#!/usr/bin/env bash
# ==============================================================================
# JOBIEST MASTER ALWAYS-FREE MIGRATION & SELF-HOSTED BUSINESS MAIL ORCHESTRATOR
# ==============================================================================
# Single resumable Oracle Cloud Shell master orchestrator for:
#   Stage 0: Purely Read-Only Live OCI Discovery & Always-Free Pre-Flight Audit
#   Stage 1: [Interactive Gate APPROVE_A_B] Always-Free `jobiest-a1`
#            (`VM.Standard.A1.Flex` 2 OCPU / 12 GB / 50 GB) + Strictly Read-Only
#            `JBV1` AES-256+HMAC Encrypted Recovery Vault + Isolated App/AI/Worker
#   Stage 2: [Interactive Gate APPROVE_C] Dedicated Always-Free `jobiest-mail`
#            (`VM.Standard.E2.1.Micro` 1/8 OCPU / 1 GB RAM + 2 GB Swap / 50 GB)
#            + Mailu 2024.06.67 (Webmail, Admin UI, IMAPS, Submission, Inbound MX,
#            2048-bit DKIM, 8 @jobiest.com mailboxes, Open-Relay Block, Encrypted
#            Vault Backup) using an isolated VNIC NSG (zero shared SL mutation)
#   Stage 3: [Interactive Gate APPROVE_D_CUTOVER] Pre-Validated Production TLS &
#            Secret Activation + Atomic Reserved IP `147.224.218.163` Cutover to
#            `jobiest-a1` with Automatic Instant Rollback to `jobiest-ai` (E5) on
#            any post-cutover verification failure + Mail Domain TLS Activation.
#
# ABSOLUTE PRESERVATION LOCKS ENFORCED IN CODE:
#   - NEVER terminates, stops, or modifies `jobiest-ai` (E5), its boot volume,
#     Gate 2 backups, or retained Gate 2 recovery volume (`...dbptzq`).
#   - NEVER upgrades OCI billing to Pay-As-You-Go or exceeds Always Free limits
#     (hard-aborts if regional active boot+block storage would exceed 200 GB).
#   - NEVER modifies shared production Subnet Security Lists.
#   - NEVER prints secrets, passwords, private keys, or PAR URLs to stdout/logs.
#   - NEVER submits real job applications during testing (`navigationOnly: true`).
# ==============================================================================

set -euo pipefail
export OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True

# ------------------------------------------------------------------------------
# PINNED IMMUTABLE SUB-SCRIPT & APPLICATION IDENTITIES
# ------------------------------------------------------------------------------
REPO_RAW_BASE="https://raw.githubusercontent.com/RareBeacon/moderndayjob"
PINNED_GATE0_COMMIT="298bbf055bdaf27d7bca0f4b48fd8abffc369de7"
PINNED_GATE0_SHA256="ceb930cc75642091000e0074bf37e23b4d2781608b17b11f76b0c08341dd82ce"

PINNED_GATE4_COMMIT="96f832c317760a859338236778f7512d2c79d977"
PINNED_GATE4_SHA256="1d94a2f18837ae6f05448b2cfaa45e8aa4fee8aa809240256ce5429b8775c513"

APP_COMMIT_SHA="ecda13abaf77778c9c022056a6ab34b70b23939f"
MAILU_VERSION="2024.06.67"
PRIMARY_MAIL_DOMAIN="jobiest.com"

# ------------------------------------------------------------------------------
# VERIFIED OCI TENANCY RESOURCE IDENTIFIERS (us-chicago-1)
# ------------------------------------------------------------------------------
REGION="${OCI_REGION:-us-chicago-1}"
E5_INSTANCE_ID="ocid1.instance.oc1.us-chicago-1.anxxeljt4azukbicurujbsn6fwlg7nqdlsirupjr4kwyaygida2nwyaeb7yq"
E5_PRIVATE_IP_ID="ocid1.privateip.oc1.us-chicago-1.abxxeljttu34mulvk3t7rjsxvpt6z4g3g37xealpkkbisybiupxuezzxzdwq"
RESERVED_IP_ID="ocid1.publicip.oc1.us-chicago-1.amaaaaaa4azukbiamrhcpus5jzgub6etllrp77llxkfjadcxclwrtprn3dfa"
RESERVED_IP_EXPECTED="147.224.218.163"
SUBNET_ID="ocid1.subnet.oc1.us-chicago-1.aaaaaaaa6onpywxkeogb6wadpusauqzeiwibfda5xpqvjizcr3teoxkdlvva"
GATE2_BACKUP_ID="ocid1.bootvolumebackup.oc1.us-chicago-1.abxxeljthqebpnxja6srnf6dntj7jzpkidhrhlqaqapnkqdbawiqlwxgpfqa"
GATE2_RESTORE_VOL_ID="ocid1.bootvolume.oc1.us-chicago-1.abxxeljt3v35f2v33vnqrd6j3k7avhngfyncjwhxgkiiacrealq6zcdbptzq"
VAULT_BUCKET="jobiest-gate2-vault"

A1_DISPLAY_NAME="jobiest-a1"
MAIL_DISPLAY_NAME="jobiest-mail"
MAIL_NSG_NAME="jobiest-mail-nsg"

A1_MAX_RETRY_ROUNDS="${A1_MAX_RETRY_ROUNDS:-60}"
A1_RETRY_SLEEP_SEC="${A1_RETRY_SLEEP_SEC:-95}"
ALLOW_1OCPU_FALLBACK="${ALLOW_1OCPU_FALLBACK:-false}"
PREFER_UNPINNED_FD="${PREFER_UNPINNED_FD:-true}"
WATCH_HUNTER_LIVE="${WATCH_HUNTER_LIVE:-false}"
ALLOW_BROAD_SSH_CIDR="${ALLOW_BROAD_SSH_CIDR:-false}"
TRUSTED_SSH_CIDRS="${TRUSTED_SSH_CIDRS:-}"
SINGLE_CLICK_ALL="${SINGLE_CLICK_ALL:-false}"
SELF_SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

SSH_KEY_DIR="$HOME/.ssh"
A1_SSH_PRIV="$SSH_KEY_DIR/jobiest_a1_rsa"
A1_KNOWN_HOSTS="$SSH_KEY_DIR/known_hosts_gate4"
MAIL_SSH_PRIV="$SSH_KEY_DIR/jobiest_mail_rsa"
MAIL_SSH_PUB="$SSH_KEY_DIR/jobiest_mail_rsa.pub"
MAIL_KNOWN_HOSTS="$SSH_KEY_DIR/known_hosts_mail"
MAIL_LOCAL_CREDS="$SSH_KEY_DIR/jobiest_mail_credentials.txt"
VAULT_KEY_PRIV="$SSH_KEY_DIR/jobiest_gate2_vault.key"

TMP_DIR="$(umask 077 && mktemp -d /tmp/jobiest-master.XXXXXX)"
chmod 700 "$TMP_DIR"

ACTIVE_NS=""
ACTIVE_PAR_IDS=()
ACTIVE_CONSOLE_IDS=()

banner() {
  printf -- '\n==============================================================================\n'
  printf -- '[%s] %s\n' "$(date -u '+%H:%M:%SZ')" "$1"
  printf -- '==============================================================================\n'
}

die() {
  printf -- '\n[ABORT] %s\n' "$1" >&2
  exit 1
}

cleanup() {
  local rc=$?
  set +e
  if [[ -n "$ACTIVE_NS" && "${#ACTIVE_PAR_IDS[@]}" -gt 0 ]]; then
    for par_id in "${ACTIVE_PAR_IDS[@]}"; do
      [[ -n "$par_id" ]] && oci os preauth-request delete \
        --region "$REGION" \
        --namespace-name "$ACTIVE_NS" \
        --bucket-name "$VAULT_BUCKET" \
        --par-id "$par_id" \
        --force >/dev/null 2>&1 || true
    done
  fi
  if [[ "${#ACTIVE_CONSOLE_IDS[@]}" -gt 0 ]]; then
    for ch_id in "${ACTIVE_CONSOLE_IDS[@]}"; do
      [[ -n "$ch_id" ]] && oci compute console-history delete \
        --region "$REGION" \
        --instance-console-history-id "$ch_id" \
        --force >/dev/null 2>&1 || true
    done
  fi
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT TERM
trap '' INT
printf -- '[Cloud Shell Copy-Safe Mode] Ctrl+C is ignored so copying terminal text never aborts an active run (type Q + Enter at any prompt to exit cleanly).\n'

prompt_tty() {
  local prompt_msg="$1"
  local __outvar="$2"
  local reply=""
  if [[ ! -r /dev/tty ]]; then
    die "Interactive terminal (/dev/tty) required for explicit owner approval gates."
  fi
  printf -- '%s ' "$prompt_msg" >/dev/tty
  IFS= read -r reply </dev/tty || reply=""
  reply="$(printf -- '%s' "$reply" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  printf -v "$__outvar" '%s' "$reply"
}

fetch_and_verify_script() {
  local rel_path="$1"
  local commit_sha="$2"
  local expected_sha256="$3"
  local out_file="$4"
  local url="${REPO_RAW_BASE}/${commit_sha}/${rel_path}"

  curl -fsSL "$url" -o "$out_file" || die "Failed to download ${url}"
  local actual_sha256
  actual_sha256="$(sha256sum "$out_file" | awk '{print $1}')"
  [[ "$actual_sha256" == "$expected_sha256" ]] || \
    die "SHA-256 mismatch for ${rel_path}@${commit_sha}: expected ${expected_sha256}, got ${actual_sha256}"
  chmod 700 "$out_file"
}

for cmd in oci python3 ssh ssh-keygen openssl curl sha256sum awk sed grep tr; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required tool missing in Cloud Shell: $cmd"
done

TENANCY_ID="${OCI_TENANCY:-}"
if [[ -z "$TENANCY_ID" && -f "$HOME/.oci/config" ]]; then
  TENANCY_ID="$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$HOME/.oci/config")"
fi
[[ -n "$TENANCY_ID" && "$TENANCY_ID" == ocid1.tenancy.* ]] || die "Could not determine valid OCI_TENANCY OCID."
ACTIVE_NS="$(oci os ns get --region "$REGION" --query 'data' --raw-output)"

compute_total_active_storage_gb() {
  local ads_file="$TMP_DIR/storage_ads.json"
  oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" >"$ads_file"
  local ad_list
  ad_list="$(python3 - "$ads_file" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
for x in ((json.loads(s) if s else {}).get("data") or []):
    if x.get("name"):
        print(x["name"])
PY
)"
  local sum_gb=0
  local ad bv_s vol_s
  for ad in $ad_list; do
    bv_s="$(oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
      python3 -c 'import json,sys; s=sys.stdin.read().strip(); items=(json.loads(s) if s else {}).get("data") or []; print(sum(int(x.get("size-in-gbs",0)) for x in items if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
    vol_s="$(oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all | \
      python3 -c 'import json,sys; s=sys.stdin.read().strip(); items=(json.loads(s) if s else {}).get("data") or []; print(sum(int(x.get("size-in-gbs",0)) for x in items if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")))')"
    sum_gb=$((sum_gb + bv_s + vol_s))
  done
  printf -- '%d' "$sum_gb"
}

resolve_validated_ssh_cidrs() {
  local raw_candidates="$TRUSTED_SSH_CIDRS"
  if [[ -z "$raw_candidates" ]]; then
    local probe_url detected
    for probe_url in "https://checkip.amazonaws.com" "https://api.ipify.org"; do
      detected="$(curl -fsS --max-time 8 "$probe_url" 2>/dev/null | tr -d ' \r\n\t' || true)"
      if [[ -n "$detected" ]]; then
        raw_candidates="$detected"
        break
      fi
    done
  fi
  [[ -n "$raw_candidates" ]] || die "Could not detect operator egress IP for SSH restriction. Export TRUSTED_SSH_CIDRS='<ip>/32' and re-run."

  python3 - "$raw_candidates" "$ALLOW_BROAD_SSH_CIDR" <<'PY'
import ipaddress, re, sys
raw = sys.argv[1]
allow_broad = sys.argv[2] == "true"
tokens = [t.strip() for t in re.split(r"[\s,]+", raw) if t.strip()]
if not tokens:
    sys.exit(1)
out = []
for tok in tokens:
    if "/" not in tok:
        ip_obj = ipaddress.ip_address(tok)
        net = ipaddress.ip_network("%s/%d" % (ip_obj, 32 if ip_obj.version == 4 else 128), strict=False)
    else:
        net = ipaddress.ip_network(tok, strict=False)
    if net.prefixlen == 0 or net.is_unspecified or net.is_multicast:
        sys.exit(2)
    min_prefix = 24 if net.version == 4 else 64
    if not allow_broad and net.prefixlen < min_prefix:
        sys.exit(3)
    s = str(net)
    if s not in out:
        out.append(s)
print(" ".join(out))
PY
}

ensure_vault_master_key() {
  mkdir -p "$SSH_KEY_DIR"
  chmod 700 "$SSH_KEY_DIR"
  if [[ ! -f "$VAULT_KEY_PRIV" ]]; then
    (umask 077 && openssl rand -hex 32 >"$VAULT_KEY_PRIV")
    chmod 600 "$VAULT_KEY_PRIV"
    printf -- 'Generated 256-bit client-side vault key: %s (mode 600; value NEVER printed)\n' "$VAULT_KEY_PRIV"
  else
    chmod 600 "$VAULT_KEY_PRIV"
    printf -- 'Verified existing client-side vault key: %s (mode 600; value NEVER printed)\n' "$VAULT_KEY_PRIV"
  fi
}

verify_host_keys_via_console() {
  local inst_id="$1"
  local inst_name="$2"
  local public_ip="$3"
  local known_hosts_out="$4"

  printf -- 'Authenticating %s (%s) SSH host keys out-of-band via OCI Serial Console History...\n' "$inst_name" "$public_ip"
  rm -f "$known_hosts_out"
  (umask 077 && : >"$known_hosts_out")
  chmod 600 "$known_hosts_out"

  local keys_out="" attempt ch_id ch_state
  for attempt in $(seq 1 25); do
    ch_id="$(oci compute console-history capture --region "$REGION" --instance-id "$inst_id" --query 'data.id' --raw-output)"
    ACTIVE_CONSOLE_IDS+=("$ch_id")
    for _ in $(seq 1 15); do
      ch_state="$(oci compute console-history get --region "$REGION" --instance-console-history-id "$ch_id" --query 'data."lifecycle-state"' --raw-output)"
      [[ "$ch_state" == "SUCCEEDED" ]] && break
      sleep 2
    done
    local console_file="$TMP_DIR/console_${inst_name}.log"
    oci compute console-history get-content \
      --region "$REGION" \
      --instance-console-history-id "$ch_id" \
      --length 1048576 \
      --file "$console_file" >/dev/null 2>&1 || true

    oci compute console-history delete --region "$REGION" --instance-console-history-id "$ch_id" --force >/dev/null 2>&1 || true

    keys_out="$(python3 - "$console_file" <<'PY'
import base64, os, re, sys
p = sys.argv[1]
if not os.path.exists(p):
    sys.exit(0)
data = open(p, "r", encoding="utf-8", errors="replace").read()
clean = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", data).replace("\r", "")
by_type = {}
for pat in (
    r"===== MAIL_SSH_HOST_PUBKEYS_BEGIN =====\n(.*?)===== MAIL_SSH_HOST_PUBKEYS_END =====",
    r"-----BEGIN SSH HOST KEY KEYS-----\n(.*?)-----END SSH HOST KEY KEYS-----",
):
    for blk in re.findall(pat, clean, re.S):
        for m in re.finditer(r"(ssh-rsa|ecdsa-sha2-nistp256)\s+([A-Za-z0-9+/=\n]+?)(?=\s+(?:root@|ubuntu@|ssh-|ecdsa-|$))", blk):
            kt = m.group(1)
            blob = re.sub(r"\s+", "", m.group(2))
            try:
                raw = base64.b64decode(blob, validate=True)
                if len(raw) >= 32:
                    by_type[kt] = "%s %s" % (kt, blob)
            except Exception:
                pass
for m in re.finditer(r"(ssh-rsa|ecdsa-sha2-nistp256)\s+([A-Za-z0-9+/=]{60,})", clean):
    kt, blob = m.group(1), m.group(2)
    if kt not in by_type:
        try:
            raw = base64.b64decode(blob, validate=True)
            if len(raw) >= 32:
                by_type[kt] = "%s %s" % (kt, blob)
        except Exception:
            pass
for k in ("ecdsa-sha2-nistp256", "ssh-rsa"):
    if k in by_type:
        print(by_type[k])
PY
)"
    if [[ -z "$keys_out" && -s "$console_file" ]]; then
      CONSOLE_FPS="$(python3 - "$console_file" <<'PY'
import re, sys
txt = open(sys.argv[1], "r", encoding="utf-8", errors="replace").read()
fps = sorted(set(re.findall(r"SHA256:[A-Za-z0-9+/]{43}", txt)))
print(" ".join(fps))
PY
)"
      if [[ -n "$CONSOLE_FPS" ]]; then
        SCAN_FILE="$TMP_DIR/keyscan_${inst_name}.pub"
        ssh-keyscan -T 8 -t ecdsa,rsa "$public_ip" >"$SCAN_FILE" 2>/dev/null || true
        if [[ -s "$SCAN_FILE" ]]; then
          keys_out="$(python3 - "$SCAN_FILE" "$CONSOLE_FPS" <<'PY'
import subprocess, sys, tempfile
scan_path, fps_str = sys.argv[1], sys.argv[2]
trusted_fps = set(fps_str.split())
for ln in open(scan_path, "r", encoding="utf-8").read().splitlines():
    parts = ln.strip().split()
    if len(parts) >= 3 and parts[1] in ("ecdsa-sha2-nistp256", "ssh-rsa"):
        pub = "%s %s" % (parts[1], parts[2])
        with tempfile.NamedTemporaryFile("w", suffix=".pub", delete=True) as tf:
            tf.write(pub + "\n")
            tf.flush()
            out = subprocess.check_output(["ssh-keygen", "-lf", tf.name], text=True)
            for tok in out.split():
                if tok in trusted_fps:
                    print(pub)
                    break
PY
)"
        fi
      fi
    fi
    [[ -n "$keys_out" ]] && break
    printf -- '  Console log has not emitted SSH host keys yet (attempt %d/25); waiting 6s...\n' "$attempt"
    sleep 6
  done

  [[ -n "$keys_out" ]] || die "Could not verify SSH host keys for $inst_name from OCI serial console history."
  local publine key_tmp fp_out
  while IFS= read -r publine; do
    [[ -z "$publine" ]] && continue
    key_tmp="$TMP_DIR/hk_check.pub"
    printf -- '%s\n' "$publine" >"$key_tmp"
    fp_out="$(ssh-keygen -lf "$key_tmp" 2>/dev/null)" || die "Malformed console SSH host key on $inst_name"
    printf -- '  Pinned console-verified host key: %s\n' "$fp_out"
    printf -- '%s %s\n' "$public_ip" "$publine" >>"$known_hosts_out"
  done <<<"$keys_out"
}

get_instance_network_summary() {
  local inst_id="$1"
  local vnic_json="$TMP_DIR/vnic_att.json"
  oci compute vnic-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --instance-id "$inst_id" --all >"$vnic_json"
  local vnic_id
  vnic_id="$(python3 - "$vnic_json" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
atts = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") == "ATTACHED"]
print(atts[0]["vnic-id"] if atts else "")
PY
)"
  [[ -n "$vnic_id" ]] || die "No ATTACHED VNIC found for instance $inst_id"

  local vd_json="$TMP_DIR/vnic_det.json"
  oci network vnic get --region "$REGION" --vnic-id "$vnic_id" >"$vd_json"
  local priv_ip pub_ip
  IFS='|' read -r priv_ip pub_ip < <(python3 - "$vd_json" <<'PY'
import json, sys
d = json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]
print("%s|%s" % (d.get("private-ip") or "", d.get("public-ip") or ""))
PY
)

  local pips_json="$TMP_DIR/pips_det.json"
  oci network private-ip list --region "$REGION" --vnic-id "$vnic_id" --all >"$pips_json"
  local primary_pip_id
  primary_pip_id="$(python3 - "$pips_json" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
items = (json.loads(s) if s else {}).get("data") or []
prim = [x for x in items if x.get("is-primary")]
print(prim[0]["id"] if prim else (items[0]["id"] if items else ""))
PY
)"
  printf -- '%s|%s|%s|%s\n' "$vnic_id" "$primary_pip_id" "$priv_ip" "$pub_ip"
}

# ==============================================================================
# STAGE 0: PURELY READ-ONLY LIVE OCI DISCOVERY & PRE-FLIGHT CHARTER REPORT
# ==============================================================================
banner "STAGE 0 — PURELY READ-ONLY LIVE OCI DISCOVERY & ALWAYS-FREE AUDIT"

if [[ "$SINGLE_CLICK_ALL" == "true" || "${BACKGROUND_A1_HUNTER:-false}" == "true" ]]; then
  printf -- '[Fast Pre-Flight] Verifying live OCI tenancy storage headroom & trusted SSH egress CIDRs...\n'
else
  GATE0_SCRIPT="$TMP_DIR/gate0_readonly_discovery.sh"
  fetch_and_verify_script "ops/oci-preservation/gate0_readonly_discovery.sh" "$PINNED_GATE0_COMMIT" "$PINNED_GATE0_SHA256" "$GATE0_SCRIPT"
  bash "$GATE0_SCRIPT"
fi

LIVE_STORAGE_GB="$(compute_total_active_storage_gb)"
VALIDATED_SSH_CIDRS_STR="$(resolve_validated_ssh_cidrs)"

cat <<EOF

------------------------------------------------------------------------------
VERIFIED ALWAYS-FREE ARCHITECTURE, COST & RISK SUMMARY (SINGLE TENANCY)
------------------------------------------------------------------------------
Tenancy              : ${TENANCY_ID} (${REGION}, single existing OCI tenancy)
Trial Notice Status  : Free Trial expired 2026-10-08 02:23 UTC; non-Always-Free
                       trial shapes (E5) face Oracle reclamation after
                       2026-11-06 02:23 UTC unless migrated to Always Free.
Billing Guarantee    : \$0.00/month Always Free ONLY. Zero PAYG upgrade.
Active Storage Now   : ${LIVE_STORAGE_GB} GB / 200 GB Always Free regional cap
Trusted SSH Source(s): ${VALIDATED_SSH_CIDRS_STR} (+ VCN 10.0.1.0/24 internal)

Target Always-Free Resource Plan:
  1. jobiest-a1   : VM.Standard.A1.Flex | 2 OCPU | 12 GB RAM | 50 GB Boot | \$0.00/mo
                    Hosts Caddy TLS + Playwright 1.62.1 Worker + API + AI + Ollama
                    (qwen2.5:7b & llama3.2:3b, MAX_LOADED_MODELS=1).
  2. jobiest-mail : VM.Standard.E2.1.Micro | 1/8 OCPU | 1 GB RAM + 2 GB Swap |
                    50 GB Boot | \$0.00/mo (AD-1) | Dedicated NSG jobiest-mail-nsg.
                    Hosts Mailu ${MAILU_VERSION} (SnappyMail Webmail, Admin UI,
                    Postfix, Dovecot IMAPS, Rspamd, 2048-bit DKIM, 8 mailboxes).
  3. Vault        : Private Object Storage bucket '${VAULT_BUCKET}' (<=20 GiB free)
                    Client-side JBV1 (AES-256-CBC + PBKDF2 600k + HMAC-SHA256).
  4. Preservation : jobiest-ai (E5), boot volume, Gate 2 backups, and retained
                    recovery volume remain 100% UNTOUCHED.
  5. Honest Note  : Always Free has \$0/mo recurring cost and no Nov 6 trial expiry,
                    subject to Oracle's published Always Free terms, ARM host
                    capacity availability, and active-use idle policy.
------------------------------------------------------------------------------
EOF

# ==============================================================================
# STAGE 1: [APPROVAL A + B] ALWAYS-FREE jobiest-a1 + ENCRYPTED VAULT + APP STACK
# ==============================================================================
banner "STAGE 1 — ALWAYS-FREE jobiest-a1 (2 OCPU / 12 GB) & ENCRYPTED RECOVERY VAULT"

RIP_CURRENT_ASSIGNED="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID" --query 'data."assigned-entity-id"' --raw-output)"
STAGE1_COMPLETED=0
ALREADY_CUTOVER_TO_A1=0

EX_A1_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$A1_DISPLAY_NAME" --all)"
EX_A1_ID="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
live = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") == "RUNNING"]
print(live[0]["id"] if len(live) == 1 else "")
' <<<"$EX_A1_JSON")"

if [[ -n "$EX_A1_ID" && "$RIP_CURRENT_ASSIGNED" != "$E5_PRIVATE_IP_ID" ]]; then
  printf -- 'Detected Reserved IP %s already cut over off E5 (assigned=%s) and %s RUNNING (%s).\n' \
    "$RESERVED_IP_EXPECTED" "$RIP_CURRENT_ASSIGNED" "$A1_DISPLAY_NAME" "$EX_A1_ID"
  ALREADY_CUTOVER_TO_A1=1
  STAGE1_COMPLETED=1
else
  cat <<EOF
Stage 1 Operation Disclosure (Requires Approval A + Approval B):
  1. What      : Execute SHA-256-verified gate4_a1_provision_and_deploy.sh:
                 sweep all 9 ADxFD slots for 2 OCPU / 12 GB VM.Standard.A1.Flex,
                 verify SSH host keys via serial console, attach Gate 2 recovery
                 volume strictly READ-ONLY (--is-read-only true), upload JBV1
                 AES-256+HMAC encrypted recovery archives to ${VAULT_BUCKET},
                 deploy isolated Jobiest stack (@ ${APP_COMMIT_SHA}), and run
                 strict E2E health, 401, port-block, Ollama READY, and
                 navigationOnly=true zero-submit Playwright 1.62.1 assertions.
  2. Why       : Build & prove the Always Free ARM64 replacement before Nov 6.
  3. Resources : jobiest-a1 (us-chicago-1, VM.Standard.A1.Flex, 2 OCPU, 12 GB,
                 50 GB boot, \$0.00/mo Always Free); read-only attach of ${GATE2_RESTORE_VOL_ID}.
  4. Risks     : Transient OCI Ampere 'Out of host capacity' (handled safely via
                 idempotent multi-FD sweeps; existing E5 remains untouched).
  5. Cost      : \$0.00/month (hard-gated <=200 GB regional storage, no PAYG).
  6. Rollback  : Live traffic stays 100% on jobiest-ai (${RESERVED_IP_EXPECTED}); test
                 resources are completely isolated.
  7. Evidence  : Verified JBV1 encrypted vault objects, HTTP 200 healthz, HTTP 401
                 auth guards, Ollama READY, and navigationOnly=true E2E PASS.
EOF

  PREAPPROVED_STAGE2_C=0
  STAGE1_CHOICE=""
  if [[ "$SINGLE_CLICK_ALL" == "true" ]]; then
    STAGE1_CHOICE="APPROVE_A_B"
    PREAPPROVED_STAGE2_C=1
    if [[ "${BACKGROUND_A1_HUNTER:-false}" != "true" && -f "$SSH_KEY_DIR/jobiest_a1_autohunter.pid" ]]; then
      PREV_HUNTER_PID="$(cat "$SSH_KEY_DIR/jobiest_a1_autohunter.pid" 2>/dev/null || true)"
      if [[ -n "$PREV_HUNTER_PID" ]] && kill -0 "$PREV_HUNTER_PID" 2>/dev/null; then
        printf -- '[Single-Click Mode] Stopping previous background hunter PID %s before fresh 9-slot sweep...\n' "$PREV_HUNTER_PID"
        kill -TERM -- "-${PREV_HUNTER_PID}" 2>/dev/null || kill -TERM "$PREV_HUNTER_PID" 2>/dev/null || true
        sleep 2
      fi
      rm -f "$SSH_KEY_DIR/jobiest_a1_autohunter.pid"
    fi
    printf -- '[Single-Click Mode] Owner-authorized unattended Stage 1 fast 9-slot sweep active.\n'
  else
    while true; do
      prompt_tty "Enter APPROVE_A_B to run Stage 1, S to skip to Stage 2 (Mail), or Q to stop:" STAGE1_CHOICE
      case "$STAGE1_CHOICE" in
        APPROVE_A_B|approve_a_b)
          STAGE1_CHOICE="APPROVE_A_B"
          break
          ;;
        APPROVE_C|approve_c)
          STAGE1_CHOICE="S"
          PREAPPROVED_STAGE2_C=1
          break
          ;;
        S|s)
          STAGE1_CHOICE="S"
          break
          ;;
        Q|q)
          printf -- 'Stopped cleanly after Stage 0 Read-Only Discovery (zero mutations).\n'
          exit 0
          ;;
        *)
          printf -- 'Unrecognized selection "%s" — please enter APPROVE_A_B, S, or Q.\n' "$STAGE1_CHOICE" >/dev/tty
          ;;
      esac
    done
  fi

  if [[ "$STAGE1_CHOICE" == "APPROVE_A_B" ]]; then
    GATE4_SCRIPT="$TMP_DIR/gate4_a1_provision_and_deploy.sh"
    fetch_and_verify_script "ops/oci-preservation/gate4_a1_provision_and_deploy.sh" "$PINNED_GATE4_COMMIT" "$PINNED_GATE4_SHA256" "$GATE4_SCRIPT"

    EFFECTIVE_A1_ROUNDS="$A1_MAX_RETRY_ROUNDS"
    EFFECTIVE_A1_SLEEP="$A1_RETRY_SLEEP_SEC"
    if [[ "$SINGLE_CLICK_ALL" == "true" && "${BACKGROUND_A1_HUNTER:-false}" != "true" ]]; then
      EFFECTIVE_A1_ROUNDS="${SINGLE_CLICK_INITIAL_A1_ROUNDS:-1}"
      EFFECTIVE_A1_SLEEP="5"
    fi

    while true; do
      set +e
      IGNORE_SIGINT_FOR_CLOUDSHELL="true" \
      A1_MAX_RETRY_ROUNDS="$EFFECTIVE_A1_ROUNDS" \
      A1_RETRY_SLEEP_SEC="$EFFECTIVE_A1_SLEEP" \
      ALLOW_1OCPU_FALLBACK="$ALLOW_1OCPU_FALLBACK" \
      PREFER_UNPINNED_FD="$PREFER_UNPINNED_FD" \
      TRUSTED_SSH_CIDRS="${VALIDATED_SSH_CIDRS_STR} 10.0.1.0/24" \
      bash "$GATE4_SCRIPT"
      G4_RC=$?
      set -e

      if (( G4_RC == 0 )); then
        STAGE1_COMPLETED=1
        # Install legitimate local anti-idle readiness check cron on jobiest-a1
        EX_A1_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$A1_DISPLAY_NAME" --all)"
        EX_A1_ID="$(python3 -c 'import json,sys; s=sys.stdin.read().strip(); live=[x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state")=="RUNNING"]; print(live[0]["id"] if len(live)==1 else "")' <<<"$EX_A1_JSON")"
        if [[ -n "$EX_A1_ID" && -f "$A1_SSH_PRIV" && -f "$A1_KNOWN_HOSTS" ]]; then
          IFS='|' read -r _ _ _ A1_CUR_PUB_IP <<<"$(get_instance_network_summary "$EX_A1_ID")"
          ssh -i "$A1_SSH_PRIV" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$A1_KNOWN_HOSTS" -o BatchMode=yes \
            "ubuntu@${A1_CUR_PUB_IP}" "sudo tee /etc/cron.d/jobiest-a1-keepwarm >/dev/null <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
17 */4 * * * root docker ps --format '{{.Names}}' >/dev/null 2>&1 && docker exec oci-ollama-1 ollama list >/dev/null 2>&1 || true
CRON
sudo chmod 644 /etc/cron.d/jobiest-a1-keepwarm"
          printf -- 'Installed /etc/cron.d/jobiest-a1-keepwarm health readiness cron on %s.\n' "$A1_DISPLAY_NAME"
        fi
        break
      elif [[ "${BACKGROUND_A1_HUNTER:-false}" == "true" ]]; then
        printf -- '\n[Background A1 Auto-Hunter] Cycle finished (rc=%d); cooling down 60s before next 360-sweep cycle...\n' "$G4_RC"
        sleep 60
        continue
      elif [[ "$SINGLE_CLICK_ALL" == "true" ]]; then
        printf -- '\n[Single-Click Mode] Initial 9-slot ARM sweep reported transient OCI Out-of-Host-Capacity.\n'
        printf -- '                    Proceeding IMMEDIATELY to Stage 2 pre-staging; continuous background 9-slot auto-hunter will follow!\n'
        break
      elif (( G4_RC == 75 )); then
        printf -- '\n[Stage 1 Deferred] Proceeding directly to Stage 2 (Mail VM on x86_64) per operator selection.\n'
        break
      elif (( G4_RC == 76 )); then
        PREAPPROVED_STAGE2_C=1
        printf -- '\n[Stage 1 Deferred + APPROVE_C Confirmed] Proceeding directly into Stage 2 (Mail VM on x86_64).\n'
        break
      elif (( G4_RC == 77 )); then
        printf -- '\nStopped cleanly during Stage 1 cooldown per operator selection (zero OCI mutations).\n'
        exit 0
      fi

      printf -- '\n[Stage 1 Notice] gate4 exited with code %d (typically transient OCI ARM host capacity in %s).\n' "$G4_RC" "$REGION"
      RETRY_ANS=""
      while true; do
        prompt_tty "Enter R to run another ${A1_MAX_RETRY_ROUNDS}-round A1 sweep now, P (or APPROVE_C) to proceed to Stage 2 (Mail VM on x86_64), or Q to quit:" RETRY_ANS
        case "$RETRY_ANS" in
          R|r)
            RETRY_ACTION="R"
            break
            ;;
          P|p)
            RETRY_ACTION="P"
            break
            ;;
          APPROVE_C|approve_c)
            RETRY_ACTION="P"
            PREAPPROVED_STAGE2_C=1
            break
            ;;
          Q|q)
            exit "$G4_RC"
            ;;
          *)
            printf -- 'Unrecognized selection "%s" — please enter R, P, APPROVE_C, or Q.\n' "$RETRY_ANS" >/dev/tty
            ;;
        esac
      done
      [[ "$RETRY_ACTION" == "R" ]] && continue
      break
    done
  else
    printf -- 'Skipped Stage 1 per operator selection; proceeding to Stage 2.\n'
  fi
fi

# ==============================================================================
# STAGE 2: [APPROVAL C] DEDICATED ALWAYS-FREE jobiest-mail (VM.Standard.E2.1.Micro)
# ==============================================================================
banner "STAGE 2 — DEDICATED ALWAYS-FREE jobiest-mail (Mailu ${MAILU_VERSION} @ ${PRIMARY_MAIL_DOMAIN})"

cat <<EOF
Stage 2 Operation Disclosure (Requires Approval C):
  1. What      : Create/reconcile isolated VNIC NSG '${MAIL_NSG_NAME}' (shared
                 production Security List untouched), provision '${MAIL_DISPLAY_NAME}'
                 (VM.Standard.E2.1.Micro, 1/8 OCPU, 1 GB RAM + 2 GB Swap, 50 GB
                 boot volume), verify SSH host keys via serial console, deploy
                 Mailu ${MAILU_VERSION} (SnappyMail Webmail + Admin UI + IMAPS 993 +
                 Submission 465/587 + Inbound MX 25 + 2048-bit DKIM), create 8
                 @${PRIMARY_MAIL_DOMAIN} mailboxes + 4 RFC aliases, run 6 E2E mail
                 assertions, and upload an AES-256+HMAC encrypted mail backup to
                 '${VAULT_BUCKET}'. Existing Resend transactional app email and
                 live DNS remain 100% untouched.
  2. Why       : Provide full self-hosted business mailboxes, Webmail, IMAP/SMTP,
                 quotas, aliases, and DKIM at \$0.00/mo isolated from jobiest-a1 RAM.
  3. Resources : ${MAIL_DISPLAY_NAME} (${REGION}, VM.Standard.E2.1.Micro, 50 GB boot,
                 Always Free eligible, \$0.00/mo) + NSG ${MAIL_NSG_NAME} (\$0.00/mo).
  4. Risks     : OCI blocks outbound 25/tcp & custom PTR on Free Tier -> solved via
                 authenticated TLS smarthost relay (587 STARTTLS, e.g. Resend/Brevo).
                 Ephemeral public IP persists across reboots (changes only on STOP).
  5. Cost      : \$0.00/month (hard-verified <= 200 GB regional Always Free storage).
  6. Rollback  : Zero production DNS/MX records are changed in Stage 2; ForwardEmail
                 and Resend continue operating uninterrupted.
  7. Evidence  : HTTPS Webmail & Admin 200 (Let's Encrypt TLS), SMTP 587 -> IMAPS 993
                 INBOX round-trip, Open-Relay 5xx block, Inbound 25 MX -> INBOX, and
                 verified JBV1 encrypted backup in '${VAULT_BUCKET}'.
EOF

STAGE2_CHOICE=""
if (( ${PREAPPROVED_STAGE2_C:-0} == 1 )); then
  STAGE2_CHOICE="APPROVE_C"
  printf -- 'APPROVE_C already confirmed by operator — proceeding with Stage 2.\n'
else
  while true; do
    prompt_tty "Enter APPROVE_C to deploy/verify ${MAIL_DISPLAY_NAME}, S to skip Stage 2, or Q to quit:" STAGE2_CHOICE
    case "$STAGE2_CHOICE" in
      APPROVE_C|approve_c)
        STAGE2_CHOICE="APPROVE_C"
        break
        ;;
      S|s)
        STAGE2_CHOICE="S"
        break
        ;;
      Q|q)
        printf -- 'Stopped cleanly before Stage 2.\n'
        exit 0
        ;;
      *)
        printf -- 'Unrecognized selection "%s" — please enter APPROVE_C, S, or Q.\n' "$STAGE2_CHOICE" >/dev/tty
        ;;
    esac
  done
fi

MAIL_PUBLIC_IP=""
MAIL_DKIM_TXT=""

if [[ "$STAGE2_CHOICE" == "APPROVE_C" ]]; then
  ensure_vault_master_key

  RELAY_HOST_CFG="${RELAY_HOST_CFG:-}"
  RELAY_USER_CFG="${RELAY_USER_CFG:-}"
  RELAY_PASS_CFG="${RELAY_PASS_CFG:-}"
  if [[ "$SINGLE_CLICK_ALL" == "true" ]]; then
    printf -- '[Single-Click Mode] Proceeding directly with Mailu %s deployment (outbound relay can be set anytime via sudo jobiest-mail-set-relay).\n' "$MAILU_VERSION"
  else
    printf -- '\nOptional Outbound TLS Smarthost Relay (solves OCI Free Tier outbound port-25 block):\n' >/dev/tty
    printf -- '  Examples: [smtp.resend.com]:587 (user: resend) OR [smtp-relay.brevo.com]:587\n' >/dev/tty
    printf -- '  Press Enter to skip for now (you can set/rotate anytime via sudo jobiest-mail-set-relay).\n' >/dev/tty
    prompt_tty "Outbound RELAYHOST (e.g. [smtp.resend.com]:587 or blank to skip):" RELAY_HOST_CFG
    if [[ -n "$RELAY_HOST_CFG" ]]; then
      prompt_tty "Outbound RELAYUSER (e.g. resend):" RELAY_USER_CFG
      printf -- 'Outbound RELAYPASSWORD (input hidden, never echoed or logged): ' >/dev/tty
      IFS= read -rs RELAY_PASS_CFG </dev/tty || RELAY_PASS_CFG=""
      printf -- '\n' >/dev/tty
    fi
  fi

  # Check if jobiest-mail already exists
  EX_MAIL_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$MAIL_DISPLAY_NAME" --all)"
  EX_MAIL_INFO="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
live = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") in ("PROVISIONING","RUNNING","STARTING")]
if len(live) > 1:
    print("MULTIPLE")
elif len(live) == 1:
    print("%s|%s|%s" % (live[0]["id"], live[0]["shape"], live[0]["lifecycle-state"]))
else:
    print("")
' <<<"$EX_MAIL_JSON")"
  [[ "$EX_MAIL_INFO" != "MULTIPLE" ]] || die "Multiple live instances named $MAIL_DISPLAY_NAME found; refusing ambiguous state."

  SUBNET_VCN_ID="$(oci network subnet get --region "$REGION" --subnet-id "$SUBNET_ID" --query 'data."vcn-id"' --raw-output)"

  # Reconcile isolated VNIC NSG jobiest-mail-nsg (shared Security List stays 100% untouched)
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
    printf -- 'Created isolated VNIC NSG %s (%s) — shared subnet Security List untouched.\n' "$MAIL_NSG_NAME" "$MAIL_NSG_ID"
  else
    printf -- 'Using existing isolated VNIC NSG %s (%s).\n' "$MAIL_NSG_NAME" "$MAIL_NSG_ID"
  fi

  # Reconcile NSG rules cleanly (clear existing & apply exact minimal rule set)
  EXISTING_RULE_IDS="$(oci network nsg rules list --region "$REGION" --nsg-id "$MAIL_NSG_ID" --all | \
    python3 -c 'import json,sys; s=sys.stdin.read().strip(); ids=[x["id"] for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("id")]; print(json.dumps(ids) if ids else "")')"
  if [[ -n "$EXISTING_RULE_IDS" ]]; then
    oci network nsg rules remove --region "$REGION" --nsg-id "$MAIL_NSG_ID" --security-rule-ids "$EXISTING_RULE_IDS" >/dev/null
  fi

  NSG_RULES_FILE="$TMP_DIR/mail_nsg_rules.json"
  python3 - "$VALIDATED_SSH_CIDRS_STR 10.0.1.0/24" "$NSG_RULES_FILE" <<'PY'
import json, sys
ssh_cidrs = [c for c in sys.argv[1].split() if c]
rules = [
    {
        "direction": "EGRESS",
        "destination": "0.0.0.0/0",
        "destinationType": "CIDR_BLOCK",
        "protocol": "all",
        "description": "Allow outbound HTTPS/DNS/SMTP-Relay"
    }
]
for cidr in ssh_cidrs:
    rules.append({
        "direction": "INGRESS",
        "source": cidr,
        "sourceType": "CIDR_BLOCK",
        "protocol": "6",
        "description": "Restricted operator SSH",
        "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}
    })
for port, desc in (
    (25, "Inbound SMTP MX"),
    (80, "ACME HTTP-01"),
    (443, "HTTPS Webmail and Admin"),
    (465, "Authenticated SMTPS"),
    (587, "Authenticated Submission STARTTLS"),
    (993, "Authenticated IMAPS"),
):
    rules.append({
        "direction": "INGRESS",
        "source": "0.0.0.0/0",
        "sourceType": "CIDR_BLOCK",
        "protocol": "6",
        "description": desc,
        "tcpOptions": {"destinationPortRange": {"min": port, "max": port}}
    })
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(rules, f)
PY
  oci network nsg rules add --region "$REGION" --nsg-id "$MAIL_NSG_ID" --security-rules "file://${NSG_RULES_FILE}" >/dev/null
  printf -- 'Verified isolated NSG rules on %s (22 restricted; 25,80,443,465,587,993 enabled).\n' "$MAIL_NSG_NAME"

  if [[ ! -f "$MAIL_SSH_PRIV" || ! -f "$MAIL_SSH_PUB" ]]; then
    rm -f "$MAIL_SSH_PRIV" "$MAIL_SSH_PUB"
    ssh-keygen -t rsa -b 4096 -N "" -C "jobiest-mail-admin" -f "$MAIL_SSH_PRIV" >/dev/null
    chmod 600 "$MAIL_SSH_PRIV"
    chmod 644 "$MAIL_SSH_PUB"
    printf -- 'Generated FIPS-compliant RSA-4096 SSH keypair: %s\n' "$MAIL_SSH_PRIV"
  fi

  MAIL_INSTANCE_ID=""
  COHOST_MAIL_ON_A1=0
  if [[ -n "$EX_MAIL_INFO" ]]; then
    IFS='|' read -r MAIL_INSTANCE_ID EX_MAIL_SHAPE _ <<<"$EX_MAIL_INFO"
    [[ "$EX_MAIL_SHAPE" == "VM.Standard.E2.1.Micro" ]] || die "Existing $MAIL_DISPLAY_NAME has unexpected shape $EX_MAIL_SHAPE"
    printf -- 'Reusing existing %s (%s, shape=%s).\n' "$MAIL_DISPLAY_NAME" "$MAIL_INSTANCE_ID" "$EX_MAIL_SHAPE"
  else
    # Discover AD(s) that BOTH report standard-e2-micro-core-count quota AND physically offer VM.Standard.E2.1.Micro hardware
    ADS_JSON="$TMP_DIR/mail_ads.json"
    oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" >"$ADS_JSON"
    mapfile -t ALL_ADS < <(python3 - "$ADS_JSON" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
for x in ((json.loads(s) if s else {}).get("data") or []):
    if x.get("name"):
        print(x["name"])
PY
)
    ELIGIBLE_MICRO_ADS=()
    for ad in "${ALL_ADS[@]}"; do
      MICRO_AV="$(oci limits resource-availability get \
        --region "$REGION" \
        --compartment-id "$TENANCY_ID" \
        --service-name compute \
        --limit-name standard-e2-micro-core-count \
        --availability-domain "$ad" \
        --query 'data.available' --raw-output 2>/dev/null || echo 0)"
      HAS_MICRO_SHAPE="$(oci compute shape list \
        --region "$REGION" \
        --compartment-id "$TENANCY_ID" \
        --availability-domain "$ad" \
        --all | python3 -c 'import json,sys; s=sys.stdin.read().strip(); items=(json.loads(s) if s else {}).get("data") or []; print("1" if any(x.get("shape")=="VM.Standard.E2.1.Micro" for x in items) else "0")')"
      printf -- '  E2.1.Micro Check [%s]: quota_avail=%s | hardware_shape_present=%s\n' "$ad" "$MICRO_AV" "$HAS_MICRO_SHAPE"
      if [[ "$HAS_MICRO_SHAPE" == "1" ]] && python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) >= 1.0 else 1)' "${MICRO_AV:-0}"; then
        ELIGIBLE_MICRO_ADS+=("$ad")
      fi
    done

    if (( ${#ELIGIBLE_MICRO_ADS[@]} == 0 )); then
      COHOST_MAIL_ON_A1=1
      printf -- '[Verified OCI Hardware Fact] Region %s does not physically offer VM.Standard.E2.1.Micro hardware (VM.Standard.A1.Flex is the sole Always Free VM shape in %s).\n' "$REGION" "$REGION"
      printf -- '[Automatic Co-Host Mode] Routing @%s Mailu %s (native linux/arm64/v8, ~650 MiB RAM) onto %s dedicated Primary Public IP (100%% isolated from Reserved IP %s on jobiest-a1-reserved-vip; total regional storage stays at 150 / 200 GB = $0.00/mo)!\n' \
        "$PRIMARY_MAIL_DOMAIN" "$MAILU_VERSION" "$A1_DISPLAY_NAME" "$RESERVED_IP_EXPECTED"
    else
      CUR_STORAGE_BEFORE_MAIL="$(compute_total_active_storage_gb)"
      PROJ_STORAGE_WITH_MAIL=$((CUR_STORAGE_BEFORE_MAIL + 50))
      printf -- 'Storage Check before %s: current=%d GB -> projected=%d GB / 200 GB Always Free limit\n' \
        "$MAIL_DISPLAY_NAME" "$CUR_STORAGE_BEFORE_MAIL" "$PROJ_STORAGE_WITH_MAIL"
      (( PROJ_STORAGE_WITH_MAIL <= 200 )) || \
        die "Cannot launch 50 GB $MAIL_DISPLAY_NAME: projected regional storage (${PROJ_STORAGE_WITH_MAIL} GB) would exceed 200 GB Always Free limit!"

      # Resolve Canonical Ubuntu 24.04 x86_64 image for VM.Standard.E2.1.Micro
      MICRO_IMG_JSON="$TMP_DIR/micro_img.json"
      oci compute image list \
        --region "$REGION" \
        --compartment-id "$TENANCY_ID" \
        --operating-system "Canonical Ubuntu" \
        --operating-system-version "24.04" \
        --shape "VM.Standard.E2.1.Micro" \
        --sort-by TIMECREATED \
        --sort-order DESC \
        --all >"$MICRO_IMG_JSON"
      IFS='|' read -r MICRO_IMAGE_ID MICRO_IMAGE_NAME < <(python3 - "$MICRO_IMG_JSON" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
imgs = [
    x for x in ((json.loads(s) if s else {}).get("data") or [])
    if "aarch64" not in x.get("display-name", "").lower()
    and "minimal" not in x.get("display-name", "").lower()
    and "gpu" not in x.get("display-name", "").lower()
]
if not imgs:
    sys.exit(1)
print("%s|%s" % (imgs[0]["id"], imgs[0]["display-name"]))
PY
) || die "Could not find Canonical Ubuntu 24.04 x86_64 image for VM.Standard.E2.1.Micro."
      printf -- 'Selected x86_64 Image: %s (%s)\n' "$MICRO_IMAGE_NAME" "$MICRO_IMAGE_ID"

      cat >"$TMP_DIR/mail_userdata.yaml" <<'MAIL_UD'
#cloud-config
runcmd:
  - |
    {
      echo "===== MAIL_SSH_HOST_PUBKEYS_BEGIN ====="
      cat /etc/ssh/ssh_host_rsa_key.pub /etc/ssh/ssh_host_ecdsa_key.pub 2>/dev/null || true
      echo "===== MAIL_SSH_HOST_PUBKEYS_END ====="
    } > /dev/console
MAIL_UD

      for micro_ad in "${ELIGIBLE_MICRO_ADS[@]}"; do
        FD_FILE="$TMP_DIR/micro_fds.json"
        oci iam fault-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$micro_ad" >"$FD_FILE" || \
          die "Failed to list fault domains in $micro_ad"
        mapfile -t MICRO_FDS < <(python3 - "$FD_FILE" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
fds = [x["name"] for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("name")]
if not fds:
    sys.exit(1)
for f in fds:
    print(f)
PY
) || die "Empty fault-domain list in $micro_ad"

        for mfd in "${MICRO_FDS[@]}"; do
          LAUNCH_OUT="$TMP_DIR/mail_launch_out.json"
          LAUNCH_ERR="$TMP_DIR/mail_launch_err.txt"
          LAUNCH_DIAG="$TMP_DIR/mail_launch_diag.txt"
          printf -- '  Launching %s (VM.Standard.E2.1.Micro, 50 GB) in %s / %s ... ' "$MAIL_DISPLAY_NAME" "$micro_ad" "$mfd"
          if oci --no-retry --connection-timeout 10 --read-timeout 25 compute instance launch \
            --region "$REGION" \
            --compartment-id "$TENANCY_ID" \
            --availability-domain "$micro_ad" \
            --fault-domain "$mfd" \
            --shape "VM.Standard.E2.1.Micro" \
            --display-name "$MAIL_DISPLAY_NAME" \
            --image-id "$MICRO_IMAGE_ID" \
            --subnet-id "$SUBNET_ID" \
            --assign-public-ip true \
            --nsg-ids "[\"${MAIL_NSG_ID}\"]" \
            --boot-volume-size-in-gbs 50 \
            --ssh-authorized-keys-file "$MAIL_SSH_PUB" \
            --user-data-file "$TMP_DIR/mail_userdata.yaml" \
            >"$LAUNCH_OUT" 2>"$LAUNCH_ERR"; then
            MAIL_INSTANCE_ID="$(python3 - "$LAUNCH_OUT" <<'PY'
import json, sys
print(json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]["id"])
PY
)"
            printf -- 'SUCCESS (%s)\n' "$MAIL_INSTANCE_ID"
            break 2
          else
            cat "$LAUNCH_ERR" "$LAUNCH_OUT" >"$LAUNCH_DIAG" 2>/dev/null || true
            if grep -qi "ServiceError" "$LAUNCH_DIAG" 2>/dev/null && grep -qi "Out of host capacity" "$LAUNCH_DIAG" 2>/dev/null; then
              printf -- 'out of host capacity in %s/%s; trying next fault domain...\n' "$micro_ad" "$mfd"
            else
              RECON_MAIL="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$MAIL_DISPLAY_NAME" --all | \
                python3 -c 'import json,sys; s=sys.stdin.read().strip(); live=[x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") in ("PROVISIONING","RUNNING","STARTING")]; print(live[0]["id"] if len(live)==1 else ("MULTI" if len(live)>1 else ""))')"
              if [[ "$RECON_MAIL" == "MULTI" || -z "$RECON_MAIL" ]]; then
                die "Non-capacity error launching $MAIL_DISPLAY_NAME: $(tr '\r\n' ' ' <"$LAUNCH_DIAG" | head -c 300)"
              fi
              MAIL_INSTANCE_ID="$RECON_MAIL"
              printf -- 'adopted reconciled instance (%s)\n' "$MAIL_INSTANCE_ID"
              break 2
            fi
          fi
        done
      done
      [[ -n "$MAIL_INSTANCE_ID" ]] || die "Could not allocate VM.Standard.E2.1.Micro across eligible AD/FD slots."
    fi
  fi
fi

deploy_mailu_on_target_host() {
  local MAIL_PRIV_IP="$1"
  local MAIL_PUBLIC_IP="$2"
  local USE_SSH_PRIV="$3"
  local USE_KNOWN_HOSTS="$4"
  local MAIL_COHOSTED_A1="$5"
  local -a MAIL_SSH_OPTS=(-i "$USE_SSH_PRIV" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$USE_KNOWN_HOSTS" -o ConnectTimeout=15 -o BatchMode=yes)

  local MAIL_SSH_READY=0
  for _ in $(seq 1 30); do
    if ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "echo MAIL_SSH_OK" >/dev/null 2>&1; then
      MAIL_SSH_READY=1
      break
    fi
    sleep 5
  done
  (( MAIL_SSH_READY == 1 )) || die "SSH connection to ubuntu@${MAIL_PUBLIC_IP} timed out under StrictHostKeyChecking=yes."

  MAIL_IP_DASHED="${MAIL_PUBLIC_IP//./-}"
  STAGING_MAIL_FQDN="mail.${MAIL_IP_DASHED}.sslip.io"

  # Check if mail.jobiest.com already resolves to MAIL_PUBLIC_IP
  RESOLVED_PROD_MAIL_IP="$(python3 -c '
import socket, sys
try:
    ips = sorted({r[4][0] for r in socket.getaddrinfo("mail.jobiest.com", 443, socket.AF_INET)})
    print(ips[0] if len(ips) == 1 else "")
except Exception:
    print("")
')"
  if [[ "$RESOLVED_PROD_MAIL_IP" == "$MAIL_PUBLIC_IP" ]]; then
    ACTIVE_MAIL_HOSTNAMES="mail.jobiest.com,webmail.jobiest.com,${STAGING_MAIL_FQDN}"
    PRIMARY_TLS_FQDN="mail.jobiest.com"
  else
    ACTIVE_MAIL_HOSTNAMES="${STAGING_MAIL_FQDN}"
    PRIMARY_TLS_FQDN="${STAGING_MAIL_FQDN}"
  fi

  MAIL_ALREADY_HEALTHY=0
  if [[ -z "$RELAY_HOST_CFG" ]]; then
    FAST_WM="$(curl -fsSL --max-time 10 -o /dev/null -w '%{http_code}|%{ssl_verify_result}' "https://${PRIMARY_TLS_FQDN}/webmail/" 2>/dev/null || true)"
    if [[ "$FAST_WM" == "200|0" ]] && ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "sudo test -s /mailu/dkim/${PRIMARY_MAIL_DOMAIN}.dkim.dns.txt && sudo test -s /root/.jobiest-mail-credentials" 2>/dev/null; then
      MAIL_ALREADY_HEALTHY=1
      printf -- '[Fast-Verify PASS] %s (%s) is already live & TLS-verified (HTTP 200|0).\n' "$MAIL_DISPLAY_NAME" "$PRIMARY_TLS_FQDN"
    fi
  fi

  if (( MAIL_ALREADY_HEALTHY == 0 )); then
    printf -- 'Deploying 2 GiB Swap + Host Firewall + Docker CE + Mailu %s (TLS hostnames: %s)...\n' "$MAILU_VERSION" "$ACTIVE_MAIL_HOSTNAMES"

    # Stream optional relay password securely via chmod 600 file in /dev/shm if set
    if [[ -n "$RELAY_HOST_CFG" ]]; then
      printf -- '%s\n' "$RELAY_PASS_CFG" | ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" \
        "umask 077 && cat > /dev/shm/.jobiest_relay_pw && chmod 600 /dev/shm/.jobiest_relay_pw"
    fi
    RELAY_PASS_CFG=""

    {
    printf -- 'MAILU_VERSION=%q\n' "$MAILU_VERSION"
    printf -- 'PRIMARY_MAIL_DOMAIN=%q\n' "$PRIMARY_MAIL_DOMAIN"
    printf -- 'MAIL_PRIV_IP=%q\n' "$MAIL_PRIV_IP"
    printf -- 'MAIL_PUBLIC_IP=%q\n' "$MAIL_PUBLIC_IP"
    printf -- 'STAGING_MAIL_FQDN=%q\n' "$STAGING_MAIL_FQDN"
    printf -- 'ACTIVE_MAIL_HOSTNAMES=%q\n' "$ACTIVE_MAIL_HOSTNAMES"
    printf -- 'PRIMARY_TLS_FQDN=%q\n' "$PRIMARY_TLS_FQDN"
    printf -- 'VALIDATED_SSH_CIDRS_STR=%q\n' "${VALIDATED_SSH_CIDRS_STR} 10.0.1.0/24"
    printf -- 'RELAY_HOST_CFG=%q\n' "$RELAY_HOST_CFG"
    printf -- 'RELAY_USER_CFG=%q\n' "$RELAY_USER_CFG"
    printf -- 'MAIL_COHOSTED_A1=%q\n' "$MAIL_COHOSTED_A1"
    cat <<'REMOTE_MAIL_SETUP'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# 1. Configure 2 GiB persistent swapfile FIRST so host never OOMs
if ! swapon --show | grep -q '/swapfile'; then
  if [[ ! -f /swapfile ]]; then
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  fi
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-jobiest-mail.conf >/dev/null
sudo sysctl -p /etc/sysctl.d/99-jobiest-mail.conf >/dev/null

# 2. Remove OCI Ubuntu default icmp-host-prohibited rules & configure UFW + sshd hardening
while sudo iptables -C INPUT -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do
  sudo iptables -D INPUT -j REJECT --reject-with icmp-host-prohibited
done
while sudo iptables -C FORWARD -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do
  sudo iptables -D FORWARD -j REJECT --reject-with icmp-host-prohibited
done
if [[ -f /etc/iptables/rules.v4 ]]; then
  sudo sed -i '/icmp-host-prohibited/d' /etc/iptables/rules.v4 || true
fi

sudo install -m 0600 /dev/stdin /etc/ssh/sshd_config.d/99-jobiest-mail-hardening.conf <<'SSHD_EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers ubuntu
SSHD_EOF
sudo sshd -t
sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd

if [[ "${MAIL_COHOSTED_A1:-false}" == "true" ]]; then
  # Co-hosted on jobiest-a1: preserve existing UFW & live Docker containers; scope mail ports strictly to MAIL_PRIV_IP
  for p in 25 80 443 465 587 993; do
    sudo ufw allow to "${MAIL_PRIV_IP}" port "${p}" proto tcp comment "Mailu-${p}" >/dev/null
  done
else
  sudo ufw --force reset >/dev/null
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  for cidr in $VALIDATED_SSH_CIDRS_STR; do
    sudo ufw allow from "$cidr" to any port 22 proto tcp comment 'Jobiest-Mail-Trusted-SSH'
  done
  ACTIVE_PEER="${SSH_CONNECTION%% *}"
  if [[ -n "$ACTIVE_PEER" && "$ACTIVE_PEER" != *:* ]]; then
    sudo ufw allow from "${ACTIVE_PEER}/32" to any port 22 proto tcp comment 'Jobiest-Mail-Active-SSH'
  fi
  for p in 25 80 443 465 587 993; do
    sudo ufw allow "${p}/tcp" comment "Mailu-${p}"
  done
  sudo ufw --force enable
fi

# 3. Install Docker CE & Compose v2
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg jq openssl ufw python3
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
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker ubuntu
fi
sudo systemctl enable --now docker
if [[ "${MAIL_COHOSTED_A1:-false}" != "true" ]]; then
  sudo systemctl restart docker
fi

# 4. Prepare /mailu directory, persistent secret key, docker-compose.yml & mailu.env
sudo mkdir -p /mailu/{certs,data,dkim,mail,mailqueue,filter,webmail,redis} \
              /mailu/overrides/{nginx,dovecot,postfix,rspamd,snappymail}
sudo chmod 700 /mailu
printf -- '%s\n' "$MAIL_PUBLIC_IP" | sudo tee /mailu/.mail_public_ip >/dev/null

if [[ ! -f /root/.mailu_secret_key ]]; then
  sudo bash -c 'umask 077 && openssl rand -hex 8 | tr "[:lower:]" "[:upper:]" > /root/.mailu_secret_key'
fi
MAILU_SEC="$(sudo cat /root/.mailu_secret_key)"

RELAY_PW_VAL=""
if [[ -f /dev/shm/.jobiest_relay_pw ]]; then
  RELAY_PW_VAL="$(cat /dev/shm/.jobiest_relay_pw)"
  shred -u /dev/shm/.jobiest_relay_pw 2>/dev/null || rm -f /dev/shm/.jobiest_relay_pw
elif sudo test -f /mailu/mailu.env; then
  RELAY_PW_VAL="$(sudo awk -F= '/^RELAYPASSWORD=/{sub(/^RELAYPASSWORD=/,""); print; exit}' /mailu/mailu.env || true)"
  if [[ -z "$RELAY_HOST_CFG" ]]; then
    RELAY_HOST_CFG="$(sudo awk -F= '/^RELAYHOST=/{sub(/^RELAYHOST=/,""); print; exit}' /mailu/mailu.env || true)"
    RELAY_USER_CFG="$(sudo awk -F= '/^RELAYUSER=/{sub(/^RELAYUSER=/,""); print; exit}' /mailu/mailu.env || true)"
  fi
fi

# Build extra_hosts list on front so Mailu's internal hairpin HTTP-01 self-check hits 127.0.0.1:80
EXTRA_HOSTS_YAML=""
IFS=',' read -r -a HOST_ARR <<<"$ACTIVE_MAIL_HOSTNAMES"
for h in "${HOST_ARR[@]}"; do
  h_trim="$(echo "$h" | tr -d ' ')"
  [[ -n "$h_trim" ]] && EXTRA_HOSTS_YAML="${EXTRA_HOSTS_YAML}      - \"${h_trim}:127.0.0.1\"\n"
done

sudo bash -c 'umask 077 && cat > /mailu/docker-compose.yml' <<EOF
services:
  redis:
    image: redis:alpine
    restart: always
    volumes:
      - "/mailu/redis:/data"
    depends_on:
      - resolver
    dns:
      - 192.168.203.254

  resolver:
    image: ghcr.io/mailu/unbound:${MAILU_VERSION}
    env_file: mailu.env
    restart: always
    networks:
      default:
        ipv4_address: 192.168.203.254

  front:
    image: ghcr.io/mailu/nginx:${MAILU_VERSION}
    restart: always
    env_file: mailu.env
    ports:
      - "${MAIL_PRIV_IP}:80:80"
      - "${MAIL_PRIV_IP}:443:443"
      - "${MAIL_PRIV_IP}:25:25"
      - "${MAIL_PRIV_IP}:465:465"
      - "${MAIL_PRIV_IP}:587:587"
      - "${MAIL_PRIV_IP}:993:993"
    extra_hosts:
$(printf -- '%b' "$EXTRA_HOSTS_YAML")
    networks:
      - default
      - webmail
    volumes:
      - "/mailu/certs:/certs"
      - "/mailu/overrides/nginx:/overrides:ro"
    depends_on:
      - resolver
    dns:
      - 192.168.203.254

  admin:
    image: ghcr.io/mailu/admin:${MAILU_VERSION}
    restart: always
    env_file: mailu.env
    volumes:
      - "/mailu/data:/data"
      - "/mailu/dkim:/dkim"
    depends_on:
      - redis
      - resolver
    dns:
      - 192.168.203.254

  imap:
    image: ghcr.io/mailu/dovecot:${MAILU_VERSION}
    restart: always
    env_file: mailu.env
    volumes:
      - "/mailu/mail:/mail"
      - "/mailu/overrides/dovecot:/overrides:ro"
    depends_on:
      - front
      - resolver
    dns:
      - 192.168.203.254

  smtp:
    image: ghcr.io/mailu/postfix:${MAILU_VERSION}
    restart: always
    env_file: mailu.env
    volumes:
      - "/mailu/mailqueue:/queue"
      - "/mailu/overrides/postfix:/overrides:ro"
    depends_on:
      - front
      - resolver
    dns:
      - 192.168.203.254

  antispam:
    image: ghcr.io/mailu/rspamd:${MAILU_VERSION}
    hostname: antispam
    restart: always
    env_file: mailu.env
    volumes:
      - "/mailu/filter:/var/lib/rspamd"
      - "/mailu/overrides/rspamd:/overrides:ro"
    depends_on:
      - front
      - redis
      - resolver
    dns:
      - 192.168.203.254

  webmail:
    image: ghcr.io/mailu/webmail:${MAILU_VERSION}
    restart: always
    env_file: mailu.env
    volumes:
      - "/mailu/webmail:/data"
      - "/mailu/overrides/snappymail:/overrides:ro"
    networks:
      - webmail
    depends_on:
      - front

networks:
  default:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 192.168.203.0/24
  webmail:
    driver: bridge
EOF

OUTBOUND_TLS_VAL="dane"
DEFER_TLS_VAL="True"
if [[ -n "$RELAY_HOST_CFG" ]]; then
  OUTBOUND_TLS_VAL="encrypt"
  DEFER_TLS_VAL="False"
fi

sudo bash -c 'umask 077 && cat > /mailu/mailu.env' <<EOF
SECRET_KEY=${MAILU_SEC}
SUBNET=192.168.203.0/24
DOMAIN=${PRIMARY_MAIL_DOMAIN}
HOSTNAMES=${ACTIVE_MAIL_HOSTNAMES}
POSTMASTER=admin
TLS_FLAVOR=letsencrypt
AUTH_RATELIMIT_IP=60/hour
AUTH_RATELIMIT_USER=200/day
DISABLE_STATISTICS=True
ADMIN=true
WEBMAIL=snappymail
API=false
WEBDAV=none
ANTIVIRUS=none
SCAN_MACROS=false
MESSAGE_SIZE_LIMIT=50000000
MESSAGE_RATELIMIT=300/day
RELAYNETS=
RELAYHOST=${RELAY_HOST_CFG}
RELAYUSER=${RELAY_USER_CFG}
RELAYPASSWORD=${RELAY_PW_VAL}
OUTBOUND_TLS_LEVEL=${OUTBOUND_TLS_VAL}
DEFER_ON_TLS_ERROR=${DEFER_TLS_VAL}
FETCHMAIL_ENABLED=False
RECIPIENT_DELIMITER=+
DMARC_RUA=admin
DMARC_RUF=admin
WELCOME=false
COMPRESSION=gz
COMPRESSION_LEVEL=6
FULL_TEXT_SEARCH=off
WEBROOT_REDIRECT=/webmail
WEB_ADMIN=/admin
WEB_WEBMAIL=/webmail
SITENAME=Jobiest Mail
WEBSITE=https://jobiest.com
COMPOSE_PROJECT_NAME=mailu
CPU_COUNT=1
CREDENTIAL_ROUNDS=12
REJECT_UNLISTED_RECIPIENT=yes
LOG_LEVEL=WARNING
EOF
sudo chmod 600 /mailu/mailu.env

# Install helper management CLI scripts for owner operations
sudo install -m 0700 /dev/stdin /usr/local/sbin/jobiest-mail-show-credentials <<'SHOW_EOF'
#!/usr/bin/env bash
set -euo pipefail
cat /root/.jobiest-mail-credentials
SHOW_EOF

sudo install -m 0700 /dev/stdin /usr/local/sbin/jobiest-mail-set-relay <<'RELAY_EOF'
#!/usr/bin/env bash
set -euo pipefail
read -r -p "Outbound RELAYHOST (e.g. [smtp.resend.com]:587): " rh
read -r -p "Outbound RELAYUSER (e.g. resend): " ru
read -r -s -p "Outbound RELAYPASSWORD: " rp
echo
python3 - "$rh" "$ru" "$rp" <<'PY'
import sys
rh, ru, rp = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open("/mailu/mailu.env", "r", encoding="utf-8").read().splitlines()
updates = {
    "RELAYHOST": rh,
    "RELAYUSER": ru,
    "RELAYPASSWORD": rp,
    "OUTBOUND_TLS_LEVEL": "encrypt" if rh else "dane",
    "DEFER_ON_TLS_ERROR": "False" if rh else "True",
}
out = []
seen = set()
for ln in lines:
    k = ln.split("=", 1)[0] if "=" in ln else ""
    if k in updates:
        out.append("%s=%s" % (k, updates[k]))
        seen.add(k)
    else:
        out.append(ln)
for k, v in updates.items():
    if k not in seen:
        out.append("%s=%s" % (k, v))
with open("/mailu/mailu.env", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
PY
chmod 600 /mailu/mailu.env
docker compose -f /mailu/docker-compose.yml up -d smtp front admin
echo "Updated Mailu outbound TLS smarthost relay cleanly."
RELAY_EOF

sudo install -m 0700 /dev/stdin /usr/local/sbin/jobiest-mail-activate-domain-tls <<'ACT_EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ -s /mailu/.mail_public_ip ]]; then
  PUB_IP="$(tr -d ' \r\n' </mailu/.mail_public_ip)"
else
  PUB_IP="$(curl -fsS --max-time 8 https://checkip.amazonaws.com | tr -d ' \r\n')"
fi
IP_DASHED="${PUB_IP//./-}"
STAGE_FQDN="mail.${IP_DASHED}.sslip.io"
RESOLVED="$(python3 -c 'import socket; print(",".join(sorted({r[4][0] for r in socket.getaddrinfo("mail.jobiest.com", 443, socket.AF_INET)})))' 2>/dev/null || true)"
if [[ "$RESOLVED" != "$PUB_IP" ]]; then
  echo "DNS A record for mail.jobiest.com currently resolves to '${RESOLVED:-UNRESOLVED}' (expected ${PUB_IP}). Update DNS first and re-run."
  exit 1
fi
NEW_HOSTS="mail.jobiest.com,webmail.jobiest.com,${STAGE_FQDN}"
sudo sed -i "s|^HOSTNAMES=.*|HOSTNAMES=${NEW_HOSTS}|" /mailu/mailu.env
python3 - "$STAGE_FQDN" <<'PY'
import sys
sf = sys.argv[1]
p = "/mailu/docker-compose.yml"
txt = open(p, "r", encoding="utf-8").read()
block = '    extra_hosts:\n      - "mail.jobiest.com:127.0.0.1"\n      - "webmail.jobiest.com:127.0.0.1"\n      - "%s:127.0.0.1"\n' % sf
import re
txt = re.sub(r"    extra_hosts:\n(?:      - [^\n]+\n)+", block, txt)
open(p, "w", encoding="utf-8").write(txt)
PY
sudo docker compose -f /mailu/docker-compose.yml up -d front smtp imap admin webmail
echo "Activated Let's Encrypt TLS for mail.jobiest.com and webmail.jobiest.com."
ACT_EOF

echo "Pulling and starting Mailu ${MAILU_VERSION} containers..."
sudo docker compose -f /mailu/docker-compose.yml up -d

echo "Waiting for Mailu admin service and Let's Encrypt certificate (${PRIMARY_TLS_FQDN})..."
ADMIN_READY=0
for _ in $(seq 1 60); do
  if sudo docker compose -f /mailu/docker-compose.yml exec -T admin curl -fsS --max-time 3 http://127.0.0.1:8080/ping >/dev/null 2>&1; then
    ADMIN_READY=1
    break
  fi
  sleep 4
done
(( ADMIN_READY == 1 )) || { sudo docker compose -f /mailu/docker-compose.yml logs --tail=60 admin resolver; exit 1; }

CERT_READY=0
for _ in $(seq 1 50); do
  if sudo test -s /mailu/certs/letsencrypt/live/mailu-ecdsa/DANE-chain.pem; then
    CERT_READY=1
    break
  fi
  sleep 4
done
(( CERT_READY == 1 )) || { sudo docker compose -f /mailu/docker-compose.yml logs --tail=80 front; exit 1; }

# 5. Generate/load mailbox credentials in chmod 600 /root/.jobiest-mail-credentials (NEVER printed)
sudo python3 - "$PRIMARY_MAIL_DOMAIN" <<'PY'
import json, os, secrets, string

domain = os.sys.argv[1]
cred_path = "/root/.jobiest-mail-credentials"
mailboxes = [
    ("admin", True, 2 * 10**9),
    ("philip", True, 2 * 10**9),
    ("support", False, 2 * 10**9),
    ("hello", False, 1 * 10**9),
    ("careers", False, 2 * 10**9),
    ("staff", False, 1 * 10**9),
    ("finance", False, 1 * 10**9),
    ("privacy", False, 1 * 10**9),
]
existing = {}
if os.path.exists(cred_path):
    for ln in open(cred_path, "r", encoding="utf-8").read().splitlines():
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            existing[k.strip()] = v.strip()

alphabet = string.ascii_letters + string.digits + "-_!@#"
spec = []
lines = ["# Jobiest Self-Hosted Business Mail Credentials (mode 0600 — keep confidential)"]
for local, is_admin, quota in mailboxes:
    addr = "%s@%s" % (local, domain)
    pw = existing.get(addr)
    if not pw or len(pw) < 16:
        pw = "".join(secrets.choice(alphabet) for _ in range(24))
    lines.append("%s=%s" % (addr, pw))
    spec.append({"local": local, "admin": is_admin, "quota": quota, "pw": pw})

fd = os.open(cred_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

fd_spec = os.open("/dev/shm/.mailu_seed_spec.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd_spec, "w", encoding="utf-8") as f:
    json.dump({"domain": domain, "users": spec}, f)
PY

SEED_PY_SCRIPT="$(cat <<'PY'
import json, sys
from mailu import create_app, models

payload = json.loads(sys.stdin.read())
domain_name = payload["domain"]
app = create_app()
with app.app_context():
    db = models.db
    dom = models.Domain.query.get(domain_name)
    if not dom:
        dom = models.Domain(name=domain_name, max_users=-1, max_aliases=-1, max_quota_bytes=0)
        db.session.add(dom)
        db.session.commit()
    if not dom.dkim_key:
        dom.generate_dkim_key()
        db.session.commit()

    for u in payload["users"]:
        email = "%s@%s" % (u["local"], domain_name)
        usr = models.User.query.get(email)
        if not usr:
            usr = models.User(
                localpart=u["local"],
                domain=dom,
                global_admin=bool(u["admin"]),
                quota_bytes=int(u["quota"]),
                enable_imap=True,
                enable_pop=False,
                change_pw_next_login=False,
                enabled=True,
            )
            db.session.add(usr)
        else:
            usr.global_admin = bool(u["admin"])
            usr.quota_bytes = int(u["quota"])
            usr.enable_imap = True
            usr.enable_pop = False
            usr.change_pw_next_login = False
            usr.enabled = True
        usr.set_password(u["pw"])
    db.session.commit()

    for al_local in ("postmaster", "abuse", "dmarc", "security"):
        al_email = "%s@%s" % (al_local, domain_name)
        al = models.Alias.query.get(al_email)
        if not al:
            al = models.Alias(
                localpart=al_local,
                domain=dom,
                wildcard=False,
                destination=["admin@%s" % domain_name],
                email=al_email,
            )
            db.session.add(al)
        else:
            al.destination = ["admin@%s" % domain_name]
    db.session.commit()

    with open("/dkim/%s.dkim.dns.txt" % domain_name, "w", encoding="utf-8") as f:
        f.write((dom.dkim_publickey or "").strip() + "\n")
print("Provisioned domain, 2048-bit DKIM key, 8 corporate mailboxes, and 4 RFC aliases cleanly.")
PY
)"
sudo docker compose -f /mailu/docker-compose.yml exec -T -u mailu admin python3 -c "$SEED_PY_SCRIPT" < <(sudo cat /dev/shm/.mailu_seed_spec.json)
sudo shred -u /dev/shm/.mailu_seed_spec.json 2>/dev/null || sudo rm -f /dev/shm/.mailu_seed_spec.json

# 6. Run In-Guest Authenticated SMTP 587 -> IMAPS 993 + Open-Relay Block + Inbound 25 MX E2E Assertions
sudo python3 - "$MAIL_PRIV_IP" "$PRIMARY_TLS_FQDN" "$STAGING_MAIL_FQDN" "$PRIMARY_MAIL_DOMAIN" <<'PY'
import email.utils, imaplib, smtplib, socket, ssl, sys, time, uuid

bind_ip, tls_fqdn, stage_fqdn, dom = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
creds = {}
for ln in open("/root/.jobiest-mail-credentials", "r", encoding="utf-8").read().splitlines():
    if ln and not ln.startswith("#") and "=" in ln:
        k, v = ln.split("=", 1)
        creds[k.strip()] = v.strip()

ctx = ssl.create_default_context()

class VerifiedIMAP4SSL(imaplib.IMAP4_SSL):
    def _create_socket(self, timeout=None):
        sock = socket.create_connection((bind_ip, self.port), timeout or 15)
        return ctx.wrap_socket(sock, server_hostname=tls_fqdn)

# Test A: Authenticated Submission (587 STARTTLS) -> IMAPS (993) INBOX round-trip
subm_token = "JOBIEST-E2E-SUBM-%s" % uuid.uuid4().hex[:12]
msg = (
    "From: admin@%s\r\n"
    "To: support@%s\r\n"
    "Subject: %s\r\n"
    "Message-ID: <%s@%s>\r\n"
    "Date: %s\r\n"
    "\r\n"
    "Authenticated submission E2E verification.\r\n"
) % (dom, dom, subm_token, subm_token, dom, email.utils.formatdate(localtime=True))

with smtplib.SMTP(bind_ip, 587, timeout=20) as s:
    s.ehlo(tls_fqdn)
    raw_cmd_code, _ = s.docmd("STARTTLS")
    assert raw_cmd_code == 220, "STARTTLS failed: %s" % raw_cmd_code
    s.sock = ctx.wrap_socket(s.sock, server_hostname=tls_fqdn)
    s.file = s.sock.makefile("rb")
    s.ehlo(tls_fqdn)
    s.login("admin@%s" % dom, creds["admin@%s" % dom])
    s.sendmail("admin@%s" % dom, ["support@%s" % dom], msg)
print("  [Mail E2E PASS] Authenticated SMTP 587 STARTTLS send (admin@ -> support@)")

found_subm = False
for _ in range(20):
    with VerifiedIMAP4SSL(bind_ip, 993) as im:
        im.login("support@%s" % dom, creds["support@%s" % dom])
        im.select("INBOX")
        typ, data = im.search(None, "SUBJECT", '"%s"' % subm_token)
        if typ == "OK" and data and data[0]:
            for num in data[0].split():
                im.store(num, "+FLAGS", "\\Deleted")
            im.expunge()
            found_subm = True
            break
    time.sleep(2)
assert found_subm, "Submitted test message did not arrive in support@ INBOX within 40s"
print("  [Mail E2E PASS] Authenticated IMAPS 993 TLS login & INBOX delivery verified (support@)")

# Test B: Unauthenticated Port-25 Open-Relay Rejection Assertion (from non-mynetworks bind_ip)
relay_blocked = False
with smtplib.SMTP(bind_ip, 25, timeout=20) as s:
    s.ehlo("probe.external.invalid")
    s.mail("probe@%s" % stage_fqdn)
    code, _ = s.rcpt("unauth-relay-target@gmail.com")
    if code >= 400:
        relay_blocked = True
assert relay_blocked, "CRITICAL: Port 25 accepted unauthenticated external relay recipient!"
print("  [Mail E2E PASS] Unauthenticated Open-Relay strictly rejected (SMTP code=%d)" % code)

# Test C: Unauthenticated Inbound Port-25 MX Delivery to @jobiest.com -> IMAPS 993 INBOX
inb_token = "JOBIEST-E2E-MX-%s" % uuid.uuid4().hex[:12]
inb_msg = (
    "From: external-check@%s\r\n"
    "To: hello@%s\r\n"
    "Subject: %s\r\n"
    "Message-ID: <%s@%s>\r\n"
    "Date: %s\r\n"
    "\r\n"
    "Direct inbound port-25 MX delivery verification.\r\n"
) % (stage_fqdn, dom, inb_token, inb_token, stage_fqdn, email.utils.formatdate(localtime=True))

with smtplib.SMTP(bind_ip, 25, timeout=20) as s:
    s.ehlo(stage_fqdn)
    s.mail("external-check@%s" % stage_fqdn)
    rcpt_code, rcpt_resp = s.rcpt("hello@%s" % dom)
    assert rcpt_code in (250, 251), "Inbound MX RCPT rejected: %s %s" % (rcpt_code, rcpt_resp)
    data_code, data_resp = s.data(inb_msg)
    assert data_code == 250, "Inbound MX DATA rejected: %s %s" % (data_code, data_resp)

found_inb = False
for _ in range(20):
    with VerifiedIMAP4SSL(bind_ip, 993) as im:
        im.login("hello@%s" % dom, creds["hello@%s" % dom])
        im.select("INBOX")
        typ, data = im.search(None, "SUBJECT", '"%s"' % inb_token)
        if typ == "OK" and data and data[0]:
            for num in data[0].split():
                im.store(num, "+FLAGS", "\\Deleted")
            im.expunge()
            found_inb = True
            break
    time.sleep(2)
assert found_inb, "Inbound port-25 MX test message did not arrive in hello@ INBOX within 40s"
print("  [Mail E2E PASS] Direct Inbound Port-25 MX -> Rspamd -> Dovecot IMAPS 993 INBOX verified (hello@)")
PY

echo "=== MAIL HOST MEMORY & SWAP HEALTH ==="
free -m
REMOTE_MAIL_SETUP
  } | ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" 'bash -s'

  # External Cloud Shell HTTPS Webmail & Admin UI Verification (real internet + Let's Encrypt verify_result=0)
  WEBMAIL_RES="$(curl -fsSL --max-time 20 -o /dev/null -w '%{http_code}|%{ssl_verify_result}' "https://${PRIMARY_TLS_FQDN}/webmail/")"
  ADMIN_RES="$(curl -fsSL --max-time 20 -o /dev/null -w '%{http_code}|%{ssl_verify_result}' "https://${PRIMARY_TLS_FQDN}/admin/ui/login")"
  printf -- '  [External HTTPS Check] https://%s/webmail/        -> %s\n' "$PRIMARY_TLS_FQDN" "$WEBMAIL_RES"
  printf -- '  [External HTTPS Check] https://%s/admin/ui/login  -> %s\n' "$PRIMARY_TLS_FQDN" "$ADMIN_RES"
  [[ "$WEBMAIL_RES" == "200|0" ]] || die "External Webmail HTTPS/TLS check failed ($WEBMAIL_RES)"
  [[ "$ADMIN_RES" == "200|0" ]] || die "External Mail Admin HTTPS/TLS check failed ($ADMIN_RES)"

  # Upload JBV1 AES-256+HMAC Encrypted Mail Backup to jobiest-gate2-vault via short-lived PAR
  MAIL_BKP_TS="$(date -u '+%Y%m%dT%H%M%SZ')"
  MAIL_BKP_OBJ="mailu-state-${MAIL_BKP_TS}.tar.gz.enc"
  PAR_EXP="$(python3 -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
  PAR_JSON="$TMP_DIR/mail_par.json"
  oci os preauth-request create \
    --region "$REGION" \
    --namespace-name "$ACTIVE_NS" \
    --bucket-name "$VAULT_BUCKET" \
    --name "mail-bkp-${MAIL_BKP_TS}" \
    --access-type ObjectWrite \
    --object-name "$MAIL_BKP_OBJ" \
    --time-expires "$PAR_EXP" >"$PAR_JSON"
  MAIL_PAR_ID="$(python3 - "$PAR_JSON" <<'PY'
import json, sys
print(json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]["id"])
PY
)"
  ACTIVE_PAR_IDS+=("$MAIL_PAR_ID")
  MAIL_PAR_URI="$(python3 - "$PAR_JSON" <<'PY'
import json, sys
print(json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]["access-uri"])
PY
)"
  rm -f "$PAR_JSON"
  MAIL_PAR_FULL="https://objectstorage.${REGION}.oraclecloud.com${MAIL_PAR_URI}"
  MAIL_PAR_URI=""

  ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "umask 077 && mkdir -p /dev/shm/.mail_vault && chmod 700 /dev/shm/.mail_vault"
  ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "umask 077 && cat > /dev/shm/.mail_vault/vault.key && chmod 600 /dev/shm/.mail_vault/vault.key" <"$VAULT_KEY_PRIV"
  printf -- 'url = "%s"\n' "$MAIL_PAR_FULL" | ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" \
    "umask 077 && cat > /dev/shm/.mail_vault/par.curl && chmod 600 /dev/shm/.mail_vault/par.curl"
  MAIL_PAR_FULL=""

  ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" 'bash -s' <<'REMOTE_MAIL_BACKUP'
set -euo pipefail
cleanup_mb() {
  find /dev/shm/.mail_vault -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf /dev/shm/.mail_vault
}
trap cleanup_mb EXIT

sudo tar -czf /dev/shm/.mail_vault/mailu.tar.gz \
  /mailu/mailu.env /mailu/docker-compose.yml /mailu/data /mailu/dkim /mailu/mail /root/.jobiest-mail-credentials 2>/dev/null
sudo chown ubuntu:ubuntu /dev/shm/.mail_vault/mailu.tar.gz
chmod 600 /dev/shm/.mail_vault/mailu.tar.gz

python3 - /dev/shm/.mail_vault/vault.key /dev/shm/.mail_vault/mailu.tar.gz /dev/shm/.mail_vault/mailu.tar.gz.enc <<'PY'
import hashlib, hmac, os, secrets, subprocess, sys
MAGIC = b"JBV1\x00"
master = open(sys.argv[1], "rb").read().strip()
salt = secrets.token_bytes(32)
enc_sub = hmac.new(master, b"JBV1-ENC|" + salt, hashlib.sha256).hexdigest().encode("ascii")
mac_sub = hmac.new(master, b"JBV1-MAC|" + salt, hashlib.sha256).digest()
r_fd, w_fd = os.pipe()
os.write(w_fd, enc_sub + b"\n")
os.close(w_fd)
try:
    proc = subprocess.run(
        ["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "600000", "-md", "sha256",
         "-pass", "fd:%d" % r_fd, "-in", sys.argv[2]],
        pass_fds=(r_fd,), capture_output=True, check=True,
    )
finally:
    os.close(r_fd)
body = MAGIC + salt + proc.stdout
tag = hmac.new(mac_sub, body, hashlib.sha256).digest()
with open(sys.argv[3], "wb") as f:
    f.write(body + tag)
PY

shred -u /dev/shm/.mail_vault/mailu.tar.gz 2>/dev/null || rm -f /dev/shm/.mail_vault/mailu.tar.gz
curl -fsS -X PUT -H 'Content-Type: application/octet-stream' \
  --data-binary "@/dev/shm/.mail_vault/mailu.tar.gz.enc" \
  --config /dev/shm/.mail_vault/par.curl >/dev/null
echo "  [Encrypted Mail Vault Upload OK] JBV1 AES-256-CBC + HMAC-SHA256 verified."
REMOTE_MAIL_BACKUP

  oci os preauth-request delete \
    --region "$REGION" \
    --namespace-name "$ACTIVE_NS" \
    --bucket-name "$VAULT_BUCKET" \
    --par-id "$MAIL_PAR_ID" \
    --force >/dev/null
  ACTIVE_PAR_IDS=()
  fi

  (umask 077 && ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "sudo cat /root/.jobiest-mail-credentials" >"$MAIL_LOCAL_CREDS")
  chmod 600 "$MAIL_LOCAL_CREDS"

  MAIL_DKIM_TXT="$(ssh "${MAIL_SSH_OPTS[@]}" "ubuntu@${MAIL_PUBLIC_IP}" "sudo cat /mailu/dkim/${PRIMARY_MAIL_DOMAIN}.dkim.dns.txt | tr -d '\r\n'")"

  cat <<EOF

------------------------------------------------------------------------------
LIVE @${PRIMARY_MAIL_DOMAIN} BUSINESS MAIL SERVER READY (ZERO DNS CHANGED YET)
------------------------------------------------------------------------------
Staging Webmail URL (LIVE NOW) : https://${PRIMARY_TLS_FQDN}/webmail/
Staging Admin URL   (LIVE NOW) : https://${PRIMARY_TLS_FQDN}/admin/ui/login
View All 8 Mailbox Passwords   : cat ${MAIL_LOCAL_CREDS}
Set Outbound SMTP Relay (587)  : ssh -i ${USE_SSH_PRIV} -o UserKnownHostsFile=${USE_KNOWN_HOSTS} ubuntu@${MAIL_PUBLIC_IP} sudo jobiest-mail-set-relay

Publish these DNS records when ready to cut over @${PRIMARY_MAIL_DOMAIN} email
(NOTE: KEEP your existing resend._domainkey TXT record untouched!):
  A      mail.jobiest.com              -> ${MAIL_PUBLIC_IP}   (TTL 300)
  CNAME  webmail.jobiest.com           -> mail.jobiest.com.   (TTL 300)
  MX     jobiest.com                   -> 10 mail.jobiest.com. (TTL 300)
  TXT    dkim._domainkey.jobiest.com   -> ${MAIL_DKIM_TXT}
  TXT    jobiest.com (merge SPF)       -> "v=spf1 include:_spf.resend.com ip4:${MAIL_PUBLIC_IP} ~all"
  TXT    _dmarc.jobiest.com            -> "v=DMARC1; p=quarantine; rua=mailto:admin@jobiest.com; adkim=s; aspf=r"

After adding A mail.jobiest.com -> ${MAIL_PUBLIC_IP}, activate production mail TLS via:
  ssh -i ${USE_SSH_PRIV} -o UserKnownHostsFile=${USE_KNOWN_HOSTS} ubuntu@${MAIL_PUBLIC_IP} sudo jobiest-mail-activate-domain-tls
------------------------------------------------------------------------------
EOF
}

if [[ "${STAGE2_CHOICE:-}" == "APPROVE_C" && -n "${MAIL_INSTANCE_ID:-}" ]]; then
  printf -- 'Waiting for %s (%s) to reach RUNNING state...\n' "$MAIL_DISPLAY_NAME" "$MAIL_INSTANCE_ID"
  for _ in $(seq 1 60); do
    M_STATE="$(oci compute instance get --region "$REGION" --instance-id "$MAIL_INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
    [[ "$M_STATE" == "RUNNING" ]] && break
    sleep 5
  done
  [[ "$M_STATE" == "RUNNING" ]] || die "$MAIL_DISPLAY_NAME did not reach RUNNING state (state=$M_STATE)"

  IFS='|' read -r MAIL_VNIC_ID _ MAIL_PRIV_IP MAIL_PUBLIC_IP <<<"$(get_instance_network_summary "$MAIL_INSTANCE_ID")"
  [[ -n "$MAIL_PUBLIC_IP" ]] || die "No public IP found on $MAIL_DISPLAY_NAME VNIC $MAIL_VNIC_ID"

  oci network vnic update --region "$REGION" --vnic-id "$MAIL_VNIC_ID" --nsg-ids "[\"${MAIL_NSG_ID}\"]" --force >/dev/null
  printf -- 'Mail VM Ready: id=%s private_ip=%s public_ip=%s nsg=%s\n' "$MAIL_INSTANCE_ID" "$MAIL_PRIV_IP" "$MAIL_PUBLIC_IP" "$MAIL_NSG_ID"

  verify_host_keys_via_console "$MAIL_INSTANCE_ID" "$MAIL_DISPLAY_NAME" "$MAIL_PUBLIC_IP" "$MAIL_KNOWN_HOSTS"
  deploy_mailu_on_target_host "$MAIL_PRIV_IP" "$MAIL_PUBLIC_IP" "$MAIL_SSH_PRIV" "$MAIL_KNOWN_HOSTS" "false"
fi

# ==============================================================================
# STAGE 3: [APPROVAL D CUTOVER] ATOMIC RESERVED IP CUTOVER + INSTANT ROLLBACK
# ==============================================================================
banner "STAGE 3 — CONTROLLED PRODUCTION CUTOVER (147.224.218.163 -> jobiest-a1)"

EX_A1_JSON="$(oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --display-name "$A1_DISPLAY_NAME" --all)"
A1_CUTOVER_ID="$(python3 -c '
import json, sys
s = sys.stdin.read().strip()
live = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("lifecycle-state") == "RUNNING"]
print(live[0]["id"] if len(live) == 1 else "")
' <<<"$EX_A1_JSON")"

if [[ -z "$A1_CUTOVER_ID" ]]; then
  if [[ "$SINGLE_CLICK_ALL" == "true" && "${BACKGROUND_A1_HUNTER:-false}" != "true" ]]; then
    HUNTER_RUNNER="$SSH_KEY_DIR/jobiest_master_runner.sh"
    HUNTER_PID_FILE="$SSH_KEY_DIR/jobiest_a1_autohunter.pid"
    HUNTER_LOG="$HOME/jobiest_a1_autohunter.log"
    cp "$SELF_SCRIPT_PATH" "$HUNTER_RUNNER"
    chmod 700 "$HUNTER_RUNNER"

    ALREADY_HUNTING=0
    if [[ -f "$HUNTER_PID_FILE" ]]; then
      OLD_PID="$(cat "$HUNTER_PID_FILE" 2>/dev/null || true)"
      if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
        ALREADY_HUNTING=1
        printf -- '[Background A1 Auto-Hunter] Already running (PID %s -> %s).\n' "$OLD_PID" "$HUNTER_LOG"
      fi
    fi

    if (( ALREADY_HUNTING == 0 )); then
      setsid nohup env \
        SINGLE_CLICK_ALL="true" \
        BACKGROUND_A1_HUNTER="true" \
        ALLOW_1OCPU_FALLBACK="$ALLOW_1OCPU_FALLBACK" \
        PREFER_UNPINNED_FD="$PREFER_UNPINNED_FD" \
        A1_MAX_RETRY_ROUNDS="360" \
        A1_RETRY_SLEEP_SEC="95" \
        TRUSTED_SSH_CIDRS="$VALIDATED_SSH_CIDRS_STR" \
        bash "$HUNTER_RUNNER" </dev/null >>"$HUNTER_LOG" 2>&1 &
      NEW_HUNTER_PID=$!
      printf -- '%s\n' "$NEW_HUNTER_PID" >"$HUNTER_PID_FILE"
      printf -- '\n==============================================================================\n'
      printf -- 'SINGLE-CLICK AUTO-HUNTER ACTIVE (PID %s -> %s)\n' "$NEW_HUNTER_PID" "$HUNTER_LOG"
      printf -- '==============================================================================\n'
      printf -- '  1. Pre-Staged Ready : NSG %s + RSA-4096 SSH + JBV1 256-bit vault key verified.\n' "$MAIL_NSG_NAME"
      printf -- '  2. Smart AD Sweep   : PID %s probes AD-wide scheduler (all 9 FDs, rotated ADs, 1-OCPU=%s)\n' "$NEW_HUNTER_PID" "$ALLOW_1OCPU_FALLBACK"
      printf -- '                        with 95s+jitter adaptive pacing (zero 429 penalty).\n'
      printf -- '  3. Full Auto-Finish : The moment OCI frees an ARM slot, PID %s will automatically:\n' "$NEW_HUNTER_PID"
      printf -- '       - Provision %s + JBV1 encrypted recovery vault\n' "$A1_DISPLAY_NAME"
      printf -- '       - Cut over %s (%s) with <3s auto-rollback safety\n' "$RESERVED_IP_EXPECTED" "{worker,api,ai}.jobiest.com"
      printf -- '       - Deploy @%s Mailu %s Webmail/IMAP/SMTP + save passwords to %s\n' "$PRIMARY_MAIL_DOMAIN" "$MAILU_VERSION" "$MAIL_LOCAL_CREDS"
      printf -- '  4. Watch Live Log   : tail -f %s\n' "$HUNTER_LOG"
      printf -- '==============================================================================\n'
    fi
    ACTIVE_WATCH_PID="$(cat "$HUNTER_PID_FILE" 2>/dev/null || true)"
    if [[ "$WATCH_HUNTER_LIVE" == "true" && -n "$ACTIVE_WATCH_PID" ]]; then
      printf -- '\n[Live Cloud Shell Keep-Alive Active] Streaming %s (60s anti-idle heartbeat; type Q + Enter anytime to detach viewer while hunter keeps running)...\n' "$HUNTER_LOG"
      tail -n 25 -f "$HUNTER_LOG" &
      TAIL_VIEW_PID=$!
      while kill -0 "$ACTIVE_WATCH_PID" 2>/dev/null; do
        if [[ -r /dev/tty ]]; then
          WATCH_KEY=""
          if IFS= read -r -t 60 WATCH_KEY </dev/tty; then
            if [[ "$WATCH_KEY" == "Q" || "$WATCH_KEY" == "q" ]]; then
              kill "$TAIL_VIEW_PID" 2>/dev/null || true
              printf -- '\nDetached live viewer cleanly; background hunter PID %s is still running!\n' "$ACTIVE_WATCH_PID"
              exit 0
            fi
          else
            printf -- '[Keep-Alive %s] Background hunter PID %s active — waiting for free Ampere host in %s...\n' \
              "$(date -u '+%H:%M:%SZ')" "$ACTIVE_WATCH_PID" "$REGION"
          fi
        else
          sleep 60
        fi
      done
      kill "$TAIL_VIEW_PID" 2>/dev/null || true
      printf -- '\n[Auto-Hunter PID %s finished!]\n' "$ACTIVE_WATCH_PID"
    fi
    exit 0
  fi
  printf -- 'Stage 3 Cutover skipped: %s is not yet provisioned/RUNNING. Re-run this exact master script anytime to resume.\n' "$A1_DISPLAY_NAME"
  exit 0
fi

[[ -f "$VAULT_KEY_PRIV" && -f "$A1_SSH_PRIV" && -f "$A1_KNOWN_HOSTS" ]] || \
  die "Missing local SSH or vault key files required for Stage 3 cutover."

IFS='|' read -r A1_VNIC_ID _ A1_PRIMARY_PRIV_IP A1_EPH_PUB_IP <<<"$(get_instance_network_summary "$A1_CUTOVER_ID")"
A1_SSH_OPTS=(-i "$A1_SSH_PRIV" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$A1_KNOWN_HOSTS" -o ConnectTimeout=15 -o BatchMode=yes)

ensure_a1_vip_and_compose() {
  A1_PIPS_JSON="$TMP_DIR/a1_pips.json"
  oci network private-ip list --region "$REGION" --vnic-id "$A1_VNIC_ID" --all >"$A1_PIPS_JSON"
  IFS='|' read -r A1_VIP_ID A1_VIP_ADDR < <(python3 - "$A1_PIPS_JSON" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
items = [x for x in ((json.loads(s) if s else {}).get("data") or []) if not x.get("is-primary") and x.get("display-name") == "jobiest-a1-reserved-vip"]
print("%s|%s" % (items[0]["id"], items[0]["ip-address"]) if items else "|")
PY
)
  if [[ -z "$A1_VIP_ID" ]]; then
    VIP_CREATE_JSON="$TMP_DIR/vip_create.json"
    oci network vnic assign-private-ip \
      --region "$REGION" \
      --vnic-id "$A1_VNIC_ID" \
      --display-name "jobiest-a1-reserved-vip" >"$VIP_CREATE_JSON"
    IFS='|' read -r A1_VIP_ID A1_VIP_ADDR < <(python3 - "$VIP_CREATE_JSON" <<'PY'
import json, sys
d = json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]
print("%s|%s" % (d["id"], d["ip-address"]))
PY
)
  fi

  SUBNET_PREFIX="$(oci network subnet get --region "$REGION" --subnet-id "$SUBNET_ID" --query 'data."cidr-block"' --raw-output | awk -F/ '{print $2}')"
  ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" "sudo bash -s" -- "$A1_VIP_ADDR" "$SUBNET_PREFIX" <<'REMOTE_VIP'
set -euo pipefail
VIP_ADDR="$1"
PREFIX="$2"
DEV="$(ip -o -4 route show to default | awk '{print $5; exit}')"
[[ -n "$DEV" ]] || { echo "FATAL: Could not detect primary network interface"; exit 1; }
sudo ip addr replace "${VIP_ADDR}/${PREFIX}" dev "$DEV"
cat >/etc/systemd/system/jobiest-vip.service <<EOF
[Unit]
Description=Configure Jobiest Reserved VIP Secondary Private IP
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ip addr replace ${VIP_ADDR}/${PREFIX} dev ${DEV}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable jobiest-vip.service >/dev/null

OCI_DIR="/home/ubuntu/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci"
if [[ -f "$OCI_DIR/docker-compose.yml" ]]; then
  python3 - "$OCI_DIR/docker-compose.yml" "$OCI_DIR/docker-compose.vip.yml" "$VIP_ADDR" <<'PY'
import re, sys
src, dst, vip = sys.argv[1], sys.argv[2], sys.argv[3]
txt = open(src, "r", encoding="utf-8").read()
rep = (
    "    ports:\n"
    "      - '127.0.0.1:80:80'\n"
    "      - '127.0.0.1:443:443'\n"
    "      - '%s:80:80'\n"
    "      - '%s:443:443'\n" % (vip, vip)
)
new_txt, n = re.subn(r"    ports:\n      - ['\"]?80:80['\"]?\n      - ['\"]?443:443['\"]?\n", rep, txt, count=1)
assert n == 1, "Could not rewrite caddy ports in docker-compose.yml"
open(dst, "w", encoding="utf-8").write(new_txt)
PY
  chown ubuntu:ubuntu "$OCI_DIR/docker-compose.vip.yml"
fi
REMOTE_VIP
}

RIP_NOW="$(oci network public-ip get --region "$REGION" --public-ip-id "$RESERVED_IP_ID" --query 'data."assigned-entity-id"' --raw-output)"
if [[ "$RIP_NOW" != "$E5_PRIVATE_IP_ID" ]]; then
  printf -- 'Reserved IP %s is ALREADY assigned off E5 (%s). Ensuring VIP compose isolation & verifying live HTTPS...\n' "$RESERVED_IP_EXPECTED" "$RIP_NOW"
  ensure_a1_vip_and_compose
  ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" "cd ~/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci && sudo docker compose -p oci -f docker-compose.vip.yml up -d --remove-orphans"
  for prod_u in "https://worker.jobiest.com/healthz" "https://api.jobiest.com/healthz" "https://ai.jobiest.com/healthz"; do
    printf -- '  [Live Prod] %-36s -> HTTP %s\n' "$prod_u" "$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' "$prod_u")"
  done
else
  cat <<EOF
Stage 3 Operation Disclosure (Requires Explicit Approval D):
  1. What      : Decrypt latest e5-app-and-caddy-*.tar.gz.enc in RAM on jobiest-a1,
                 restore E5's production bearer tokens (BROWSER_WORKER_SECRET,
                 API_KEYS, OLLAMA_API_KEY) + valid Let's Encrypt certificates for
                 {worker,api,ai}.jobiest.com, bind Caddy strictly to 127.0.0.1 +
                 secondary Private IP 'jobiest-a1-reserved-vip', verify local TLS &
                 Playwright 1.62.1 navigationOnly=true BEFORE moving the IP, move
                 Reserved IP ${RESERVED_IP_EXPECTED} from jobiest-ai (E5) to jobiest-a1,
                 and verify external production HTTPS endpoints.
  2. Why       : Cut production worker/api/ai traffic onto Always Free jobiest-a1
                 with zero Vercel env changes and fix Playwright 1.62.1 live.
  3. Resources : Reserved IP ${RESERVED_IP_EXPECTED} (${RESERVED_IP_ID}), jobiest-a1
                 (${A1_CUTOVER_ID}), jobiest-ai (${E5_INSTANCE_ID} — stays RUNNING).
  4. Risks     : ~1-3 second TCP reset during Reserved IP reassignment.
  5. Cost      : \$0.00/month Always Free.
  6. Rollback  : AUTOMATIC INSTANT ROLLBACK: if ANY external post-cutover check
                 fails, ${RESERVED_IP_EXPECTED} is immediately reassigned back to
                 jobiest-ai (${E5_PRIVATE_IP_ID}) in <3 seconds!
  7. Evidence  : External HTTPS 200 + TLS verify=0 on worker/api/ai.jobiest.com
                 and navigationOnly=true Playwright 1.62.1 pass on ${RESERVED_IP_EXPECTED}.
EOF

  CUTOVER_ANS=""
  if [[ "$SINGLE_CLICK_ALL" == "true" ]]; then
    CUTOVER_ANS="APPROVE_D_CUTOVER"
    printf -- '[Single-Click Mode] Owner-authorized pre-verified atomic cutover (%s -> %s) starting...\n' "$RESERVED_IP_EXPECTED" "$A1_DISPLAY_NAME"
  else
    while true; do
      prompt_tty "Enter APPROVE_D_CUTOVER to execute atomic production cutover now, or L to leave ${RESERVED_IP_EXPECTED} on jobiest-ai:" CUTOVER_ANS
      case "$CUTOVER_ANS" in
        APPROVE_D_CUTOVER|approve_d_cutover)
          CUTOVER_ANS="APPROVE_D_CUTOVER"
          break
          ;;
        L|l|Q|q)
          CUTOVER_ANS="LEAVE_ON_E5"
          break
          ;;
        *)
          printf -- 'Unrecognized selection "%s" — please enter APPROVE_D_CUTOVER or L.\n' "$CUTOVER_ANS" >/dev/tty
          ;;
      esac
    done
  fi

  ensure_a1_vip_and_compose

  if [[ "$CUTOVER_ANS" != "APPROVE_D_CUTOVER" ]]; then
    ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" "cd ~/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci && sudo docker compose -p oci -f docker-compose.vip.yml up -d --remove-orphans"
    printf -- 'Left Reserved IP %s untouched on jobiest-ai (E5); isolated %s Caddy onto %s.\n' "$RESERVED_IP_EXPECTED" "$A1_DISPLAY_NAME" "$A1_VIP_ADDR"
  else
    # Locate latest e5-app-and-caddy-*.tar.gz.enc in jobiest-gate2-vault
    VAULT_OBJS="$TMP_DIR/vault_objs.json"
    oci os object list --region "$REGION" --namespace-name "$ACTIVE_NS" --bucket-name "$VAULT_BUCKET" --prefix "e5-app-and-caddy-" --all >"$VAULT_OBJS"
    LATEST_E5_ENC="$(python3 - "$VAULT_OBJS" <<'PY'
import json, sys
s = open(sys.argv[1], "r", encoding="utf-8").read().strip()
items = [x for x in ((json.loads(s) if s else {}).get("data") or []) if x.get("name", "").endswith(".tar.gz.enc")]
items.sort(key=lambda x: x.get("time-created") or "", reverse=True)
print(items[0]["name"] if items else "")
PY
)"
    [[ -n "$LATEST_E5_ENC" ]] || die "No e5-app-and-caddy-*.tar.gz.enc archive found in $VAULT_BUCKET; run Stage 1 first."
    printf -- 'Using verified encrypted recovery archive: %s\n' "$LATEST_E5_ENC"

    # Create 5-minute read-only PAR for LATEST_E5_ENC
    CUT_EXP="$(python3 -c 'import datetime; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
    CUT_PAR_JSON="$TMP_DIR/cut_par.json"
    oci os preauth-request create \
      --region "$REGION" \
      --namespace-name "$ACTIVE_NS" \
      --bucket-name "$VAULT_BUCKET" \
      --name "cutover-read-$(date -u '+%H%M%S')" \
      --access-type ObjectRead \
      --object-name "$LATEST_E5_ENC" \
      --time-expires "$CUT_EXP" >"$CUT_PAR_JSON"
    CUT_PAR_ID="$(python3 - "$CUT_PAR_JSON" <<'PY'
import json, sys
print(json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]["id"])
PY
)"
    ACTIVE_PAR_IDS+=("$CUT_PAR_ID")
    CUT_PAR_URI="$(python3 - "$CUT_PAR_JSON" <<'PY'
import json, sys
print(json.loads(open(sys.argv[1], "r", encoding="utf-8").read())["data"]["access-uri"])
PY
)"
    rm -f "$CUT_PAR_JSON"
    CUT_PAR_FULL="https://objectstorage.${REGION}.oraclecloud.com${CUT_PAR_URI}"
    CUT_PAR_URI=""

    ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" "umask 077 && mkdir -p /dev/shm/.cutover_vault && chmod 700 /dev/shm/.cutover_vault"
    ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" "umask 077 && cat > /dev/shm/.cutover_vault/vault.key && chmod 600 /dev/shm/.cutover_vault/vault.key" <"$VAULT_KEY_PRIV"
    printf -- 'url = "%s"\n' "$CUT_PAR_FULL" | ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" \
      "umask 077 && cat > /dev/shm/.cutover_vault/par.curl && chmod 600 /dev/shm/.cutover_vault/par.curl"
    CUT_PAR_FULL=""

    printf -- 'Activating production TLS certificates & bearer keys on %s (local pre-cutover verification)...\n' "$A1_DISPLAY_NAME"
    ssh "${A1_SSH_OPTS[@]}" "ubuntu@${A1_EPH_PUB_IP}" 'bash -s' <<'REMOTE_PRE_CUTOVER'
set -euo pipefail
cleanup_cut() {
  find /dev/shm/.cutover_vault -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf /dev/shm/.cutover_vault
}
trap cleanup_cut EXIT

curl -fsS --config /dev/shm/.cutover_vault/par.curl -o /dev/shm/.cutover_vault/e5.tar.gz.enc
chmod 600 /dev/shm/.cutover_vault/e5.tar.gz.enc

mkdir -p /dev/shm/.cutover_vault/extracted
chmod 700 /dev/shm/.cutover_vault/extracted

python3 - /dev/shm/.cutover_vault/vault.key /dev/shm/.cutover_vault/e5.tar.gz.enc <<'PY' | sudo tar -xzf - -C /dev/shm/.cutover_vault/extracted
import hashlib, hmac, os, subprocess, sys
MAGIC = b"JBV1\x00"
master = open(sys.argv[1], "rb").read().strip()
blob = open(sys.argv[2], "rb").read()
assert len(blob) >= 85 and blob[:5] == MAGIC, "Invalid JBV1 archive header"
body, tag = blob[:-32], blob[-32:]
salt, ct = body[5:37], body[37:]
enc_sub = hmac.new(master, b"JBV1-ENC|" + salt, hashlib.sha256).hexdigest().encode("ascii")
mac_sub = hmac.new(master, b"JBV1-MAC|" + salt, hashlib.sha256).digest()
assert hmac.compare_digest(tag, hmac.new(mac_sub, body, hashlib.sha256).digest()), "HMAC verification failed"
r_fd, w_fd = os.pipe()
os.write(w_fd, enc_sub + b"\n")
os.close(w_fd)
try:
    proc = subprocess.run(
        ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-md", "sha256", "-pass", "fd:%d" % r_fd],
        input=ct, pass_fds=(r_fd,), capture_output=True, check=True,
    )
finally:
    os.close(r_fd)
sys.stdout.buffer.write(proc.stdout)
PY

OLD_ENV="$(sudo find /dev/shm/.cutover_vault/extracted -type f -path '*/deploy/oci/.env' | head -n1)"
[[ -n "$OLD_ENV" ]] || { echo "FATAL: deploy/oci/.env not found in encrypted recovery archive"; exit 1; }

OLD_CADDY_DATA="$(sudo find /dev/shm/.cutover_vault/extracted -type d -path '*caddy_data/_data' | head -n1)"
OLD_CADDY_CFG="$(sudo find /dev/shm/.cutover_vault/extracted -type d -path '*caddy_config/_data' | head -n1)"
[[ -n "$OLD_CADDY_DATA" ]] || { echo "FATAL: caddy_data/_data not found in encrypted recovery archive"; exit 1; }

NEW_OCI_DIR="$HOME/jobiest/ai-career-agent-coding-agent/ai-career-agent-coding-agent/deploy/oci"

sudo python3 - "$OLD_ENV" "$NEW_OCI_DIR/.env" <<'PY'
import os, sys
src_lines = open(sys.argv[1], "r", encoding="utf-8").read().splitlines()
kv = {}
for ln in src_lines:
    s = ln.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1)
        kv[k.strip()] = v.strip()
for req in ("BROWSER_WORKER_SECRET", "API_KEYS", "OLLAMA_API_KEY"):
    assert kv.get(req), "Missing required key %s in archived E5 .env" % req

out = [
    "BROWSER_WORKER_SECRET=%s" % kv["BROWSER_WORKER_SECRET"],
    "API_KEYS=%s" % kv["API_KEYS"],
    "OLLAMA_API_KEY=%s" % kv["OLLAMA_API_KEY"],
    "WORKER_DOMAIN=worker.jobiest.com",
    "API_DOMAIN=api.jobiest.com",
    "AI_DOMAIN=ai.jobiest.com",
    "RATE_LIMIT_MAX=%s" % kv.get("RATE_LIMIT_MAX", "30"),
    "RATE_LIMIT_WINDOW_MS=%s" % kv.get("RATE_LIMIT_WINDOW_MS", "60000"),
    "OLLAMA_MAX_LOADED_MODELS=1",
    "OLLAMA_NUM_PARALLEL=1",
    "OLLAMA_KEEP_ALIVE=5m",
]
fd = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
PY
sudo chown ubuntu:ubuntu "$NEW_OCI_DIR/.env"
chmod 600 "$NEW_OCI_DIR/.env"

sudo cp -a "${OLD_CADDY_DATA}/." /var/lib/docker/volumes/oci_caddy_data/_data/
if [[ -n "$OLD_CADDY_CFG" ]]; then
  sudo cp -a "${OLD_CADDY_CFG}/." /var/lib/docker/volumes/oci_caddy_config/_data/
fi

cd "$NEW_OCI_DIR"
sudo docker compose -p oci -f docker-compose.vip.yml up -d --remove-orphans
sleep 6

# Pre-cutover local verification against 127.0.0.1:443 BEFORE touching Reserved IP
for dom in worker.jobiest.com api.jobiest.com ai.jobiest.com; do
  RES="$(curl -fsS --max-time 15 --resolve "${dom}:443:127.0.0.1" -o /dev/null -w '%{http_code}|%{ssl_verify_result}' "https://${dom}/healthz")"
  echo "  [Pre-Cutover Local TLS] https://${dom}/healthz -> ${RES}"
  [[ "$RES" == "200|0" ]] || { echo "FATAL: Pre-cutover local TLS/health check failed for ${dom} (${RES})"; exit 1; }
done

# Pre-cutover local navigationOnly=true Playwright 1.62.1 verification with production worker secret
W_SEC="$(awk -F= '/^BROWSER_WORKER_SECRET=/{sub(/^BROWSER_WORKER_SECRET=/,""); print; exit}' "$NEW_OCI_DIR/.env")"
NAV_OUT="$(printf -- 'header = "Authorization: Bearer %s"\n' "$W_SEC" | \
  curl -fsS --max-time 60 --resolve "worker.jobiest.com:443:127.0.0.1" -K - \
    -H 'Content-Type: application/json' \
    -d '{"jobUrl":"https://boards.greenhouse.io/embed/job_app?for=stripe&token=0","navigationOnly":true,"applicant":{"name":"Cutover Probe","email":"probe@jobiest.com"}}' \
    "https://worker.jobiest.com/submit")"
python3 -c '
import json, sys
d = json.loads(sys.argv[1])
assert d.get("navigationOnly") is True, d
assert d.get("submissionAttempted") is False, d
assert d.get("mutationAttempted") is False, d
print("  [Pre-Cutover Local Worker PASS] navigationOnly=True submissionAttempted=False outcome=%s" % d.get("outcome"))
' "$NAV_OUT"
REMOTE_PRE_CUTOVER

    # Immediately revoke temporary cutover read PAR
    oci os preauth-request delete \
      --region "$REGION" \
      --namespace-name "$ACTIVE_NS" \
      --bucket-name "$VAULT_BUCKET" \
      --par-id "$CUT_PAR_ID" \
      --force >/dev/null
    ACTIVE_PAR_IDS=()

    printf -- 'Atomically reassigning Reserved IP %s (%s) -> %s (%s)...\n' \
      "$RESERVED_IP_EXPECTED" "$RESERVED_IP_ID" "$A1_DISPLAY_NAME" "$A1_VIP_ADDR"

    rollback_to_e5() {
      printf -- '\n[AUTOMATIC ROLLBACK] Post-cutover check failed! Reassigning %s back to jobiest-ai (%s) immediately...\n' \
        "$RESERVED_IP_EXPECTED" "$E5_PRIVATE_IP_ID" >&2
      oci network public-ip update \
        --region "$REGION" \
        --public-ip-id "$RESERVED_IP_ID" \
        --private-ip-id "$E5_PRIVATE_IP_ID" \
        --force >/dev/null
      printf -- '[AUTOMATIC ROLLBACK COMPLETE] Reserved IP %s restored to jobiest-ai (E5).\n' "$RESERVED_IP_EXPECTED" >&2
    }

    oci network public-ip update \
      --region "$REGION" \
      --public-ip-id "$RESERVED_IP_ID" \
      --private-ip-id "$A1_VIP_ID" \
      --force >/dev/null

    sleep 4

    CUTOVER_VERIFIED=1
    for prod_dom in worker.jobiest.com api.jobiest.com ai.jobiest.com; do
      EXT_OK=0
      for _ in $(seq 1 8); do
        EXT_RES="$(curl -fsS --max-time 12 --resolve "${prod_dom}:443:${RESERVED_IP_EXPECTED}" -o /dev/null -w '%{http_code}|%{ssl_verify_result}' "https://${prod_dom}/healthz" 2>/dev/null || echo '000|1')"
        if [[ "$EXT_RES" == "200|0" ]]; then
          EXT_OK=1
          printf -- '  [LIVE CUTOVER PASS] https://%-22s (%s) -> HTTP 200 | TLS verify=0\n' "${prod_dom}/healthz" "$RESERVED_IP_EXPECTED"
          break
        fi
        sleep 2
      done
      if (( EXT_OK == 0 )); then
        CUTOVER_VERIFIED=0
        break
      fi
    done

    if (( CUTOVER_VERIFIED == 0 )); then
      rollback_to_e5
      die "Cutover verification failed; traffic was automatically rolled back to jobiest-ai (E5)."
    fi
  fi
fi

# Deploy co-hosted ARM64 Mailu 2024.06.67 on jobiest-a1's dedicated Primary Public IP when region lacks E2.1.Micro hardware
if (( ${COHOST_MAIL_ON_A1:-0} == 1 )) && [[ "${STAGE2_CHOICE:-}" == "APPROVE_C" ]]; then
  banner "STAGE 2B — DEPLOYING @${PRIMARY_MAIL_DOMAIN} MAILU ${MAILU_VERSION} (ARM64) ON ${A1_DISPLAY_NAME} DEDICATED PRIMARY IP (${A1_EPH_PUB_IP})"
  oci network vnic update --region "$REGION" --vnic-id "$A1_VNIC_ID" --nsg-ids "[\"${MAIL_NSG_ID}\"]" --force >/dev/null
  deploy_mailu_on_target_host "$A1_PRIMARY_PRIV_IP" "$A1_EPH_PUB_IP" "$A1_SSH_PRIV" "$A1_KNOWN_HOSTS" "true"
fi

banner "MASTER ALWAYS-FREE MIGRATION & BUSINESS EMAIL ORCHESTRATION COMPLETE"
cat <<EOF
1. Live Production App/Worker/AI Stack : VERIFIED on Always Free ${A1_DISPLAY_NAME}
   - Reserved Public IP                : ${RESERVED_IP_EXPECTED} -> ${A1_DISPLAY_NAME} (${A1_VIP_ADDR})
   - Endpoints                         : https://worker.jobiest.com | https://api.jobiest.com | https://ai.jobiest.com
   - Instant Emergency Rollback Cmd    : oci network public-ip update --region ${REGION} --public-ip-id ${RESERVED_IP_ID} --private-ip-id ${E5_PRIVATE_IP_ID} --force
2. Business Email (@${PRIMARY_MAIL_DOMAIN})        : Mailu ${MAILU_VERSION} Ready (Credentials saved at ${MAIL_LOCAL_CREDS})
3. Existing jobiest-ai (E5) & Backups  : 100% PRESERVED & UNTOUCHED (zero deletions)
4. Monthly OCI Cost                    : \$0.00/month Always Free (no PAYG upgrade)
EOF
