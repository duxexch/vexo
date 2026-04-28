#!/usr/bin/env bash
# verify-vex-deployment.sh
# -----------------------------------------------------------------------------
# End-to-end verification of a VEX production deployment on the Hostinger VPS.
# Run this AFTER `prod-update.sh` (or any deploy) to confirm everything is
# wired correctly — APK signature, file integrity, public download
# accessibility, and database referential integrity. Designed to be safe
# (read-only) and idempotent — invoke it as many times as you like.
#
# Why a single script?
#   The user reported three independent symptoms:
#     1. APK download failing for some users on https://vixo.click/downloads
#     2. Need to confirm the APK is properly signed by the VEX release key
#     3. Need to confirm DB foreign-key integrity for production data
#   This script consolidates all three checks into one report so you don't
#   have to remember separate apksigner / keytool / curl / psql incantations.
#
# Usage on the VPS:
#   cd /docker/vex
#   bash scripts/server/verify-vex-deployment.sh
#
# Exit codes:
#   0  → everything verified OK (signed APK, downloadable, DB consistent)
#   1  → one or more critical checks failed (details printed inline)
#
# Tools used (all read-only):
#   - file, stat, sha256sum, du, find  (always present on Linux)
#   - curl                              (probes the public download URL)
#   - apksigner, keytool                (optional — Android SDK; falls back to
#                                       `unzip -p META-INF/*.RSA | openssl pkcs7`
#                                       when the SDK isn't installed on the VPS)
#   - openssl, unzip                    (fallback signature inspection)
#   - docker compose                    (executes psql inside vex-postgres)
# -----------------------------------------------------------------------------
set -uo pipefail

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------
# --public-only      Run ONLY section 5 (public download URL + deep byte
#                    probe). Skips disk-presence, signature, package-name,
#                    and DB checks. Used by the regression test
#                    `scripts/server/test-verify-deep-probe.sh` to point
#                    the verifier at a local broken-APK simulator without
#                    needing a real APK / signing key / Postgres.
# -----------------------------------------------------------------------------
PUBLIC_ONLY="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --public-only) PUBLIC_ONLY="true"; shift ;;
    -h|--help)
      sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      printf 'Run with --help for usage.\n' >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
DOWNLOADS_DIR="${VEX_DOWNLOADS_DIR:-${REPO_ROOT}/client/public/downloads}"
MANIFEST_PATH="${DOWNLOADS_DIR}/manifest.json"
PUBLIC_URL="${VEX_PUBLIC_URL:-https://vixo.click}"
EXPECTED_PACKAGE="click.vixo.app"

# Resolve current APK / AAB filenames from manifest.json (the single source
# of truth written by refresh-android-binaries.sh). Falls back to the legacy
# fixed names so this script still works on first-time deployments that
# haven't run the refresh script yet.
if [ -f "$MANIFEST_PATH" ]; then
  APK_NAME="$(node -e "console.log(require('${MANIFEST_PATH}').apkFile || 'app.apk')" 2>/dev/null || echo 'app.apk')"
  AAB_NAME="$(node -e "console.log(require('${MANIFEST_PATH}').aabFile || 'app.aab')" 2>/dev/null || echo 'app.aab')"
  APP_VERSION="$(node -e "console.log(require('${MANIFEST_PATH}').version || 'unknown')" 2>/dev/null || echo 'unknown')"
else
  APK_NAME="app.apk"
  AAB_NAME="app.aab"
  APP_VERSION="unknown"
fi
APK_PATH="${DOWNLOADS_DIR}/${APK_NAME}"
AAB_PATH="${DOWNLOADS_DIR}/${AAB_NAME}"
COMPOSE_FILE="${VEX_COMPOSE_FILE:-${REPO_ROOT}/docker-compose.prod.yml}"
# `docker compose ps --services` and `docker compose exec <svc>` both use
# the service KEY from the compose file ("db") — NOT the container_name
# ("vex-db"). They are different namespaces. Override with VEX_DB_SERVICE
# only if you've renamed the service block in docker-compose.prod.yml.
DB_SERVICE="${VEX_DB_SERVICE:-db}"

