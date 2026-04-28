#!/usr/bin/env bash
# probe-android-manifest.sh
# -----------------------------------------------------------------------------
# Reconcile client/public/downloads/manifest.json against:
#   1) The actual APK / AAB files on disk (presence, non-zero size, ZIP magic).
#   2) The public download URLs (HTTP 200, correct Content-Type, ZIP magic in
#      the first served bytes — proving Express is actually serving the binary
#      and not an HTML error page that some intermediate proxy rewrote on top
#      of an EACCES / 5xx response).
#
# Why this script exists:
#   The orchestrator (update-all.sh) used to declare "Update sequence finished"
#   even when the APK referenced by manifest.json had been silently removed
#   (rsync prune, accidental rm, container rebuild that wiped a volume, etc.).
#   The verify script trusted the proxy header and missed the EACCES case
#   where Express returned a 5xx that some intermediates rewrote to HTML —
#   so users got an "App not installed" error from Android Package Installer
#   while the deploy pipeline kept reporting green.
#
# This probe is the load-bearing check that closes that gap. It is invoked
# by update-all.sh as the FINAL step (after verify) and exits non-zero with
# a clear, actionable error message on any mismatch — so the operator sees
# the real problem before walking away from the terminal.
#
# Usage:
#   bash scripts/server/probe-android-manifest.sh                 # default flags
#   bash scripts/server/probe-android-manifest.sh --skip-public   # disk-only
#
# Environment overrides:
#   VEX_PUBLIC_URL    Base public URL (default: https://vixo.click)
#   VEX_DOWNLOADS_DIR Local downloads dir (default: <repo>/client/public/downloads)
#
# Exit codes:
#   0  → manifest, disk, and public URL all agree — APK is genuinely installable
#   1  → at least one mismatch (details printed inline)
#
# Recovery (printed automatically on failure):
#   bash scripts/server/refresh-android-binaries.sh
# -----------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DOWNLOADS_DIR="${VEX_DOWNLOADS_DIR:-${REPO_ROOT}/client/public/downloads}"
PUBLIC_URL="${VEX_PUBLIC_URL:-https://vixo.click}"
MANIFEST_PATH="${DOWNLOADS_DIR}/manifest.json"
EXPECTED_APK_MIME="application/vnd.android.package-archive"
SKIP_PUBLIC="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-public) SKIP_PUBLIC="true"; shift ;;
    -h|--help)
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

# Colours (graceful fallback when stdout isn't a TTY).
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_RESET=""
fi

PASS=0
FAIL=0
FAILURES=()

ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; PASS=$((PASS+1)); }
bad()   { printf '  %s✗%s %s\n' "$C_RED" "$C_RESET" "$*"; FAIL=$((FAIL+1)); FAILURES+=("$*"); }
info()  { printf '  %s·%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
header(){ printf '\n%s== %s ==%s\n' "$C_BOLD" "$*" "$C_RESET"; }

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    printf '%sERROR%s: node is required to parse manifest.json\n' "$C_RED" "$C_RESET" >&2
    exit 2
  fi
}

print_recovery() {
  printf '\n%s── How to recover ──%s\n' "$C_BOLD" "$C_RESET"
  printf '  The manifest, disk, and/or public URL disagree about the current\n'
  printf '  APK/AAB. The fix in every case is to re-download the binaries\n'
  printf '  from the GitHub Release CDN and rewrite the manifest atomically:\n\n'
  printf '    %sbash scripts/server/refresh-android-binaries.sh%s\n\n' "$C_BOLD" "$C_RESET"
  printf '  Then re-run this probe (or the full orchestrator):\n\n'
  printf '    bash scripts/server/probe-android-manifest.sh\n'
  printf '    # or\n'
  printf '    bash scripts/server/update-all.sh --skip-pull --skip-deploy\n\n'
  printf '  If refresh-android-binaries.sh itself fails, the GitHub Release\n'
  printf '  for the current package.json version probably has not been\n'
  printf '  published yet — check:\n'
  printf '    https://github.com/<owner>/<repo>/releases/tag/v<version>\n'
}

# -----------------------------------------------------------------------------
# 1) Manifest must exist and be valid JSON with the required fields.
# -----------------------------------------------------------------------------
header "1. manifest.json sanity"
require_node

