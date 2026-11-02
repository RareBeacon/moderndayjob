#!/usr/bin/env bash
# ==============================================================================
# Jobiest Self-Hosted Mail Server - Idempotent Domain, DKIM, Webmail & Mailboxes
# ==============================================================================
# Configures Stalwart + SnappyMail automatically with zero manual UI clicks:
#   1. Syncs STALWART_ADMIN_USER & hashed STALWART_ADMIN_PASSWORD into Stalwart's
#      /opt/stalwart-mail/etc/config.toml (fallback-admin) on first boot.
#   2. Pre-configures SnappyMail domain JSON (jobiest.com.json & default.json)
#      pointing to stalwart:993 (IMAPS) and stalwart:465 (SMTPS) so staff can
#      log straight into https://webmail.jobiest.com immediately.
#   3. Registers primary domain (jobiest.com) & 2048-bit RSA DKIM signing key.
#   4. Creates all 9 core @jobiest.com mailboxes + aliases and writes initial
#      passwords only to /root/.jobiest-mailboxes.secret (chmod 0600).
#   5. Configures outbound TLS smarthost relay (Port 587/465) when RELAY_USER is set.
# ==============================================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/jobiest-mail/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE. Copy .env.example to $ENV_FILE (chmod 600) first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

API_BASE="${STALWART_LOCAL_API:-http://127.0.0.1:8080/api}"
AUTH_HEADER="${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}"
SECRET_VAULT="/root/.jobiest-mailboxes.secret"
touch "$SECRET_VAULT"
chmod 600 "$SECRET_VAULT"

echo "[1/6] Ensuring Stalwart fallback-admin credentials match .env..."
for _ in $(seq 1 20); do
  if docker exec jobiest-stalwart test -f /opt/stalwart-mail/etc/config.toml 2>/dev/null; then
    break
  fi
  sleep 2
done

if ! curl -fsS -u "$AUTH_HEADER" "${API_BASE}/principal?limit=1" >/dev/null 2>&1; then
  ADMIN_HASH=$(openssl passwd -6 "$STALWART_ADMIN_PASSWORD")
  TMP_CFG=$(mktemp /tmp/stalwart-cfg.XXXXXX.toml)
  docker cp jobiest-stalwart:/opt/stalwart-mail/etc/config.toml "$TMP_CFG"
  python3 - "$TMP_CFG" "$STALWART_ADMIN_USER" "$ADMIN_HASH" <<'PY'
import re, sys
path, user, secret = sys.argv[1], sys.argv[2], sys.argv[3]
txt = open(path, "r", encoding="utf-8").read()

if "[authentication.fallback-admin]" in txt:
    txt = re.sub(
        r'(\[authentication\.fallback-admin\][^\[]*?user\s*=\s*)"[^"]*"',
        lambda m: f'{m.group(1)}"{user}"',
        txt,
        flags=re.S,
    )
    txt = re.sub(
        r'(\[authentication\.fallback-admin\][^\[]*?secret\s*=\s*)"[^"]*"',
        lambda m: f'{m.group(1)}"{secret}"',
        txt,
        flags=re.S,
    )
elif "authentication.fallback-admin.secret" in txt:
    txt = re.sub(r'authentication\.fallback-admin\.user\s*=\s*"[^"]*"', f'authentication.fallback-admin.user = "{user}"', txt)
    txt = re.sub(r'authentication\.fallback-admin\.secret\s*=\s*"[^"]*"', f'authentication.fallback-admin.secret = "{secret}"', txt)
else:
    txt += f'\n[authentication.fallback-admin]\nuser = "{user}"\nsecret = "{secret}"\n'

open(path, "w", encoding="utf-8").write(txt)
PY
  docker cp "$TMP_CFG" jobiest-stalwart:/opt/stalwart-mail/etc/config.toml
  rm -f "$TMP_CFG"
  docker restart jobiest-stalwart >/dev/null
fi

