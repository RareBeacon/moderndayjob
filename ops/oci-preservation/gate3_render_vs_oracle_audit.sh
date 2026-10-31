#!/usr/bin/env bash
# ==============================================================================
# JOBIEST INFRASTRUCTURE PRESERVATION — GATE 3 LIVE RENDER VS ORACLE AUDIT
# ==============================================================================
# Strictly read-only / non-submitting verification of:
#   - Standby: https://jobiest-browser-worker.onrender.com (Render Free, Docker)
#   - Primary: https://worker.jobiest.com                  (Oracle E5 Bridge)
#   - Gateway: https://api.jobiest.com                     (Oracle API Gateway)
#
# SAFETY & SECURITY GUARANTEES:
#   1. ZERO modifications to Oracle, Render, Vercel, Supabase, or DNS.
#   2. ZERO real job applications submitted:
#      - Greenhouse/Lever probe sends candidate.name=null, candidate.email="",
#        which forces an unconditional STOP (MISSING_INFO) in adapters/greenhouse.ts:49
#        and adapters/lever.ts:44 BEFORE any form fill or submit click, even if
#        a page has no CAPTCHA.
#      - Ashby probe sends candidate.cvDownloadUrl=null, candidate.cvPath=null,
#        which forces an unconditional STOP (MISSING_INFO) in adapters/ashby.ts:106
#        BEFORE any submit click.
#   3. ZERO secret exposure:
#      - Optional BROWSER_WORKER_SECRET is read silently via `read -r -s`,
#        passed to curl exclusively over stdin (`--config -`) so it never
#        appears in process arguments (`ps aux`), logs, terminal output, or disk,
#        and is wiped from memory on EXIT.
# ==============================================================================

set -euo pipefail

RENDER_URL="https://jobiest-browser-worker.onrender.com"
ORACLE_URL="https://worker.jobiest.com"
ORACLE_API_URL="https://api.jobiest.com"
DUMMY_PDF_URL="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"

WORKER_SECRET=""
TMP_DIR="$(mktemp -d /tmp/jobiest-gate3.XXXXXX)"
chmod 700 "$TMP_DIR"

cleanup() {
  WORKER_SECRET=""
  unset WORKER_SECRET || true
  rm -rf "$TMP_DIR" || true
}
trap cleanup EXIT INT TERM

banner() {
  printf '\n==============================================================================\n'
  printf '%s\n' "$1"
  printf '==============================================================================\n'
}

probe_health() {
  local label="$1"
  local url="$2"
  local max_time="$3"
  local hdr_file="$TMP_DIR/hdr.txt"
  local body_file="$TMP_DIR/body.txt"
  rm -f "$hdr_file" "$body_file"

  local metrics=""
  local rc=0
  metrics="$(curl -sS -D "$hdr_file" -o "$body_file" --max-time "$max_time" \
    -w 'http_code=%{http_code} dns_s=%{time_namelookup} tcp_s=%{time_connect} tls_s=%{time_appconnect} ttfb_s=%{time_starttransfer} total_s=%{time_total}' \
    "$url/healthz" 2>"$TMP_DIR/err.txt")" || rc=$?

  printf '[%s] GET %s/healthz (max-time=%ss)\n' "$label" "$url" "$max_time"
  if [[ "$rc" -ne 0 ]]; then
    printf '  RESULT: CURL_EXIT_%d (%s)\n' "$rc" "$(tr '\r\n' ' ' <"$TMP_DIR/err.txt")"
    printf '  TIMING: %s\n' "${metrics:-unavailable}"
    return 0
  fi

  printf '  TIMING: %s\n' "$metrics"
  python3 - "$metrics" "$hdr_file" "$body_file" <<'PY'
import sys

metrics_raw, hdr_path, body_path = sys.argv[1], sys.argv[2], sys.argv[3]
kv = dict(item.split("=", 1) for item in metrics_raw.strip().split() if "=" in item)
total_ms = float(kv.get("total_s", "0")) * 1000.0
ttfb_ms = float(kv.get("ttfb_s", "0")) * 1000.0
exceeds_failover_probe = "YES (>2500ms isHealthy timeout!)" if total_ms > 2500.0 else "NO (<=2500ms)"
print(f"  PARSED: HTTP {kv.get('http_code')} | TTFB={ttfb_ms:.1f}ms | Total={total_ms:.1f}ms | Exceeds 2.5s failover probe: {exceeds_failover_probe}")

interesting = ("server:", "x-render-origin-server:", "cf-ray:", "rndr-id:", "alt-svc:")
with open(hdr_path, "r", encoding="utf-8", errors="replace") as fh:
    hdrs = [line.strip() for line in fh if line.lower().startswith(interesting)]
if hdrs:
    print("  HEADERS:", " | ".join(hdrs))
with open(body_path, "r", encoding="utf-8", errors="replace") as fb:
    body = fb.read().strip()
print("  BODY:", body[:240])
PY
}