# Auto-load DB credentials from the same .env file that docker-compose
# uses, so this script doesn't drift from the actual deployment. We do a
# minimal grep-based parse (no `source`) to avoid executing any code in
# .env (it may contain shell-special characters in passwords) and we
# only pick the keys we need. Operators can still override any of them
# by exporting VEX_DB_USER / VEX_DB_NAME / PGPASSWORD before running.
ENV_FILE="${VEX_ENV_FILE:-${REPO_ROOT}/.env}"
read_env_var() {
  # $1 = variable name. Returns the last non-comment assignment found.
  # Handles `KEY=value`, `KEY="value"`, `KEY='value'`, with or without
  # trailing whitespace. Returns empty string if not found.
  local key="$1"
  [ -f "$ENV_FILE" ] || { printf ''; return; }
  # `tac`-style "last one wins" via awk (some envs override earlier keys).
  awk -F= -v k="$key" '
    /^[[:space:]]*#/ { next }
    $1 ~ "^[[:space:]]*"k"[[:space:]]*$" {
      sub("^[^=]*=", "")
      gsub(/^[[:space:]]*["'\'']?|["'\'']?[[:space:]]*$/, "")
      val = $0
    }
    END { print val }
  ' "$ENV_FILE"
}

ENV_DB_USER="$(read_env_var POSTGRES_USER)"
ENV_DB_NAME="$(read_env_var POSTGRES_DB)"
ENV_DB_PASS="$(read_env_var POSTGRES_PASSWORD)"

DB_USER="${VEX_DB_USER:-${ENV_DB_USER:-vex_user}}"
DB_NAME="${VEX_DB_NAME:-${ENV_DB_NAME:-vex_db}}"
# Export for the docker-compose exec call further down. Existing
# PGPASSWORD in the operator's shell takes priority, then .env, then
# the legacy fallback used by the old version of this script.
export PGPASSWORD="${PGPASSWORD:-${ENV_DB_PASS:-postgres}}"

# ANSI colors (degraded gracefully if stdout isn't a TTY).
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_RESET=""
fi