if [ ! -f "$MANIFEST_PATH" ]; then
  bad "manifest.json not found at ${MANIFEST_PATH}"
  print_recovery
  exit 1
fi
ok "manifest.json present at ${MANIFEST_PATH}"

# Parse once via node — crash here means the file is corrupt JSON or missing
# the load-bearing keys, both of which are critical failures.
if ! MANIFEST_JSON="$(node -e '
  const m = require(process.argv[1]);
  for (const k of ["version", "apkFile", "aabFile"]) {
    if (typeof m[k] !== "string" || !m[k]) {
      console.error("missing or empty key: " + k);
      process.exit(3);
    }
  }
  // Print a stable shell-friendly key=value listing (no shell-quoting needed
  // because the values are always plain ASCII filenames / semver strings).
  console.log("VERSION=" + m.version);
  console.log("APK_FILE=" + m.apkFile);
  console.log("AAB_FILE=" + m.aabFile);
  console.log("APK_SIZE=" + (Number.isFinite(m.apkSize) ? m.apkSize : 0));
  console.log("AAB_SIZE=" + (Number.isFinite(m.aabSize) ? m.aabSize : 0));
' "$MANIFEST_PATH" 2>&1)"; then
  bad "manifest.json is invalid: ${MANIFEST_JSON}"
  print_recovery
  exit 1
fi

# Load the parsed values into shell variables.
eval "$MANIFEST_JSON"
ok "manifest declares version=${VERSION}, apk=${APK_FILE}, aab=${AAB_FILE}"

APK_PATH="${DOWNLOADS_DIR}/${APK_FILE}"
AAB_PATH="${DOWNLOADS_DIR}/${AAB_FILE}"

# -----------------------------------------------------------------------------
# 2) On-disk reconciliation — both files must exist with non-zero size and
#    valid ZIP magic. This catches the silent-rm / wiped-volume class of bug.
# -----------------------------------------------------------------------------
header "2. on-disk binaries match the manifest"

probe_local_binary() {
  local kind="$1" path="$2" expected_size="$3"
  if [ ! -f "$path" ]; then
    bad "${kind} missing on disk: manifest references ${path##*/} but the file is not in ${DOWNLOADS_DIR}"
    return
  fi
  local actual_size
  actual_size="$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path" 2>/dev/null || echo 0)"
  if [ "$actual_size" -le 0 ]; then
    bad "${kind} on disk is zero-byte: ${path}"
    return
  fi
  # Manifest size is informational — warn rather than fail when it drifts,
  # because a manifest written by an older version of refresh-android-binaries
  # might omit the field. The on-disk size > 0 check above is the load-bearing
  # one. Equality is still asserted so partial writes get caught loudly.
  if [ "$expected_size" -gt 0 ] && [ "$actual_size" -ne "$expected_size" ]; then
    bad "${kind} size mismatch: manifest says ${expected_size}, disk has ${actual_size}"
    return
  fi
  local magic_hex
  magic_hex="$(od -An -tx1 -N2 "$path" 2>/dev/null | tr -d ' \n')"
  if [ "$magic_hex" != "504b" ]; then
    bad "${kind} on disk has invalid ZIP magic (got 0x${magic_hex}, expected 0x504b/PK): ${path}"
    return
  fi
  ok "${kind} on disk OK — ${path##*/} (${actual_size} bytes, ZIP magic PK)"
}

probe_local_binary "APK" "$APK_PATH" "$APK_SIZE"
probe_local_binary "AAB" "$AAB_PATH" "$AAB_SIZE"

# -----------------------------------------------------------------------------
# 3) Public URL reconciliation — the production proxy must actually serve the
#    APK with the correct Content-Type, and the first bytes the client would
#    receive must be ZIP magic. This is what closes the EACCES → HTML-rewrite
#    silent failure mode that motivated this script in the first place.
#
#    The AAB is intentionally NOT probed via the public URL because the
#    Express layer blocks /downloads/*.aab with HTTP 404 (admin-only download
#    via /api/admin/downloads/aab) — see blockPublicAabDownload in server/.
# -----------------------------------------------------------------------------
if [ "$SKIP_PUBLIC" = "true" ]; then
  header "3. public URL probe (skipped via --skip-public)"
