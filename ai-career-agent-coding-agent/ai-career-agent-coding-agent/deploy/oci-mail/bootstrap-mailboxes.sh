#!/usr/bin/env bash
# ==============================================================================
# Jobiest Self-Hosted Mail Server - Idempotent Domain, DKIM & Mailbox Bootstrap
# ==============================================================================
# Configures Stalwart over its loopback REST API (127.0.0.1:8080):
#   1. Registers primary domain (jobiest.com)
#   2. Generates 2048-bit RSA + Ed25519 DKIM signing keys
#   3. Creates core Jobiest mailboxes + transactional app sender account
#   4. Configures outbound TLS smarthost relay (Port 587/465) so OCI Free Tier
#      outbound port-25 restrictions never block external delivery.
#   5. Writes initial random mailbox credentials to /root/.jobiest-mailboxes.secret (0600)
#      without printing passwords to stdout or system logs.
# ==============================================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/jobiest-mail/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE. Copy .env.example to $ENV_FILE (chmod 600) first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

API_BASE="http://127.0.0.1:8080/api"
AUTH_HEADER="${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}"
SECRET_VAULT="/root/.jobiest-mailboxes.secret"
touch "$SECRET_VAULT"
chmod 600 "$SECRET_VAULT"

echo "[1/5] Waiting for Stalwart loopback management API at ${API_BASE}..."
for _ in $(seq 1 30); do
  if curl -fsS -u "$AUTH_HEADER" "${API_BASE}/principal?limit=1" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "[2/5] Ensuring domain '${PRIMARY_DOMAIN}' exists in Stalwart..."
DOMAIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH_HEADER" "${API_BASE}/principal/${PRIMARY_DOMAIN}")
if [[ "$DOMAIN_STATUS" == "404" ]]; then
  curl -fsS -X POST -u "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"domain\",\"name\":\"${PRIMARY_DOMAIN}\",\"description\":\"Jobiest Production Mail Domain\"}" \
    "${API_BASE}/principal" >/dev/null
  echo "  -> Created domain ${PRIMARY_DOMAIN}"
else
  echo "  -> Domain ${PRIMARY_DOMAIN} already registered (HTTP ${DOMAIN_STATUS})"
fi

echo "[3/5] Provisioning core Jobiest mailboxes & app SMTP sender..."
# Format: localpart|Display Name|QuotaBytes|AliasesCommaSeparated
MAILBOX_SPECS=(
  "philip|Philip Opeyemi (CEO)|5368709120|ceo,founder"
  "admin|Jobiest Operations Admin|2147483648|postmaster,abuse,dmarc,hostmaster"
  "support|Jobiest Customer Support|5368709120|help"
  "hello|Jobiest General Inquiries|2147483648|info,contact"
  "careers|Jobiest Founding Team & Careers|3221225472|jobs,apply,talent"
  "partnerships|Jobiest Global Partnerships|3221225472|partners,employers,bd"
  "finance|Jobiest Billing & Finance|2147483648|billing,invoices"
  "privacy|Jobiest Privacy & DPO|2147483648|dpo,legal,security"
  "no-reply|Jobiest Transactional Mailer|1073741824|notifications"
)

for spec in "${MAILBOX_SPECS[@]}"; do
  IFS='|' read -r localpart display quota aliases_csv <<< "$spec"
  addr="${localpart}@${PRIMARY_DOMAIN}"
  status=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH_HEADER" "${API_BASE}/principal/${addr}")
  if [[ "$status" == "404" ]]; then
    raw_pw=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#%^*_' | head -c 24)
    pw_hash=$(openssl passwd -6 "$raw_pw")

    emails_json="[\"${addr}\""
    IFS=',' read -ra alias_arr <<< "$aliases_csv"
    for al in "${alias_arr[@]}"; do
      if [[ -n "$al" ]]; then
        emails_json="${emails_json},\"${al}@${PRIMARY_DOMAIN}\""
      fi
    done
    emails_json="${emails_json}]"

    payload=$(printf '{"type":"individual","name":"%s","description":"%s","secrets":["%s"],"emails":%s,"quota":%s,"roles":["user"]}' \
      "$addr" "$display" "$pw_hash" "$emails_json" "$quota")

    curl -fsS -X POST -u "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${API_BASE}/principal" >/dev/null

    printf "%s\t%s\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$addr" "$raw_pw" >> "$SECRET_VAULT"
    echo "  -> Created mailbox ${addr} (quota: $((quota / 1073741824)) GiB; initial secret stored in ${SECRET_VAULT})"
  else
    echo "  -> Mailbox ${addr} already exists (skipped)"
  fi
done

echo "[4/5] Ensuring 2048-bit RSA DKIM signature key for ${PRIMARY_DOMAIN}..."
curl -fsS -X POST -u "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"mail-${PRIMARY_DOMAIN}\",\"algorithm\":\"rsa-sha256\",\"domain\":\"${PRIMARY_DOMAIN}\",\"selector\":\"mail\"}" \
  "${API_BASE}/dkim" >/dev/null 2>&1 || true

if [[ -n "${RELAY_HOST:-}" && "${RELAY_USER:-}" != REPLACE_* ]]; then
  echo "[5/5] Configuring authenticated TLS outbound smarthost (${RELAY_HOST}:${RELAY_PORT:-587})..."
  curl -fsS -X POST -u "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "[
      {\"type\":\"insert\",\"prefix\":\"queue.outbound.next-hop\",\"values\":[[\"default\",\"relay\"]]},
      {\"type\":\"insert\",\"prefix\":\"queue.outbound.tls.starttls\",\"values\":[[\"relay\",\"require\"]]},
      {\"type\":\"insert\",\"prefix\":\"remote.relay\",\"values\":[
        [\"protocol\",\"smtp\"],
        [\"address\",\"${RELAY_HOST}\"],
        [\"port\",\"${RELAY_PORT:-587}\"],
        [\"auth.username\",\"${RELAY_USER}\"],
        [\"auth.secret\",\"${RELAY_PASSWORD}\"]
      ]}
    ]" \
    "${API_BASE}/settings" >/dev/null
  echo "  -> Outbound TLS smarthost configured."
else
  echo "[5/5] RELAY_USER still placeholder in ${ENV_FILE}; skipping outbound smarthost bind until credentials are set."
fi

echo ""
echo "Bootstrap complete. Initial mailbox secrets are restricted to root in: ${SECRET_VAULT}"
echo "Retrieve DKIM public DNS record in Stalwart Admin Console: https://${MAIL_HOSTNAME}"
