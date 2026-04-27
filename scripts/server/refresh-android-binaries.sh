#!/usr/bin/env bash
# refresh-android-binaries.sh
# -----------------------------------------------------------------------------
# Pulls the latest signed Android binaries (APK + AAB) from the GitHub
# Releases CDN and atomically swaps them into client/public/downloads/ on
# the Hostinger VPS. Designed to be run after `git pull` (or via cron) so
# the public download links on vixo.click always point at the freshest
# build produced by the GitHub Actions pipeline.
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

# The Release CDN serves the build outputs under their original CI filenames
# (VEX-official-release.{apk,aab}), but the public download page on
# vixo.click and the admin app-settings route both expect the canonical
# names app.apk / app.aab in client/public/downloads/. We download from
# the CDN URL and write to the canonical filename in one step so the
# Hostinger filesystem layout stays exactly what the frontend expects.
BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
APK_URL="${BASE_URL}/VEX-official-release.apk"
AAB_URL="${BASE_URL}/VEX-official-release.aab"
APK_DEST_NAME="app.apk"
AAB_DEST_NAME="app.aab"

mkdir -p "${DEST_DIR}"

log()  { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

# -----------------------------------------------------------------------------
# Wipe ALL existing .apk and .aab files in DEST_DIR before fetching the new
# binaries. This guarantees no stale build (regardless of filename — canonical
# `app.apk` / `app.aab`, legacy `VEX-official-release.{apk,aab}`, hand-uploaded
# copies, or anything else with a `.apk`/`.aab` extension) ever lingers next to
# the freshly published release. Without this step a partially-failed previous
# refresh could leave a mismatched mix of versions in the public download dir.
#
# We also wipe the same extensions inside the production build output dir
# `dist/public/downloads/` when it exists, because the docker-compose bind
# mount only covers the source tree — the build output is a sibling location
# that the container itself writes to during a rebuild.
# -----------------------------------------------------------------------------
wipe_old_binaries() {
  local target_dir="$1"
  [ -d "$target_dir" ] || return 0

  local removed=0
  while IFS= read -r -d '' old; do
    rm -f "$old"
    log "  Removed old binary: ${old}"
    removed=$((removed + 1))
  done < <(find "$target_dir" -maxdepth 1 -type f \
              \( -iname '*.apk' -o -iname '*.aab' \) -print0)

  if [ "$removed" -gt 0 ]; then
    log "Wiped ${removed} old binary file(s) from ${target_dir}"
  else
    log "No existing binaries to wipe in ${target_dir}"
  fi
}

log "Cleaning previous Android binaries before fetching the latest release..."
wipe_old_binaries "${DEST_DIR}"
# Also clean the production build output if present (created by `npm run build`).
# The bind mount in docker-compose.prod.yml maps the source DEST_DIR onto the
# container's dist path read-only, but a rebuilt image may have its own copies
# baked in — drop them too so only the freshly downloaded binaries remain.
wipe_old_binaries "dist/public/downloads"

# -----------------------------------------------------------------------------
# Download a single asset to a temp file, validate it, then atomically
# move it into the destination directory. Validation rules:
#   1) HTTP status must be 200 (curl --fail).
#   2) Final file size must be >= MIN_BYTES.
#   3) First bytes must NOT look like an HTML error page or LFS pointer.
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
  log "Saved ${final} (${size} bytes)"
}

fetch_asset "${APK_URL}" "${DEST_DIR}/${APK_DEST_NAME}"
fetch_asset "${AAB_URL}" "${DEST_DIR}/${AAB_DEST_NAME}"

log "Done. Binaries refreshed in ${DEST_DIR}/"
log "  ${APK_DEST_NAME}: $(stat -c%s "${DEST_DIR}/${APK_DEST_NAME}" 2>/dev/null || stat -f%z "${DEST_DIR}/${APK_DEST_NAME}") bytes  → public download (vixo.click/downloads/app.apk)"
log "  ${AAB_DEST_NAME}: $(stat -c%s "${DEST_DIR}/${AAB_DEST_NAME}" 2>/dev/null || stat -f%z "${DEST_DIR}/${AAB_DEST_NAME}") bytes  → admin-only download (/api/admin/downloads/aab) — blocked from public /downloads/ path"
log ""
log "The vex-app container reads these via the read-only volume mount"
log "(./client/public/downloads:/app/dist/public/downloads:ro), so the new"
log "binaries are live immediately — no container restart required."
