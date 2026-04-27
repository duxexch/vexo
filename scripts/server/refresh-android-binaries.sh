#!/usr/bin/env bash
# refresh-android-binaries.sh
# -----------------------------------------------------------------------------
# Pulls the latest signed Android binaries (APK + AAB) from the GitHub
# Releases CDN and atomically swaps them into client/public/downloads/ on
# the Hostinger VPS, naming each file with the current app version
# (e.g. VEX-1.0.0.apk) so the user-facing download filename is always
# branded + versioned. Designed to be run after `git pull` (or via cron)
# so the public download links on vixo.click always point at the freshest
# build produced by the GitHub Actions pipeline.
#
# How the version becomes the filename
# ------------------------------------
# The CI pipeline always publishes its artifacts under fixed names
# (`VEX-official-release.apk` / `.aab`) on the GitHub Release CDN, because
# the workflow doesn't know what tag-name to use ahead of time. THIS script
# reads `package.json -> version` (the SINGLE source of truth for the app
# version) and renames the downloaded artifact to `VEX-<version>.apk` /
# `.aab` on the VPS filesystem. It then writes a `manifest.json` next to
# the binaries that records:
#     { version, apkFile, apkSize, apkSha256, aabFile, aabSize, aabSha256,
#       releasedAt }
# which the public download page (`/downloads/index.html`), the in-app
# install screen (`install-app.tsx`), the `/api/health` release endpoint,
# and the admin-only AAB endpoint all read at runtime to discover the
# current filenames. Bump `package.json -> version`, re-run this script,
# and EVERY surface across the platform updates without any code edit.
#
# Why this script (and not git pull alone)?
#   The APK/AAB binaries are NOT committed to the repo — they are
#   published to GitHub Releases by .github/workflows/android-build.yml.
#   Storing 80+ MB binaries in git on every build would bloat the repo
#   and cause LFS / merge conflicts. The Release CDN is the canonical
#   distribution channel; this script bridges it to the web server.
#
# Usage on the VPS:
#   cd /var/www/vixo.click          # or wherever your repo is checked out
#   bash scripts/server/refresh-android-binaries.sh
#
# Optional cron entry (every 30 minutes):
#   */30 * * * * cd /var/www/vixo.click && bash scripts/server/refresh-android-binaries.sh >> /var/log/vixo-android-refresh.log 2>&1
# -----------------------------------------------------------------------------
set -euo pipefail

REPO="${VEX_REPO:-duxexch/vexo}"
TAG="${VEX_RELEASE_TAG:-latest-android}"
DEST_DIR="${VEX_DEST_DIR:-client/public/downloads}"
MIN_BYTES="${VEX_MIN_BYTES:-1000000}"   # 1 MB — anything smaller is broken

# -----------------------------------------------------------------------------
# Resolve the app version. We deliberately read package.json with a tiny
# inline node one-liner instead of `jq` (which is not always installed on
# Hostinger boxes) or a regex (which would silently break on a
# multi-line `"version"` field). If VEX_APP_VERSION is set in the env it
# overrides everything — useful for emergency rollback to an older build.
# -----------------------------------------------------------------------------
APP_VERSION="${VEX_APP_VERSION:-}"
if [ -z "$APP_VERSION" ]; then
  if [ ! -f "package.json" ]; then
    printf 'ERROR: package.json not found in %s — run this script from the project root.\n' "$(pwd)" >&2
    exit 1
  fi
  APP_VERSION="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || true)"
fi
if [ -z "$APP_VERSION" ]; then
  printf 'ERROR: could not determine app version from package.json or VEX_APP_VERSION.\n' >&2
  exit 1
fi

# Source URLs — CI always publishes under these fixed names on the CDN.
BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
APK_URL="${BASE_URL}/VEX-official-release.apk"
AAB_URL="${BASE_URL}/VEX-official-release.aab"

# Destination filenames — VEX-branded + versioned, written to the public
# downloads dir. These names are exactly what the user sees in their
# browser's "Save as" dialog and what manifest.json publishes to the
# frontend.
APK_DEST_NAME="VEX-${APP_VERSION}.apk"
AAB_DEST_NAME="VEX-${APP_VERSION}.aab"

mkdir -p "${DEST_DIR}"

