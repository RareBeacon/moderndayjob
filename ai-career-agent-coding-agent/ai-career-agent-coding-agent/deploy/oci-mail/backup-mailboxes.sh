#!/usr/bin/env bash
# ==============================================================================
# Jobiest Self-Hosted Mail Server - Encrypted Nightly Off-Host Backup ($0/mo)
# ==============================================================================
# Archives Stalwart + SnappyMail volumes, encrypts with AES-256-CBC + PBKDF2
# (200,000 iterations), uploads to OCI Always Free Object Storage (< 20 GiB cap),
# and prunes archives older than BACKUP_RETENTION_DAYS.
# ==============================================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/jobiest-mail/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" || "${BACKUP_ENCRYPTION_PASSPHRASE}" == REPLACE_* ]]; then
  echo "ERROR: Set a strong BACKUP_ENCRYPTION_PASSPHRASE in $ENV_FILE before running backups." >&2
  exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR=$(mktemp -d /tmp/jobiest-mail-backup.XXXXXX)
ARCHIVE_ENC="${WORK_DIR}/jobiest-mail-${STAMP}.tar.gz.enc"
trap 'rm -rf "$WORK_DIR"' EXIT

docker run --rm \
  -v oci-mail_stalwart_data:/backup/stalwart:ro \
  -v oci-mail_snappymail_data:/backup/snappymail:ro \
  alpine:3.20 tar -czf - -C /backup . \
  | PASS="$BACKUP_ENCRYPTION_PASSPHRASE" openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:PASS -out "$ARCHIVE_ENC"

chmod 600 "$ARCHIVE_ENC"
SIZE_BYTES=$(stat -c%s "$ARCHIVE_ENC")
echo "[mail-backup] Encrypted archive ready: ${SIZE_BYTES} bytes"

if command -v oci >/dev/null 2>&1 && [[ -n "${OCI_BACKUP_BUCKET:-}" ]]; then
  oci os object put \
    --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "mail-backups/jobiest-mail-${STAMP}.tar.gz.enc" \
    --file "$ARCHIVE_ENC" \
    --force >/dev/null
  echo "[mail-backup] Uploaded mail-backups/jobiest-mail-${STAMP}.tar.gz.enc to OCI bucket ${OCI_BACKUP_BUCKET}"
else
  LOCAL_DIR="/var/backups/jobiest-mail"
  mkdir -p "$LOCAL_DIR"
  chmod 700 "$LOCAL_DIR"
  cp "$ARCHIVE_ENC" "${LOCAL_DIR}/"
  find "$LOCAL_DIR" -type f -name "jobiest-mail-*.tar.gz.enc" -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  echo "[mail-backup] Saved encrypted archive locally to ${LOCAL_DIR} (oci CLI not configured)"
fi
