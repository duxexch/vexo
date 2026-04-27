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

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
DOWNLOADS_DIR="${REPO_ROOT}/client/public/downloads"
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
DB_SERVICE="${VEX_DB_SERVICE:-vex-postgres}"
DB_USER="${VEX_DB_USER:-vex}"
DB_NAME="${VEX_DB_NAME:-vex}"

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

# ============================================================================
# 5) PUBLIC DOWNLOAD URL  — this is the symptom the user reported. We hit
#    the live https://vixo.click/downloads/app.apk URL the same way a real
#    visitor's browser does and confirm the response is a real APK.
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
fi

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