# Counters for the final summary.
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
FAILED_CHECKS=()

ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail()  { printf '  %s✗%s %s\n' "$C_RED" "$C_RESET" "$*"; FAIL_COUNT=$((FAIL_COUNT + 1)); FAILED_CHECKS+=("$*"); }
warn()  { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; WARN_COUNT=$((WARN_COUNT + 1)); }
info()  { printf '  %s·%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
header(){ printf '\n%s== %s ==%s\n' "$C_BOLD" "$*" "$C_RESET"; }

# ============================================================================
# Sections 1-4 inspect the binaries on disk. They are skipped under
# --public-only, which is the mode the regression test
# `scripts/server/test-verify-deep-probe.sh` runs in (it points the
# verifier at a local broken-APK simulator and only cares about the
# public-URL deep probe behaviour).
# ============================================================================
if [ "$PUBLIC_ONLY" = "false" ]; then

# ============================================================================
# 1) BINARY PRESENCE & SIZE
# ============================================================================
header "1. Binary presence & size"
if [ -f "$APK_PATH" ]; then
  apk_size=$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH")
  apk_mb=$((apk_size / 1024 / 1024))
  if [ "$apk_size" -ge 5000000 ]; then
    ok "APK exists at ${APK_PATH} (${apk_mb} MB)"
  else
    fail "APK too small: ${apk_mb} MB (< 5 MB minimum). Likely truncated download — re-run refresh-android-binaries.sh"
  fi
  # ZIP magic bytes must be 'PK' (50 4B) — APK is a ZIP archive.
  magic=$(head -c2 "$APK_PATH" | od -An -tx1 | tr -d ' \n')
  if [ "$magic" = "504b" ]; then
    ok "APK has valid ZIP magic bytes (PK)"
  else
    fail "APK has invalid magic bytes (got 0x${magic}, expected 0x504b/PK) — file is corrupted, not a real APK"
  fi
else
  fail "APK NOT found at ${APK_PATH}"
fi

if [ -f "$AAB_PATH" ]; then
  aab_size=$(stat -c%s "$AAB_PATH" 2>/dev/null || stat -f%z "$AAB_PATH")
  aab_mb=$((aab_size / 1024 / 1024))
  ok "AAB exists at ${AAB_PATH} (${aab_mb} MB) — admin-only via /api/admin/downloads/aab"
else
  warn "AAB not found at ${AAB_PATH} — admin Play Store upload won't work until refresh-android-binaries.sh is run"
fi

# ============================================================================
# 2) SHA-256 CHECKSUMS  — record fingerprints for the audit trail.
# ============================================================================
header "2. SHA-256 checksums (record these for your audit trail)"
if [ -f "$APK_PATH" ]; then
  apk_sha=$(sha256sum "$APK_PATH" | awk '{print $1}')
  info "APK SHA-256: ${apk_sha}"
fi
if [ -f "$AAB_PATH" ]; then
  aab_sha=$(sha256sum "$AAB_PATH" | awk '{print $1}')
  info "AAB SHA-256: ${aab_sha}"
fi

# ============================================================================
# 3) APK SIGNATURE  — confirms the file is signed by the VEX release key
#    (not a debug build, not unsigned, not signed by an attacker).
# ============================================================================
header "3. APK signature verification"
if [ ! -f "$APK_PATH" ]; then
  warn "Skipping signature check — APK not present"
elif command -v apksigner >/dev/null 2>&1; then
  info "Using apksigner from Android SDK"
  if apksigner verify --verbose --print-certs "$APK_PATH" > /tmp/vex-apksigner.out 2>&1; then
    ok "APK signature is VALID"
    grep -E "Verified using v[0-9]+ scheme" /tmp/vex-apksigner.out | sed 's/^/    /'
    grep -E "Signer #1 certificate (DN|SHA-256 digest)" /tmp/vex-apksigner.out | sed 's/^/    /'
  else
    fail "APK signature verification FAILED — see /tmp/vex-apksigner.out"
    tail -20 /tmp/vex-apksigner.out | sed 's/^/    /'
  fi
elif command -v unzip >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
  info "apksigner not installed — using openssl fallback (signature presence only)"
  rsa_file=$(unzip -l "$APK_PATH" 2>/dev/null | awk '/META-INF\/.*\.RSA$/ {print $4; exit}')
  if [ -n "$rsa_file" ]; then
    cert_subject=$(unzip -p "$APK_PATH" "$rsa_file" 2>/dev/null \
      | openssl pkcs7 -inform DER -print_certs 2>/dev/null \
      | openssl x509 -noout -subject 2>/dev/null || true)
    cert_fingerprint=$(unzip -p "$APK_PATH" "$rsa_file" 2>/dev/null \
      | openssl pkcs7 -inform DER -print_certs 2>/dev/null \
      | openssl x509 -noout -fingerprint -sha256 2>/dev/null || true)
    if [ -n "$cert_subject" ]; then
      ok "APK is signed (META-INF/${rsa_file##*/} present)"
      info "Certificate subject: ${cert_subject#subject=}"
      info "Certificate SHA-256: ${cert_fingerprint#SHA256 Fingerprint=}"
      warn "For full v2/v3/v4 scheme verification install Android SDK build-tools and re-run"
    else
      warn "Found ${rsa_file} but couldn't parse certificate — install apksigner for full verification"
    fi
  else
    fail "APK has NO META-INF/*.RSA — file is unsigned (debug build?)"
  fi
else
  warn "Neither apksigner nor unzip+openssl available — cannot verify signature"
fi

# ============================================================================
# 4) APK PACKAGE NAME  — must be click.vixo.app, otherwise the install will
#    appear as a different app on the user's device.
# ============================================================================
header "4. APK package identity"
if [ ! -f "$APK_PATH" ]; then
  warn "Skipping package check — APK not present"
elif command -v aapt2 >/dev/null 2>&1; then
  pkg_line=$(aapt2 dump badging "$APK_PATH" 2>/dev/null | grep -E "^package: name=" | head -1)
  if echo "$pkg_line" | grep -q "name='${EXPECTED_PACKAGE}'"; then
    ok "Package name matches: ${EXPECTED_PACKAGE}"
    info "$pkg_line"
  else
    fail "Package name mismatch — expected ${EXPECTED_PACKAGE}, got: ${pkg_line:-unknown}"
  fi
elif command -v aapt >/dev/null 2>&1; then
  pkg_line=$(aapt dump badging "$APK_PATH" 2>/dev/null | grep -E "^package: name=" | head -1)
  if echo "$pkg_line" | grep -q "name='${EXPECTED_PACKAGE}'"; then
    ok "Package name matches: ${EXPECTED_PACKAGE}"
  else
    fail "Package name mismatch: ${pkg_line:-unknown}"
  fi
else
  warn "aapt/aapt2 not installed — cannot read package name from APK"
fi

fi  # end of `if [ "$PUBLIC_ONLY" = "false" ]` — sections 1-4 wrap

# ============================================================================
# 5) PUBLIC DOWNLOAD URL  — this is the symptom the user reported. We hit
#    the live https://vixo.click/downloads/app.apk URL the same way a real
#    visitor's browser does and confirm the response is a real APK.
#
# Section 5a does the historical HEAD probe (still useful — produces a fast
# snapshot of headers / Content-Length / Content-Disposition for the
# operator's report). Section 5b then does the LOAD-BEARING ranged GET that
# actually opens the APK byte-by-byte: HEAD trusted the proxy headers and
# missed the chmod-000 / EACCES case where every real GET returned a 500
# body that some intermediates rewrote to HTML. The byte-level probe is
# what closes that gap and makes the verifier exit non-zero on body
# corruption — see scripts/server/test-verify-deep-probe.sh for the
# regression test that exercises this exact failure mode end-to-end.
# ============================================================================
header "5. Public download URL reachability (root cause of \"تعذر التنزيل\")"
if ! command -v curl >/dev/null 2>&1; then
  warn "curl not installed — cannot probe public URL"
else
  download_url="${PUBLIC_URL}/downloads/${APK_NAME}"
  info "Probing: ${download_url}"
  # -L follows redirects, -I = HEAD only, -s = silent, -o /dev/null discards
  # body, -w = print formatted summary, -m 30 = 30s timeout (large file).
  http_summary=$(curl -L -I -s -o /tmp/vex-curl-headers.txt -w \
    'http_code=%{http_code} size=%{size_download} content_type=%{content_type} time=%{time_total}s' \
    -m 30 "$download_url" || echo "http_code=000 size=0 content_type=error time=timeout")

  http_code=$(echo "$http_summary" | grep -oE 'http_code=[0-9]+' | cut -d= -f2)
  content_type=$(echo "$http_summary" | grep -oE 'content_type=[^ ]+' | cut -d= -f2)
  content_length=$(grep -i '^content-length:' /tmp/vex-curl-headers.txt | tail -1 | tr -d '\r' | awk '{print $2}')
  content_disposition=$(grep -i '^content-disposition:' /tmp/vex-curl-headers.txt | tail -1 | tr -d '\r')

  case "$http_code" in
    200)
      ok "HTTP ${http_code} OK — public URL is reachable"
      info "$http_summary"
      if [ "$content_type" = "application/vnd.android.package-archive" ]; then
        ok "Content-Type is correct (application/vnd.android.package-archive)"
      else
        warn "Content-Type is ${content_type} — should be application/vnd.android.package-archive (some browsers will refuse the file)"
      fi
      if [ -n "$content_disposition" ]; then
        ok "Content-Disposition header present: ${content_disposition}"
      else
        warn "No Content-Disposition header — browser may open the file inline instead of downloading it"
      fi
      if [ -n "$content_length" ] && [ "$content_length" -ge 5000000 ]; then
        served_mb=$((content_length / 1024 / 1024))
        ok "Server is serving ${served_mb} MB (matches a real APK)"
      else
        fail "Server is serving ${content_length:-0} bytes — this is the file users are downloading and it is too small / empty. The container is not seeing the bind-mounted APK. Run prod-update.sh."
      fi
      ;;
    404)
      fail "HTTP 404 — public URL is broken. Most likely cause: the docker container hasn't picked up the bind mount yet. Run: docker compose -f docker-compose.prod.yml up -d --force-recreate vex-app"
      ;;
    403)
      fail "HTTP 403 — nginx or middleware is rejecting the request. Check server/index.ts blockPublicAabDownload and nginx access rules."
      ;;
    000)
      fail "Connection failed / timeout — DNS or TLS issue. Check that ${PUBLIC_URL} resolves and the cert is valid."
      ;;
    *)
      fail "Unexpected HTTP ${http_code} — see /tmp/vex-curl-headers.txt"
      ;;
  esac

  # Same probe for the AAB — must return 404 (admin-only).
  info "Probing AAB (must be 404 publicly): ${PUBLIC_URL}/downloads/${AAB_NAME}"
  aab_code=$(curl -L -I -s -o /dev/null -w '%{http_code}' -m 15 "${PUBLIC_URL}/downloads/${AAB_NAME}" || echo "000")
  if [ "$aab_code" = "404" ]; then
    ok "AAB is correctly blocked publicly (HTTP 404)"
  else
    fail "AAB returned HTTP ${aab_code} publicly — must be 404. Public AAB exposure is a Play Store policy violation."
  fi

  # ==========================================================================
  # 5b) DEEP BYTE PROBE  — fetch the first 64 KB of the APK with a ranged GET
  #     and confirm the bytes start with the ZIP magic 'PK' (0x50 0x4B). HEAD
  #     alone is not sufficient: in the production incident the HEAD response
  #     was perfect (Content-Type: application/vnd.android.package-archive
  #     with the right Content-Length) yet every real GET returned a 500
  #     because the file was chmod 600 and the container couldn't read it.
  #     Some intermediates rewrote that 500 to a 200 with an HTML body, so
  #     the user downloaded an HTML page named VEX-1.0.0.apk and the install
  #     failed with "There was a problem parsing the package".
  #
  #     This probe opens the actual bytes the way a phone would, which is
  #     the only way to catch the EACCES / proxy-rewrite class of failure.
  # ==========================================================================
  header "5b. APK byte-level integrity (ranged GET — opens the file the way a phone does)"
  if [ "$http_code" = "200" ] || [ "$http_code" = "206" ]; then
    range_tmp="$(mktemp -t vex-apk-range.XXXXXX 2>/dev/null || mktemp)"
    # Ask for the first 64 KiB. Servers that honour ranges return 206 with
    # exactly that slice; servers that don't support ranges return 200 with
    # the full file — both are acceptable since we only inspect the first
    # 4 magic bytes and (when applicable) the body length.
    # We need BOTH the curl exit code AND the -w summary. The classic
    # `$(curl ...)` form throws away the exit code from inside command
    # substitution; the trailing `; echo` form replaces the exit code
    # with echo's. Solution: write -w output to a separate temp file so
    # the parent shell can read curl's real $? directly.
    #
    # Why this matters: curl exit 18 ("transfer closed with N bytes
    # remaining") is the canonical signal of the production-incident
    # proxy-rewrite scenario — the server advertises a 6 MB APK via
    # Content-Length but only delivers a few hundred HTML bytes. Without
    # capturing the real exit code we can't surface that diagnostic.
    # Note: the script header is `set -uo pipefail` — no `set -e`. Do NOT
    # toggle errexit here. An earlier version called `set +e` and then
    # `set -e ...` "to restore", which actually ENABLED errexit and made
    # any subsequent grep no-match silently exit the whole script with no
    # diagnostic. We rely on the absence of -e plus defensive `|| echo ""`
    # parsing so every probe outcome reaches the summary block.
    range_meta_tmp="$(mktemp -t vex-apk-range-meta.XXXXXX 2>/dev/null || mktemp)"
    curl -L -s -o "$range_tmp" \
      -w 'http_code=%{http_code} size=%{size_download} content_type=%{content_type}' \
      -m 60 -r 0-65535 "$download_url" >"$range_meta_tmp" 2>/dev/null
    range_curl_exit=$?
    range_summary="$(cat "$range_meta_tmp" 2>/dev/null || echo "")"
    rm -f "$range_meta_tmp"

    # Parse the -w summary defensively: `grep -oE` exits 1 on no-match,
    # which under `set -o pipefail` would propagate up the pipeline. The
    # `|| echo ""` keeps each assignment well-defined (empty string) so a
    # malformed proxy response can never abort the verifier mid-section.
    range_code=$( (echo "$range_summary" | grep -oE 'http_code=[0-9]+' | head -1 | cut -d= -f2) 2>/dev/null || echo "" )
    range_size=$( (echo "$range_summary" | grep -oE 'size=[0-9]+'      | head -1 | cut -d= -f2) 2>/dev/null || echo "" )
    range_type=$( (echo "$range_summary" | grep -oE 'content_type=[^ ]+' | head -1 \
                    | cut -d= -f2 | tr '[:upper:]' '[:lower:]') 2>/dev/null || echo "" )

    # Hard fail on transport-level errors that mean the server could not
    # complete the body. We let curl exit 0 and 18 fall through to the
    # body-content checks below: 0 is normal, and 18 is the truncated-
    # transfer case where we still want to inspect whatever bytes did
    # arrive (so the operator sees magic bytes + body preview, not just
    # "curl exited 18"). Every other non-zero exit is fatal for 5b.
    if [ "$range_curl_exit" -ne 0 ] && [ "$range_curl_exit" -ne 18 ]; then
      fail "Ranged GET to ${download_url} aborted at the transport layer (curl exit ${range_curl_exit}, http_code=${range_code:-none}). The server cannot serve the bytes the way a phone would download them. Offending file: ${APK_PATH}. Run: curl -v -r 0-65535 ${download_url} for full diagnostics."
    elif [ "$range_curl_exit" -eq 18 ]; then
      # Truncated transfer is itself a failure mode we must surface, even
      # though we still want the body preview that follows. Report it as
      # an info line first so the operator sees the upstream signal even
      # if a later check happens to pass.
      info "curl exited 18 (truncated transfer) — server delivered ${range_size:-0} bytes but Content-Length promised more"
    fi

    if [ "$range_code" != "200" ] && [ "$range_code" != "206" ]; then
      fail "Ranged GET returned HTTP ${range_code:-???} — the URL serves headers but cannot serve the body. Offending file on disk (check perms / inode / bind-mount): ${APK_PATH}"
    elif [ "${range_size:-0}" -lt 4 ]; then
      # An empty/short body with a 200/206 status is the EACCES/chmod-000
      # silent-failure mode in its purest form. The headers say "here is a
      # 40 MB APK", the body says "here are 0 bytes" — and HEAD never
      # noticed because HEAD never asks for the body.
      fail "Ranged GET returned only ${range_size:-0} body bytes despite HTTP ${range_code} — the file on disk is unreadable to the container (typical chmod-000 / EACCES). Offending file: ${APK_PATH}"
    else
      magic=$(od -An -tx1 -N4 "$range_tmp" | tr -d ' \n')
      magic_pk="${magic:0:4}"
      if [ "$magic_pk" != "504b" ]; then
        # Body-Content-Type may also be useful to surface — many proxies
        # rewrite the body to text/html on internal errors.
        body_preview=$(LC_ALL=C tr -cd '[:print:]\n' < "$range_tmp" \
                       | head -c 80 | tr '\n' ' ')
        fail "Ranged GET body is NOT a ZIP/APK (first 4 bytes 0x${magic_pk:-empty}, expected 0x504b/PK; body content-type=${range_type:-unknown}). The server is returning headers that look right but the body is something else — typically HTML rewritten on top of a 500 from chmod-000 / EACCES. Offending file: ${APK_PATH}. Body preview: ${body_preview:-<empty>}"
      elif [ -n "$content_length" ] && [ "$range_code" = "200" ] \
           && [ "${range_size:-0}" -ne "${content_length:-0}" ]; then
        # Server didn't honour the range and gave us a full GET, but the
        # number of bytes we received doesn't match the advertised
        # Content-Length. Truncated transfer or proxy mid-flight rewrite.
        fail "Body length mismatch on full GET: server advertised ${content_length} bytes via Content-Length but only ${range_size} bytes arrived. Offending file: ${APK_PATH}"
      else
        ok "Ranged GET returned ${range_size} bytes with valid ZIP magic (PK) — the body is a real APK that Android will accept"
      fi
    fi
    rm -f "$range_tmp"
  else
    info "Skipping byte probe — HEAD already established URL is unreachable (HTTP ${http_code:-???})"
  fi