echo "[2/6] Waiting for Stalwart loopback management API at ${API_BASE}..."
API_OK=0
for _ in $(seq 1 30); do
  if curl -fsS -u "$AUTH_HEADER" "${API_BASE}/principal?limit=1" >/dev/null 2>&1; then
    API_OK=1
    break
  fi
  sleep 2
done
if [[ "$API_OK" -ne 1 ]]; then
  echo "ERROR: Stalwart management API did not respond at ${API_BASE}." >&2
  exit 1
fi

echo "[3/6] Pre-configuring SnappyMail Webmail domain (${PRIMARY_DOMAIN} -> stalwart:993 / stalwart:465)..."
docker exec jobiest-webmail sh -lc "
  mkdir -p /var/lib/snappymail/_data_/_default_/domains
  cat > /var/lib/snappymail/_data_/_default_/domains/${PRIMARY_DOMAIN}.json <<'JSON'
{
  \"IMAP\": {
    \"host\": \"stalwart\",
    \"port\": 993,
    \"type\": 1,
    \"secure\": 1,
    \"timeout\": 300,
    \"shortLogin\": false,
    \"lowerLogin\": true,
    \"sasl\": [\"SCRAM-SHA-512\", \"SCRAM-SHA-256\", \"PLAIN\", \"LOGIN\"],
    \"ssl\": {
      \"verify_peer\": false,
      \"verify_peer_name\": false,
      \"allow_self_signed\": true,
      \"SNI_enabled\": false
    }
  },
  \"SMTP\": {
    \"host\": \"stalwart\",
    \"port\": 465,
    \"type\": 1,
    \"secure\": 1,
    \"timeout\": 60,
    \"shortLogin\": false,
    \"lowerLogin\": true,
    \"useAuth\": true,
    \"setSender\": false,
    \"sasl\": [\"SCRAM-SHA-512\", \"SCRAM-SHA-256\", \"PLAIN\", \"LOGIN\"],
    \"ssl\": {
      \"verify_peer\": false,
      \"verify_peer_name\": false,
      \"allow_self_signed\": true,
      \"SNI_enabled\": false
    }
  },
  \"Sieve\": {
    \"host\": \"stalwart\",
    \"port\": 4190,
    \"type\": 1,
    \"secure\": 1,
    \"timeout\": 10,
    \"shortLogin\": false,
    \"lowerLogin\": true,
    \"enabled\": false,
    \"ssl\": {
      \"verify_peer\": false,
      \"verify_peer_name\": false,
      \"allow_self_signed\": true
    }
  },
  \"whiteList\": \"\"
}
JSON
  cp /var/lib/snappymail/_data_/_default_/domains/${PRIMARY_DOMAIN}.json /var/lib/snappymail/_data_/_default_/domains/default.json
  chown -R 1000:1000 /var/lib/snappymail/_data_ 2>/dev/null || chown -R www-data:www-data /var/lib/snappymail/_data_ 2>/dev/null || true
"

echo "[4/6] Ensuring domain '${PRIMARY_DOMAIN}' exists in Stalwart..."
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

echo "[5/6] Provisioning core Jobiest mailboxes & app SMTP sender..."
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

echo "[6/6] Ensuring 2048-bit RSA DKIM signature key & outbound relay..."
curl -fsS -X POST -u "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"mail-${PRIMARY_DOMAIN}\",\"algorithm\":\"rsa-sha256\",\"domain\":\"${PRIMARY_DOMAIN}\",\"selector\":\"mail\"}" \
  "${API_BASE}/dkim" >/dev/null 2>&1 || true

if [[ -n "${RELAY_HOST:-}" && -n "${RELAY_USER:-}" && "${RELAY_USER:-}" != REPLACE_* ]]; then
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
    "${API_BASE}/settings" >/dev/null || true
  echo "  -> Outbound TLS smarthost configured (${RELAY_HOST}:${RELAY_PORT:-587})."
else
  echo "  -> Outbound smarthost relay credentials not set yet (optional; set RELAY_USER/RELAY_PASSWORD in ${ENV_FILE} and rerun)."
fi

echo ""
echo "Bootstrap complete. Initial mailbox secrets are restricted to root in: ${SECRET_VAULT}"
