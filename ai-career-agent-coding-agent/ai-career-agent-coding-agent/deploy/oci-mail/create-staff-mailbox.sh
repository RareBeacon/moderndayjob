#!/usr/bin/env bash
# ==============================================================================
# Create or Reset a Staff @jobiest.com Business Mailbox on Stalwart Mail Server
# ==============================================================================
# Usage:
#   sudo /opt/jobiest-mail/create-staff-mailbox.sh <email_or_username> "<Full Name & Role>" [quota_gb]
#
# Examples:
#   sudo /opt/jobiest-mail/create-staff-mailbox.sh ada@jobiest.com "Adaobi Okafor (Support)" 3
#   sudo /opt/jobiest-mail/create-staff-mailbox.sh chidi "Chidi Nwosu (Operations)"
#
# Behavior:
#   - Generates a strong 20-character initial password
#   - Stores only a salted SHA-512 hash ($6$...) in Stalwart (never plaintext)
#   - Creates the mailbox if new, or resets its password if it already exists
#   - Prints the staff member's Webmail & IMAP/SMTP login card once to your terminal
# ==============================================================================
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: sudo $0 <username_or_email> \"<Full Name>\" [quota_gb]" >&2
  exit 1
fi

ENV_FILE="${ENV_FILE:-/opt/jobiest-mail/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

RAW_INPUT=$(echo "$1" | tr '[:upper:]' '[:lower:]' | xargs)
DISPLAY_NAME="$2"
QUOTA_GB="${3:-2}"

LOCAL_PART="${RAW_INPUT%%@*}"
if [[ ! "$LOCAL_PART" =~ ^[a-z0-9._-]{2,40}$ ]]; then
  echo "ERROR: Invalid mailbox username '${LOCAL_PART}'. Use 2-40 letters, digits, dots, underscores, or hyphens." >&2
  exit 1
fi

EMAIL_ADDR="${LOCAL_PART}@${PRIMARY_DOMAIN:-jobiest.com}"
QUOTA_BYTES=$(( QUOTA_GB * 1073741824 ))
API_BASE="http://127.0.0.1:8080/api"
AUTH_HEADER="${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}"

RAW_PW=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#%^*_' | head -c 20)
PW_HASH=$(openssl passwd -6 "$RAW_PW")

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH_HEADER" "${API_BASE}/principal/${EMAIL_ADDR}")

if [[ "$STATUS" == "404" ]]; then
  PAYLOAD=$(printf '{"type":"individual","name":"%s","description":"%s","secrets":["%s"],"emails":["%s"],"quota":%s,"roles":["user"]}' \
    "$EMAIL_ADDR" "$DISPLAY_NAME" "$PW_HASH" "$EMAIL_ADDR" "$QUOTA_BYTES")
  curl -fsS -X POST -u "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${API_BASE}/principal" >/dev/null
  ACTION_DONE="CREATED"
else
  PATCH_PAYLOAD=$(printf '[{"action":"set","field":"secrets","value":["%s"]},{"action":"set","field":"description","value":"%s"},{"action":"set","field":"quota","value":%s}]' \
    "$PW_HASH" "$DISPLAY_NAME" "$QUOTA_BYTES")
  curl -fsS -X PATCH -u "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$PATCH_PAYLOAD" \
    "${API_BASE}/principal/${EMAIL_ADDR}" >/dev/null
  ACTION_DONE="PASSWORD_RESET"
fi

cat <<EOF
======================================================================
JOBIEST BUSINESS MAILBOX ${ACTION_DONE}
======================================================================
Staff Name      : ${DISPLAY_NAME}
Email Address   : ${EMAIL_ADDR}
Initial Password: ${RAW_PW}   (Share securely once; ask staff to change after login)
Quota           : ${QUOTA_GB} GiB

Browser Webmail : https://${WEBMAIL_HOSTNAME:-webmail.jobiest.com}
Mobile / Desktop:
  - IMAP Server : ${MAIL_HOSTNAME:-mail.jobiest.com} (Port 993, SSL/TLS)
  - SMTP Server : ${MAIL_HOSTNAME:-mail.jobiest.com} (Port 465, SSL/TLS)
  - Username    : ${EMAIL_ADDR}
======================================================================
EOF