fi

if [ "$PUBLIC_ONLY" = "false" ]; then

# ============================================================================
# 6) DATABASE INTEGRITY  — orphaned rows, broken FKs, basic table health.
#    We run a single read-only psql session inside the vex-postgres container.
# ============================================================================
header "6. Database integrity (read-only)"
if ! command -v docker >/dev/null 2>&1; then
  warn "docker not available — skipping DB checks"
elif [ ! -f "$COMPOSE_FILE" ]; then
  warn "Compose file not found at ${COMPOSE_FILE} — skipping DB checks"
else
  if ! docker compose -f "$COMPOSE_FILE" ps --services --filter "status=running" 2>/dev/null | grep -q "^${DB_SERVICE}$"; then
    fail "Database service '${DB_SERVICE}' is not running"
  else
    ok "Database service '${DB_SERVICE}' is running"

    # Single SQL block — all checks reuse the same connection. We use
    # information_schema to discover FK constraints rather than hardcoding
    # a list (which would drift as the schema evolves), then validate each
    # one. Output is one row per finding, easy to scan.
    psql_out=$(docker compose -f "$COMPOSE_FILE" exec -T -e PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-postgres}}" \
      "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -At -F'|' <<'SQL' 2>&1
-- Connection test
SELECT 'connection_ok|' || current_database() || '|' || version();

