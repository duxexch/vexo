#!/usr/bin/env bash
# update-all.sh
# -----------------------------------------------------------------------------
# One-shot VPS update orchestrator for the vixo.click VEX platform.
#
# Runs the full update sequence in the safest possible order:
#
#   1) git pull              — fetch the latest code/version
#   2) refresh-android-binaries.sh
#                            — pull the matching VEX-<version>.{apk,aab}
#                              from the GitHub Release CDN and write
#                              client/public/downloads/manifest.json
#   3) prod-update.sh        — rebuild + restart the docker-compose stack
#                              (only if step 1 brought in code changes OR
#                              --force is passed; idempotent otherwise)
#   4) verify-vex-deployment.sh
#                            — sanity-check the live site
#   5) probe-android-manifest.sh
#                            — STRICT manifest-vs-disk-vs-public-URL
#                              reconciliation. Fails the orchestrator hard
#                              when manifest.json references an APK/AAB
#                              that is missing on disk OR when the public
#                              /downloads/<file>.apk URL does not return
#                              Content-Type: application/vnd.android.package-archive
#                              with valid ZIP body bytes. This is what
#                              prevents the "All done" line from being
#                              printed while users actually get an HTML
#                              error page from the install URL.
#
# Step 2 runs BEFORE step 3 on purpose: the binaries are bind-mounted
# read-only into the container, so writing them while the container is
# still serving the old image guarantees zero-downtime — users keep
# downloading the previous APK until the new container restarts and
# picks up the freshly published manifest atomically.
#
# Each step can be skipped independently with the matching flag, and
# any non-zero exit aborts the rest of the run (set -e + trap) so a
# failed git pull never deploys broken code and a failed APK download
# never leaves the manifest pointing at a missing file.
#
# Usage:
#   bash scripts/server/update-all.sh [options]
#
# Options:
#   --skip-pull        Don't run `git pull` (use the working tree as-is)
#   --skip-apk         Don't refresh the Android binaries / manifest
#   --skip-deploy      Don't rebuild / restart docker-compose
#   --skip-verify      Don't run the post-deploy verification script
#   --force            Always run the docker-compose rebuild even if
#                      `git pull` reported no new commits (useful after
#                      an env file change or a manual code edit)
#   --branch <name>    Git branch to pull (default: current branch)
#   --                 Pass everything after this directly to prod-update.sh
#                      e.g. `update-all.sh -- --no-backup --refresh-images`
#
# Examples:
#   # Standard nightly refresh — pull, fetch APK, redeploy if needed, verify
#   bash scripts/server/update-all.sh
#
#   # Refresh only the APK on the VPS (no code change involved)
#   bash scripts/server/update-all.sh --skip-pull --skip-deploy
#
#   # Force a full rebuild even when git is up-to-date (e.g. after .env edit)
#   bash scripts/server/update-all.sh --force
#
#   # Rebuild without the deep verify (faster CI loop). Note: --skip-verify
#   # also skips Step 5 (the strict APK manifest probe) — only use this in
#   # CI loops where you have a separate post-deploy gate.
#   bash scripts/server/update-all.sh --skip-verify
#
#   # Just re-check that the public APK URL still serves the manifest's
#   # APK with the right MIME (no rebuild, no git pull, no APK refresh):
#   bash scripts/server/probe-android-manifest.sh
# -----------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# ANSI colours — match the style used by prod-update.sh.
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_step()  { echo -e "\n${BOLD}${BLUE}━━━ $* ━━━${NC}"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Trap unexpected failures so the operator gets a clear pointer to the
# step that broke instead of a bare bash error.
on_error() {
  local exit_code=$?
  log_error "update-all.sh aborted on line $1 (exit code $exit_code)"
  log_error "Re-run with the --skip-* flag for whichever step succeeded"
  log_error "to avoid redoing work, e.g.:"
  log_error "  bash scripts/server/update-all.sh --skip-pull --skip-apk"
  exit $exit_code
}
trap 'on_error $LINENO' ERR

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------
SKIP_PULL="false"
SKIP_APK="false"
SKIP_DEPLOY="false"
SKIP_VERIFY="false"
FORCE_DEPLOY="false"
BRANCH=""
PROD_UPDATE_FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)    SKIP_PULL="true"; shift ;;
    --skip-apk)     SKIP_APK="true"; shift ;;
    --skip-deploy)  SKIP_DEPLOY="true"; shift ;;
    --skip-verify)  SKIP_VERIFY="true"; shift ;;
    --force)        FORCE_DEPLOY="true"; shift ;;
    --branch)       BRANCH="${2:-}"; shift 2 ;;
    --help|-h)
      sed -n '2,55p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --)
      shift
      PROD_UPDATE_FORWARD_ARGS=("$@")
      break
      ;;
    *)
      log_error "Unknown option: $1"
      log_error "Run: bash scripts/server/update-all.sh --help"
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Pre-flight: required commands
# -----------------------------------------------------------------------------
log_step "Pre-flight checks"