log()  { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

log "App version (from package.json): ${APP_VERSION}"
log "Destination filenames:           ${APK_DEST_NAME} / ${AAB_DEST_NAME}"

# -----------------------------------------------------------------------------
# Stale-binary cleanup is performed AFTER the new binaries + manifest have
# been successfully written, NOT before. This is critical: wiping first
# would create a multi-second window where /downloads/<old-VEX-X.Y.Z>.apk
# returns 404, and if either curl call subsequently failed (network blip,
# CDN hiccup), `set -e` would abort and leave the public download dir
# completely empty until the operator manually re-ran the script. By
# downloading first and only purging stale files at the end, the previous
# release stays serveable throughout the refresh window.
#
# `prune_stale_binaries` removes every `.apk`/`.aab` in the target dir
# whose basename is NOT one of the freshly-published filenames (passed
# explicitly so legacy `app.{apk,aab}`, `VEX-official-release.{apk,aab}`,
# and previous-version `VEX-X.Y.Z.{apk,aab}` are all swept away in one
# atomic post-download step).
# -----------------------------------------------------------------------------
prune_stale_binaries() {
  local target_dir="$1"
  local keep_apk="$2"
  local keep_aab="$3"
  [ -d "$target_dir" ] || return 0

  local removed=0
  while IFS= read -r -d '' old; do
    local base
    base="$(basename "$old")"
    if [ "$base" = "$keep_apk" ] || [ "$base" = "$keep_aab" ]; then
      continue
    fi
    rm -f "$old"
    log "  Removed stale binary: ${old}"
    removed=$((removed + 1))
  done < <(find "$target_dir" -maxdepth 1 -type f \
              \( -iname '*.apk' -o -iname '*.aab' \) -print0)

  if [ "$removed" -gt 0 ]; then
    log "Pruned ${removed} stale binary file(s) from ${target_dir}"
  else
    log "No stale binaries to prune in ${target_dir}"
  fi
}

# -----------------------------------------------------------------------------
# Download a single asset to a temp file, validate it, then atomically
# move it into the destination directory. Validation rules:
#   1) HTTP status must be 200 (curl --fail).
#   2) Final file size must be >= MIN_BYTES.
#   3) First bytes must NOT look like an HTML error page or LFS pointer.
#   4) ZIP magic bytes (PK / 0x504b) must be present.
# -----------------------------------------------------------------------------
fetch_asset() {
  local url="$1"
  local final="$2"
  local tmp
  tmp="$(mktemp -p "${DEST_DIR}" ".$(basename "$final").XXXXXX.tmp")"
  trap 'rm -f "$tmp"' RETURN

  log "Downloading ${url}"
  if ! curl --fail --location --silent --show-error \
            --retry 3 --retry-delay 2 --connect-timeout 15 \
            --output "$tmp" "$url"; then
    fail "curl failed for ${url}"
  fi

  local size
  size="$(stat -c%s "$tmp" 2>/dev/null || stat -f%z "$tmp")"
  if [ "${size}" -lt "${MIN_BYTES}" ]; then
    fail "Downloaded file is too small (${size} bytes < ${MIN_BYTES}). URL: ${url}"
  fi

  # Reject HTML / LFS-pointer responses. Pipe through tr to drop NULs so
  # bash does not warn about binary data inside command substitution.
  if head -c 200 "$tmp" | LC_ALL=C tr -d '\0' \
       | grep -q -E '<html|<!DOCTYPE|version https://git-lfs\.'; then
    fail "Downloaded file looks like HTML/LFS-pointer, not a binary. URL: ${url}"
  fi

  # APK/AAB are ZIP-based — first two bytes must be "PK" (0x50 0x4B).
  # Read as hex via od so binary NULs never enter a shell variable.
  local magic_hex
  magic_hex="$(od -An -tx1 -N2 "$tmp" | tr -d ' \n')"
  if [ "$magic_hex" != "504b" ]; then
    fail "Downloaded file is not a ZIP/APK/AAB (magic=0x${magic_hex}). URL: ${url}"
  fi

  mv -f "$tmp" "$final"
  trap - RETURN
  log "  Saved → ${final} (${size} bytes)"
}

APK_PATH="${DEST_DIR}/${APK_DEST_NAME}"
AAB_PATH="${DEST_DIR}/${AAB_DEST_NAME}"

fetch_asset "${APK_URL}" "${APK_PATH}"
fetch_asset "${AAB_URL}" "${AAB_PATH}"

# -----------------------------------------------------------------------------
# Compute SHA-256 fingerprints for the audit trail and write manifest.json.
# This file is THE single source of truth that the frontend (index.html +
# install-app.tsx), the /api/health endpoint, the admin AAB download
# endpoint, and the verify-vex-deployment.sh script all read to discover
# the current filenames. Writing it last (after both binaries are fully
# downloaded and validated) means a partial refresh never publishes a
# stale manifest pointing at a half-written file.
# -----------------------------------------------------------------------------
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

APK_SIZE="$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH")"
AAB_SIZE="$(stat -c%s "$AAB_PATH" 2>/dev/null || stat -f%z "$AAB_PATH")"
APK_SHA="$(sha256_of "$APK_PATH")"
AAB_SHA="$(sha256_of "$AAB_PATH")"
RELEASED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

MANIFEST_PATH="${DEST_DIR}/manifest.json"
MANIFEST_TMP="${MANIFEST_PATH}.tmp"
cat > "${MANIFEST_TMP}" <<JSON
{
  "version": "${APP_VERSION}",
  "apkFile": "${APK_DEST_NAME}",
  "apkUrl": "/downloads/${APK_DEST_NAME}",
  "apkSize": ${APK_SIZE},
  "apkSizeMb": $(( (APK_SIZE + 524288) / 1048576 )),
  "apkSha256": "${APK_SHA}",
  "aabFile": "${AAB_DEST_NAME}",
  "aabSize": ${AAB_SIZE},
  "aabSha256": "${AAB_SHA}",
  "releasedAt": "${RELEASED_AT}"
}
JSON
mv -f "${MANIFEST_TMP}" "${MANIFEST_PATH}"
log "Wrote manifest: ${MANIFEST_PATH}"
log "  version:   ${APP_VERSION}"
log "  apk:       ${APK_DEST_NAME}  ($((APK_SIZE / 1024 / 1024)) MB)  sha256=${APK_SHA}"
log "  aab:       ${AAB_DEST_NAME}  ($((AAB_SIZE / 1024 / 1024)) MB)  sha256=${AAB_SHA}"

# -----------------------------------------------------------------------------
# Now — and only now — sweep away every stale .apk / .aab in the public
# downloads dir AND the production build output dir. The new binaries +
# manifest are already in place, so this prune step has zero downtime:
# users requesting the just-published filename succeed; users requesting
# the now-deleted older filename fall back to the manifest-driven UI on
# their next page load.
# -----------------------------------------------------------------------------
prune_stale_binaries "${DEST_DIR}" "${APK_DEST_NAME}" "${AAB_DEST_NAME}"
prune_stale_binaries "dist/public/downloads" "${APK_DEST_NAME}" "${AAB_DEST_NAME}"

log "Done. Public link: https://vixo.click/downloads/${APK_DEST_NAME}"
log "      Manifest:    https://vixo.click/downloads/manifest.json"