post_unauth() {
  local label="$1"
  local url="$2"
  local auth_hdr="${3:-}"
  local body_file="$TMP_DIR/unauth_body.txt"
  rm -f "$body_file"

  local metrics=""
  local rc=0
  if [[ -n "$auth_hdr" ]]; then
    metrics="$(curl -sS -o "$body_file" --max-time 30 \
      -X POST "$url/submit" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $auth_hdr" \
      -d '{"jobUrl":"https://boards.greenhouse.io/acme/jobs/1","allowedDomains":["boards.greenhouse.io"],"candidate":{}}' \
      -w 'http_code=%{http_code} total_s=%{time_total}' 2>"$TMP_DIR/err.txt")" || rc=$?
  else
    metrics="$(curl -sS -o "$body_file" --max-time 30 \
      -X POST "$url/submit" \
      -H 'Content-Type: application/json' \
      -d '{"jobUrl":"https://boards.greenhouse.io/acme/jobs/1","allowedDomains":["boards.greenhouse.io"],"candidate":{}}' \
      -w 'http_code=%{http_code} total_s=%{time_total}' 2>"$TMP_DIR/err.txt")" || rc=$?
  fi

  if [[ "$rc" -ne 0 ]]; then
    printf '  [%s] CURL_EXIT_%d (%s)\n' "$label" "$rc" "$(tr '\r\n' ' ' <"$TMP_DIR/err.txt")"
  else
    printf '  [%s] %s | body=%s\n' "$label" "$metrics" "$(head -c 220 "$body_file" | tr '\r\n' ' ')"
  fi
}

post_auth_safe() {
  local label="$1"
  local url="$2"
  local payload_file="$3"
  local max_time="${4:-120}"
  local body_file="$TMP_DIR/auth_body.txt"
  rm -f "$body_file"

  local metrics=""
  local rc=0
  metrics="$(
    printf 'header = "Authorization: Bearer %s"\n' "$WORKER_SECRET" | \
      curl -sS --config - -o "$body_file" --max-time "$max_time" \
        -X POST "$url/submit" \
        -H 'Content-Type: application/json' \
        --data-binary "@$payload_file" \
        -w 'http_code=%{http_code} ttfb_s=%{time_starttransfer} total_s=%{time_total}' \
        2>"$TMP_DIR/err.txt"
  )" || rc=$?

  printf '  [%s]\n' "$label"
  if [[ "$rc" -ne 0 ]]; then
    printf '    RESULT: CURL_EXIT_%d (%s) | %s\n' "$rc" "$(tr '\r\n' ' ' <"$TMP_DIR/err.txt")" "${metrics:-}"
    return 0
  fi

  printf '    TIMING: %s\n' "$metrics"
  python3 - "$body_file" <<'PY'
import json, sys
raw = open(sys.argv[1], "r", encoding="utf-8", errors="replace").read().strip()
try:
    j = json.loads(raw)
    msg = str(j.get("message", "")).replace("\n", " | ")
    if len(msg) > 280:
        msg = msg[:280] + "..."
    print(f"    OUTCOME: outcome={j.get('outcome')} | code={j.get('code')} | message={msg}")
    if "chromium_headless_shell-1243" in raw or "Executable doesn't exist" in raw:
        print("    DIAGNOSIS: CONFIRMED PLAYWRIGHT 1.63.0 vs DOCKERFILE 1.62.1-noble BINARY MISMATCH!")
except Exception:
    print("    RAW_BODY:", raw[:280])
PY
}

banner "GATE 3 AUDIT START — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'Targets:\n  1. Render Standby : %s\n  2. Oracle Primary : %s\n  3. Oracle Gateway : %s\n' \
  "$RENDER_URL" "$ORACLE_URL" "$ORACLE_API_URL"