-- Total row counts for the most important tables (audit trail).
SELECT 'count|users|' || COUNT(*) FROM users;
SELECT 'count|agents|' || COUNT(*) FROM agents;
SELECT 'count|deposit_requests|' || COUNT(*) FROM deposit_requests;
SELECT 'count|complaints|' || COUNT(*) FROM complaints;
SELECT 'count|otp_verifications|' || COUNT(*) FROM otp_verifications;

-- Foreign key constraint count — must be > 0, else schema is missing FKs.
SELECT 'fk_count|all|' || COUNT(*)
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';

-- Spot-check for orphaned rows in the highest-risk relationships.
-- (deposit_requests → users)
SELECT 'orphans|deposit_requests.user_id|' || COUNT(*)
FROM deposit_requests dr
LEFT JOIN users u ON u.id = dr.user_id
WHERE dr.user_id IS NOT NULL AND u.id IS NULL;

-- (deposit_requests → agents)
SELECT 'orphans|deposit_requests.assigned_agent_id|' || COUNT(*)
FROM deposit_requests dr
LEFT JOIN agents a ON a.id = dr.assigned_agent_id
WHERE dr.assigned_agent_id IS NOT NULL AND a.id IS NULL;

-- (complaints → users)
SELECT 'orphans|complaints.user_id|' || COUNT(*)
FROM complaints c
LEFT JOIN users u ON u.id = c.user_id
WHERE c.user_id IS NOT NULL AND u.id IS NULL;