else
  header "3. public URL serves the APK end-to-end (${PUBLIC_URL})"

  if ! command -v curl >/dev/null 2>&1; then
    bad "curl is not installed — cannot probe public URL"
  else
    # 3a) manifest.json must be reachable and JSON.
    manifest_url="${PUBLIC_URL}/downloads/manifest.json"
    manifest_headers="$(curl -sS -L --max-time 15 -o /dev/null \
      -w 'STATUS=%{http_code}\nTYPE=%{content_type}\n' "$manifest_url" 2>&1)" || true
    manifest_status="$(printf '%s\n' "$manifest_headers" | awk -F= '/^STATUS=/{print $2}')"
    manifest_type="$(printf '%s\n' "$manifest_headers" | awk -F= '/^TYPE=/{print $2}' | awk '{print tolower($0)}')"
    if [ "$manifest_status" = "200" ] && printf '%s' "$manifest_type" | grep -q 'json'; then
      ok "manifest.json reachable at ${manifest_url} (HTTP 200, ${manifest_type})"
    else
      bad "manifest.json public probe failed: HTTP ${manifest_status:-???}, Content-Type=${manifest_type:-<none>} (URL: ${manifest_url})"
    fi

    # 3b) APK must be reachable, with the right MIME, with PK magic in the body.
    apk_url="${PUBLIC_URL}/downloads/${APK_FILE}"
    # HEAD via GET (-I issues HEAD which some CDNs serve from cache without
    # invoking Express; a real GET with -o/dev/null and -w gives us exactly
    # what a phone's browser would see). --max-time guards against hanging
    # on a misconfigured proxy that holds the connection open.
    apk_meta="$(curl -sS -L --max-time 30 -o /dev/null \
      -w 'STATUS=%{http_code}\nTYPE=%{content_type}\nLEN=%{size_download}\n' \
      -X GET -r 0-1 "$apk_url" 2>&1)" || true
    apk_status="$(printf '%s\n' "$apk_meta" | awk -F= '/^STATUS=/{print $2}')"
    apk_type="$(printf '%s\n' "$apk_meta" | awk -F= '/^TYPE=/{print $2}' | awk '{print tolower($0)}')"

    # Treat both 200 (full body) and 206 (partial — the -r 0-1 we asked for)
    # as success. Any other status — including 404, 403, 500, or a 200-with-
    # HTML-body that some intermediates synthesise — is a hard failure.
    if [ "$apk_status" != "200" ] && [ "$apk_status" != "206" ]; then
      bad "APK public probe failed: HTTP ${apk_status:-???} at ${apk_url}"
    elif ! printf '%s' "$apk_type" | grep -q "$EXPECTED_APK_MIME"; then
      # This is the load-bearing assertion: even if the HTTP status looks
      # green, an HTML-rewritten 200 body would have Content-Type text/html
      # and Android's package installer would reject the install with a
      # cryptic "There was a problem parsing the package" error.
      bad "APK Content-Type wrong: got '${apk_type:-<none>}', expected '${EXPECTED_APK_MIME}' (URL: ${apk_url})"
    else
      # Now actually fetch 2 bytes from the URL and confirm ZIP magic. This
      # catches the rare case where a proxy/CDN returns the right MIME but
      # the body is an empty 200 or some other non-APK content.
      magic_bytes="$(curl -sS -L --max-time 30 -r 0-1 "$apk_url" 2>/dev/null \
                       | od -An -tx1 -N2 | tr -d ' \n')"
      if [ "$magic_bytes" != "504b" ]; then
        bad "APK public body is not a ZIP (got first bytes 0x${magic_bytes:-empty}, expected 0x504b/PK) at ${apk_url}"
      else
        ok "APK reachable at ${apk_url} (HTTP ${apk_status}, ${apk_type}, ZIP magic PK)"
      fi
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Summary + exit
# -----------------------------------------------------------------------------
printf '\n%sSummary%s — passed: %d, failed: %d\n' "$C_BOLD" "$C_RESET" "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '%sFailed checks:%s\n' "$C_RED" "$C_RESET"
  for f in "${FAILURES[@]}"; do
    printf '  - %s\n' "$f"
  done
  print_recovery
  exit 1
fi
printf '%s✓ Manifest, disk, and public URL all agree — APK is installable.%s\n' "$C_GREEN" "$C_RESET"
exit 0