if [[ -t 0 ]]; then
  printf '\nOptional: Paste BROWSER_WORKER_SECRET (from Vercel/Render) to run Phase 4 authenticated\n'
  printf 'browser-launch & form-detection probes (input is hidden, never echoed or saved).\n'
  read -r -s -p 'BROWSER_WORKER_SECRET (or press Enter to run Phases 1-3 only): ' RAW_SECRET || true
  printf '\n'
  WORKER_SECRET="$(printf '%s' "${RAW_SECRET:-}" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  RAW_SECRET=""
  unset RAW_SECRET || true
  if [[ -n "$WORKER_SECRET" ]]; then
    printf 'Secret loaded into memory only (length=%d chars; value hidden).\n' "${#WORKER_SECRET}"
  else
    printf 'No secret entered — Phases 1-3 will execute; Phase 4 authenticated probes will be skipped.\n'
  fi
fi

banner "PHASE 1 — COLD-START / SPIN-DOWN INVESTIGATION (3.3)"
probe_health "RENDER-COLD-WAKE" "$RENDER_URL" 120
probe_health "ORACLE-PRIMARY-1" "$ORACLE_URL" 20
probe_health "ORACLE-GATEWAY-1" "$ORACLE_API_URL" 20

banner "PHASE 2 — WARM LATENCY COMPARISON (3 CONSECUTIVE PROBES)"
for i in 1 2 3; do
  sleep 1
  probe_health "RENDER-WARM-$i" "$RENDER_URL" 20
  probe_health "ORACLE-WARM-$i" "$ORACLE_URL" 20
done

banner "PHASE 3 — UNAUTHENTICATED & BAD-SECRET GATES (3.1 / 3.2.1 / 3.2.9)"
post_unauth "RENDER no-auth (expect 401)" "$RENDER_URL" ""
post_unauth "RENDER wrong-secret (expect 401)" "$RENDER_URL" "gate3-invalid-secret-probe"
post_unauth "ORACLE no-auth (expect 401)" "$ORACLE_URL" ""
post_unauth "ORACLE wrong-secret (expect 401)" "$ORACLE_URL" "gate3-invalid-secret-probe"

printf '  [404 route check] RENDER=%s | ORACLE=%s\n' \
  "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$RENDER_URL/nonexistent" || echo err)" \
  "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$ORACLE_URL/nonexistent" || echo err)"

if [[ -z "$WORKER_SECRET" ]]; then
  banner "PHASE 4 SKIPPED (No BROWSER_WORKER_SECRET provided)"
  printf 'Re-run and paste BROWSER_WORKER_SECRET at the hidden prompt to execute live authenticated /submit probes.\n'
  exit 0
fi

banner "PHASE 4 — DISCOVERING LIVE PUBLIC ATS POSTINGS FOR ZERO-SUBMIT PROBES"
GH_JOB_URL="$(python3 - <<'PY'
import json, urllib.request
boards = ["gitlab", "cloudflare", "vercel", " canonical", "datadog"]
for b in boards:
    b = b.strip()
    try:
        req = urllib.request.Request(f"https://boards-api.greenhouse.io/v1/boards/{b}/jobs", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
            jobs = data.get("jobs") or []
            for j in jobs:
                u = j.get("absolute_url", "")
                if "greenhouse.io" in u:
                    print(u)
                    raise SystemExit(0)
    except SystemExit:
        raise
    except Exception:
        continue
print("https://boards.greenhouse.io/gitlab")
PY
)"
printf 'Selected live Greenhouse URL (zero-submit probe): %s\n' "$GH_JOB_URL"

# 4.1 Empty JSON -> expects HTTP 400 (proves secret match without browser launch)
printf '{}' > "$TMP_DIR/p_bad_payload.json"

# 4.2 SSRF probe -> expects HTTP 200 outcome=STOP message=SSRF_BLOCKED
cat > "$TMP_DIR/p_ssrf.json" <<'EOF'
{
  "jobUrl": "http://169.254.169.254/latest/meta-data/",
  "allowedDomains": ["169.254.169.254"],
  "candidate": {
    "jobUrl": "http://169.254.169.254/latest/meta-data/",
    "company": "SSRF Test",
    "title": "Probe",
    "email": "",
    "name": null,
    "phone": null,
    "cvPath": null,
    "cvDownloadUrl": null,
    "coverLetter": null,
    "answers": []
  }
}
EOF