REQUIRED_CMDS=(bash curl)
[[ "$SKIP_PULL" == "false" ]] && REQUIRED_CMDS+=(git)
[[ "$SKIP_APK" == "false"  ]] && REQUIRED_CMDS+=(node)

MISSING_CMDS=()
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_CMDS+=("$cmd")
  fi
done

if [[ ${#MISSING_CMDS[@]} -gt 0 ]]; then
  log_error "Missing required command(s): ${MISSING_CMDS[*]}"
  if printf '%s\n' "${MISSING_CMDS[@]}" | grep -qx node; then
    log_error "  Install Node.js 20 (needed by refresh-android-binaries.sh):"
    log_error "    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
  fi
  exit 1
fi
log_ok "All required commands available"

# -----------------------------------------------------------------------------
# Step 1 — git pull
# -----------------------------------------------------------------------------
CODE_CHANGED="false"

if [[ "$SKIP_PULL" == "true" ]]; then
  log_step "Step 1/4: git pull (skipped)"
else
  log_step "Step 1/4: git pull"

  if [[ ! -d ".git" ]]; then
    log_error "$(pwd) is not a git working tree"
    exit 1
  fi

  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  TARGET_BRANCH="${BRANCH:-$CURRENT_BRANCH}"

  log_info "Branch: ${TARGET_BRANCH} (current: ${CURRENT_BRANCH})"

  # Guard against an unclean working tree — surfacing this early is
  # safer than letting `git pull` rebase/merge over local edits.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warn "Local modifications detected:"
    git status --short | sed 's/^/    /'
    log_warn "git pull will refuse to overwrite uncommitted changes."
    log_warn "Stash or commit them first, then re-run with --skip-pull"
    exit 1
  fi

  PRE_PULL_HEAD="$(git rev-parse HEAD)"
  log_info "Pulling ${TARGET_BRANCH} from origin..."
  git fetch origin "$TARGET_BRANCH"
  git pull --ff-only origin "$TARGET_BRANCH"
  POST_PULL_HEAD="$(git rev-parse HEAD)"

  if [[ "$PRE_PULL_HEAD" == "$POST_PULL_HEAD" ]]; then
    log_ok "Already up to date (HEAD: ${POST_PULL_HEAD:0:7})"
  else
    CODE_CHANGED="true"
    CHANGED_COUNT="$(git rev-list --count "${PRE_PULL_HEAD}..${POST_PULL_HEAD}")"
    log_ok "Pulled ${CHANGED_COUNT} new commit(s): ${PRE_PULL_HEAD:0:7} → ${POST_PULL_HEAD:0:7}"
  fi
fi

# -----------------------------------------------------------------------------
# Step 2 — refresh Android binaries + manifest
# -----------------------------------------------------------------------------
if [[ "$SKIP_APK" == "true" ]]; then
  log_step "Step 2/4: refresh Android binaries (skipped)"
else
  log_step "Step 2/4: refresh Android binaries (APK + AAB + manifest.json)"
  bash scripts/server/refresh-android-binaries.sh
  log_ok "Android binaries refreshed"
fi

# -----------------------------------------------------------------------------
# Step 3 — docker-compose redeploy
# -----------------------------------------------------------------------------
# Skipping the rebuild when nothing changed in git keeps the public site
# uninterrupted on routine "just refresh the APK" runs. The --force flag
# overrides this when the operator knows there's an out-of-band change
# (e.g. a .env edit or a manual file replacement).
if [[ "$SKIP_DEPLOY" == "true" ]]; then
  log_step "Step 3/4: docker-compose redeploy (skipped)"
elif [[ "$CODE_CHANGED" == "false" && "$FORCE_DEPLOY" == "false" && "$SKIP_PULL" == "false" ]]; then
  log_step "Step 3/4: docker-compose redeploy (skipped — no code changes; pass --force to override)"
else
  log_step "Step 3/4: docker-compose redeploy"
  if [[ ${#PROD_UPDATE_FORWARD_ARGS[@]} -gt 0 ]]; then
    log_info "Forwarding to prod-update.sh: ${PROD_UPDATE_FORWARD_ARGS[*]}"
    bash "$REPO_ROOT/prod-update.sh" "${PROD_UPDATE_FORWARD_ARGS[@]}"
  else
    bash "$REPO_ROOT/prod-update.sh"
  fi
  log_ok "Deployment completed"
fi

# -----------------------------------------------------------------------------
# Step 4 — post-deploy verification
# -----------------------------------------------------------------------------
if [[ "$SKIP_VERIFY" == "true" ]]; then
  log_step "Step 4/5: post-deploy verification (skipped)"
else
  log_step "Step 4/5: post-deploy verification"
  # verify-vex-deployment.sh uses `set -uo pipefail` (no -e) and prints
  # its own pass/warn/fail summary. We capture its exit code so a
  # verification failure doesn't crash the orchestrator — the operator
  # already sees the detailed report and can decide what to do next.
  set +e
  bash scripts/server/verify-vex-deployment.sh
  VERIFY_EXIT=$?
  set -e
  if [[ $VERIFY_EXIT -ne 0 ]]; then
    log_warn "Verification reported issues (exit code $VERIFY_EXIT) — review the output above"
  else
    log_ok "Verification passed"
  fi
fi

# -----------------------------------------------------------------------------
# Step 5 — STRICT manifest-vs-disk-vs-public-URL reconciliation
# -----------------------------------------------------------------------------
# This is the load-bearing check that prevents the orchestrator from
# printing "All done" while the public APK URL actually serves an HTML
# error page (the silent-failure mode that wasted hours on the
# HTML-instead-of-APK incident).
#
# Unlike Step 4, a failure HERE aborts the orchestrator with a non-zero
# exit code so the operator can never walk away thinking the deploy
# succeeded when /downloads/<file>.apk would 404 or return text/html.
#
# The probe script also prints the recovery command
# (refresh-android-binaries.sh) directly in its failure output, so the
# operator doesn't need to remember which sub-script to re-run.
if [[ "$SKIP_VERIFY" == "true" ]]; then
  log_step "Step 5/5: manifest ↔ disk ↔ public URL probe (skipped via --skip-verify)"
else
  log_step "Step 5/5: manifest ↔ disk ↔ public URL probe (strict)"
  # Run the probe inline. It uses `set -uo pipefail` (no -e) and exits
  # non-zero with a detailed report on any mismatch — we propagate that
  # exit code straight back to the operator via the ERR trap.
  set +e
  bash scripts/server/probe-android-manifest.sh
  PROBE_EXIT=$?
  set -e
  if [[ $PROBE_EXIT -ne 0 ]]; then
    log_error "APK manifest probe FAILED (exit code $PROBE_EXIT)"
    log_error "DO NOT announce this deploy — the public APK is not installable."
    log_error "Recovery: bash scripts/server/refresh-android-binaries.sh"
    log_error "Then re-run: bash scripts/server/update-all.sh --skip-pull --skip-deploy"
    exit $PROBE_EXIT
  fi
  log_ok "APK manifest, disk binaries, and public URL all agree"
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
log_step "All done"
log_ok "Update sequence finished"
log_info "Public site:        https://vixo.click"
log_info "Download manifest:  https://vixo.click/downloads/manifest.json"
log_info "Health endpoint:    https://vixo.click/api/health"