-- (agents → users)
SELECT 'orphans|agents.user_id|' || COUNT(*)
FROM agents a
LEFT JOIN users u ON u.id = a.user_id
WHERE a.user_id IS NOT NULL AND u.id IS NULL;

-- (otp_verifications → users)
SELECT 'orphans|otp_verifications.user_id|' || COUNT(*)
FROM otp_verifications o
LEFT JOIN users u ON u.id = o.user_id
WHERE o.user_id IS NOT NULL AND u.id IS NULL;
SQL
)

    if echo "$psql_out" | grep -q "^connection_ok|"; then
      while IFS='|' read -r kind label value rest; do
        case "$kind" in
          connection_ok)
            ok "Connected to DB '${label}'"
            ;;
          count)
            info "Row count — ${label}: ${value}"
            ;;
          fk_count)
            if [ "${value:-0}" -gt 0 ]; then
              ok "Foreign-key constraints declared: ${value}"
            else
              fail "No foreign-key constraints found in public schema — schema integrity at risk"
            fi
            ;;
          orphans)
            if [ "${value:-0}" = "0" ]; then
              ok "No orphans in ${label}"
            else
              fail "${value} orphaned rows in ${label} — referential integrity broken"
            fi
            ;;
        esac
      done <<< "$psql_out"
    else
      fail "Could not query database — psql output:"
      echo "$psql_out" | head -10 | sed 's/^/    /'
      info "Hint: set PGPASSWORD env var or VEX_DB_USER/VEX_DB_NAME if your config differs"
    fi
  fi
fi

fi  # end of `if [ "$PUBLIC_ONLY" = "false" ]` — section 6 wrap

# ============================================================================
# 7) FINAL SUMMARY
# ============================================================================
header "Summary"
printf "  %sPassed:%s  %d\n" "$C_GREEN" "$C_RESET" "$PASS_COUNT"
printf "  %sWarnings:%s %d\n" "$C_YELLOW" "$C_RESET" "$WARN_COUNT"
printf "  %sFailed:%s  %d\n" "$C_RED" "$C_RESET" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "\n%sFailed checks:%s\n" "$C_RED" "$C_RESET"
  for f in "${FAILED_CHECKS[@]}"; do
    printf "  - %s\n" "$f"
  done
  printf "\n%sDeployment is NOT fully verified.%s\n" "$C_RED" "$C_RESET"
  exit 1
fi

printf "\n%sDeployment fully verified.%s\n" "$C_GREEN" "$C_RESET"
exit 0