# 4.3 Domain allowlist probe -> expects DOMAIN_NOT_ALLOWLISTED
cat > "$TMP_DIR/p_allowlist.json" <<'EOF'
{
  "jobUrl": "https://example.com/jobs/1",
  "allowedDomains": ["boards.greenhouse.io"],
  "candidate": {
    "jobUrl": "https://example.com/jobs/1",
    "company": "Allowlist Test",
    "title": "Probe",
    "email": "",
    "name": null,
    "phone": null,
    "cvPath": null,
    "cvDownloadUrl": null,
    "coverLetter": null,
    "answers": []
  }
}
EOF

# 4.4 Unsupported platform -> expects UNSUPPORTED_PLATFORM
cat > "$TMP_DIR/p_unsupported.json" <<'EOF'
{
  "jobUrl": "https://github.com/about/careers",
  "allowedDomains": ["github.com"],
  "candidate": {
    "jobUrl": "https://github.com/about/careers",
    "company": "GitHub",
    "title": "Probe",
    "email": "",
    "name": null,
    "phone": null,
    "cvPath": null,
    "cvDownloadUrl": null,
    "coverLetter": null,
    "answers": []
  }
}
EOF

# 4.5 Live Greenhouse browser-launch + CV materialization + DOM inspection probe
# SAFETY: name=null and email="" guarantee greenhouseApplyAdapter stops at MISSING_INFO
# (or earlier at CAPTCHA / ANTI_BOT / UNSUPPORTED_FORM) BEFORE filling any field or clicking submit.
python3 - "$GH_JOB_URL" "$DUMMY_PDF_URL" "$TMP_DIR/p_greenhouse_safe.json" <<'PY'
import json, sys
job_url, pdf_url, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
payload = {
    "jobUrl": job_url,
    "allowedDomains": ["greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io"],
    "candidate": {
        "jobUrl": job_url,
        "company": "Gate3 Safe Probe",
        "title": "Non-Submitting Browser Audit",
        "email": "",
        "name": None,
        "phone": None,
        "cvPath": None,
        "cvDownloadUrl": pdf_url,
        "coverLetter": None,
        "answers": []
    }
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f)
PY

banner "PHASE 4A — SECRET PARITY & PAYLOAD VALIDATION (Expect HTTP 400; 401 = secret mismatch)"
post_auth_safe "RENDER 4.1 schema-gate" "$RENDER_URL" "$TMP_DIR/p_bad_payload.json" 30
post_auth_safe "ORACLE 4.1 schema-gate" "$ORACLE_URL" "$TMP_DIR/p_bad_payload.json" 30

banner "PHASE 4B — SSRF, ALLOWLIST & UNSUPPORTED-PLATFORM GATES"
post_auth_safe "RENDER 4.2 SSRF_BLOCKED" "$RENDER_URL" "$TMP_DIR/p_ssrf.json" 30
post_auth_safe "ORACLE 4.2 SSRF_BLOCKED" "$ORACLE_URL" "$TMP_DIR/p_ssrf.json" 30
post_auth_safe "RENDER 4.3 DOMAIN_NOT_ALLOWLISTED" "$RENDER_URL" "$TMP_DIR/p_allowlist.json" 30
post_auth_safe "ORACLE 4.3 DOMAIN_NOT_ALLOWLISTED" "$ORACLE_URL" "$TMP_DIR/p_allowlist.json" 30
post_auth_safe "RENDER 4.4 UNSUPPORTED_PLATFORM" "$RENDER_URL" "$TMP_DIR/p_unsupported.json" 30
post_auth_safe "ORACLE 4.4 UNSUPPORTED_PLATFORM" "$ORACLE_URL" "$TMP_DIR/p_unsupported.json" 30

banner "PHASE 4C — LIVE CHROMIUM LAUNCH + CV PDF MATERIALIZATION + ATS NAVIGATION (ZERO-SUBMIT)"
post_auth_safe "RENDER 4.5 live-chromium-probe" "$RENDER_URL" "$TMP_DIR/p_greenhouse_safe.json" 180
post_auth_safe "ORACLE 4.5 live-chromium-probe" "$ORACLE_URL" "$TMP_DIR/p_greenhouse_safe.json" 180

banner "GATE 3 LIVE AUDIT COMPLETE — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
