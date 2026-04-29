#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_REPO_DIR="/docker/vex"
DEFAULT_REPO_URL="https://github.com/duxexch/vexo.git"
DEFAULT_REPO_BRANCH="main"

if [[ -d "$SERVER_REPO_DIR/.git" ]]; then
  REPO_DIR="$SERVER_REPO_DIR"
else
  REPO_DIR="$SCRIPT_DIR"
fi
REPO_URL="$DEFAULT_REPO_URL"
REPO_BRANCH="$DEFAULT_REPO_BRANCH"
AUTH_MODE="auto"
GITHUB_TOKEN_INPUT=""
GITHUB_TOKEN_VALUE=""
USE_TOKEN_AUTH="false"
REPO_PREPULLED="false"
ENV_FILE_INPUT=".env"
NO_BACKUP="false"
NON_INTERACTIVE="false"
IMAGE_REFRESH_MODE="auto"
POST_DEPLOY_VERIFY="true"

FORWARD_ARGS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

ensure_docker_compose_available() {
  if ! docker compose version >/dev/null 2>&1; then
    log_error "docker compose plugin is not available"
    log_error "Install Docker Compose plugin and retry"
    exit 1
  fi
}

warn_ubuntu_2510_update_bug() {
  if [[ ! -r /etc/os-release ]]; then
    return 0
  fi

  local distro_id=""
  local distro_version=""
  distro_id="$(grep -E '^ID=' /etc/os-release | head -n 1 | cut -d= -f2 | tr -d '"')"
  distro_version="$(grep -E '^VERSION_ID=' /etc/os-release | head -n 1 | cut -d= -f2 | tr -d '"')"

  if [[ "$distro_id" == "ubuntu" && "$distro_version" == "25.10" ]]; then
    log_warn "Ubuntu 25.10 detected. If updates fail, run: sudo apt install --update rust-coreutils"
  fi
}

safe_timestamp() {
  local ts=""
  ts="$(printf '%(%Y%m%d_%H%M%S)T' -1 2>/dev/null || true)"
  if [[ -n "$ts" ]]; then
    printf '%s' "$ts"
    return 0
  fi

  if command -v date >/dev/null 2>&1; then
    date +%Y%m%d_%H%M%S
    return 0
  fi

  printf 'fallback_%s' "$$"
}

usage() {
  cat <<'EOF'
Usage: ./prod-update.sh [options]

Update script (without path/repo bootstrap):
- Validates and repairs .env via prod-auto flow
  (now also enforces INTERNAL_SERVICE_TOKEN — required by vex-agents-service)
- Pulls latest updates from GitHub
- Ensures updated env values are loaded into containers
- Performs strict production redeploy + health verification across the
  6-container stack: vex-db, vex-redis, vex-minio, vex-ai-agent,
  vex-agents-service (commercial agents, port 3002), vex-app
- Reconciles voice stack (livekit + coturn) through prod-auto voice checks

Options:
  --repo-dir <path>      Existing repository directory (default: /docker/vex if present)
  --repo-url <url>       Forward repository URL to prod-auto (for token/https mode)
  --branch <name>        Forward branch to prod-auto (default: main)
  --auth-mode <mode>     Forward auth mode to prod-auto: auto|ssh|token
  --github-token <token> Forward GitHub token to prod-auto (prefer env GITHUB_TOKEN)
  --env-file <path>      Env file path inside repo (default: .env)
  --auto-env-values      Forward auto env generation mode to prod-auto
  --prompt-env-values    Forward interactive env prompts mode to prod-auto
  --voice-compose-file   Forward custom voice compose path to prod-auto
  --voice-sysctl-file    Forward custom voice sysctl overlay path to prod-auto
  --enable-voice-stack   Force voice stack deployment in update run
  --disable-voice-stack  Skip voice stack deployment in update run
  --refresh-images       Pull latest upstream images for infra/voice services
  --skip-image-refresh   Skip pulling upstream images
  --skip-post-verify     Skip deep post-deploy runtime verification
  --no-backup            Skip pre-update DB backup
  --non-interactive      Fail on invalid env values instead of prompting
  -h, --help             Show help

Any unknown options are forwarded to ./prod-auto.sh.
EOF
}

is_absolute_path() {
  [[ "$1" = /* ]]
}

resolve_path() {
  local base="$1"
  local input="$2"
  if is_absolute_path "$input"; then
    printf '%s' "$input"
  else
    printf '%s' "$base/$input"
  fi
}

to_ssh_url() {
  local url="$1"
  if [[ "$url" =~ ^git@github.com:.+ ]]; then
    printf '%s' "$url"
    return 0
  fi

  if [[ "$url" =~ ^https://github.com/(.+)\.git$ ]]; then
    printf 'git@github.com:%s.git' "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "$url" =~ ^https://github.com/(.+)$ ]]; then
    printf 'git@github.com:%s.git' "${BASH_REMATCH[1]}"
    return 0
  fi

  printf '%s' "$url"
}

to_https_url() {
  local url="$1"
  if [[ "$url" =~ ^https://github.com/.+ ]]; then
    printf '%s' "$url"
    return 0
  fi

  if [[ "$url" =~ ^git@github.com:(.+)$ ]]; then
    printf 'https://github.com/%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  printf '%s' "$url"
}

to_token_url() {
  local url="$1"
  local token="$2"
  local https_url
  https_url="$(to_https_url "$url")"

  if [[ "$https_url" =~ ^https://github.com/(.+)$ ]]; then
    printf 'https://x-access-token:%s@github.com/%s' "$token" "${BASH_REMATCH[1]}"
    return 0
  fi

  printf '%s' "$https_url"
}

resolve_git_auth_mode() {
  if [[ -z "$GITHUB_TOKEN_VALUE" && -n "$GITHUB_TOKEN_INPUT" ]]; then
    GITHUB_TOKEN_VALUE="$GITHUB_TOKEN_INPUT"
  fi

  if [[ -z "$GITHUB_TOKEN_VALUE" && -n "${GITHUB_TOKEN:-}" ]]; then
    GITHUB_TOKEN_VALUE="$GITHUB_TOKEN"
  fi

  GITHUB_TOKEN_VALUE="${GITHUB_TOKEN_VALUE%$'\r'}"

  case "$AUTH_MODE" in
    auto)
      if [[ -n "$GITHUB_TOKEN_VALUE" ]]; then
        USE_TOKEN_AUTH="true"
      else
        USE_TOKEN_AUTH="false"
      fi
      ;;
    ssh)
      USE_TOKEN_AUTH="false"
      ;;
    token)
      USE_TOKEN_AUTH="true"
      ;;
    *)
      log_error "Invalid --auth-mode value: $AUTH_MODE"
      log_error "Allowed values: auto, ssh, token"
      exit 1
      ;;
  esac

  if [[ "$USE_TOKEN_AUTH" == "true" ]]; then
    if [[ -z "$GITHUB_TOKEN_VALUE" ]]; then
      log_error "Token auth selected but no token provided"
      log_error "Set env var GITHUB_TOKEN or pass --github-token <token>"
      exit 1
    fi

    REPO_URL="$(to_https_url "$REPO_URL")"
    log_info "Update auth mode: token"
  else
    REPO_URL="$(to_ssh_url "$REPO_URL")"
    log_info "Update auth mode: ssh"
  fi
}

ensure_origin_url_for_mode() {
  local origin_url
  origin_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

  if [[ -z "$origin_url" ]]; then
    git -C "$REPO_DIR" remote add origin "$REPO_URL"
    return 0
  fi

  if [[ "$origin_url" != "$REPO_URL" ]]; then
    git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
  fi
}

pull_latest_repo_before_handoff() {
  if [[ "$USE_TOKEN_AUTH" == "true" ]]; then
    local token_url
    token_url="$(to_token_url "$REPO_URL" "$GITHUB_TOKEN_VALUE")"

    log_info "Pre-pulling latest repository state using token auth"
    git -C "$REPO_DIR" pull --ff-only "$token_url" "$REPO_BRANCH"
    ensure_origin_url_for_mode
    REPO_PREPULLED="true"
    return 0
  fi

  if [[ "$AUTH_MODE" == "ssh" ]]; then
    log_info "Pre-pulling latest repository state using ssh auth"
    ensure_origin_url_for_mode
    git -C "$REPO_DIR" pull --ff-only origin "$REPO_BRANCH"
    REPO_PREPULLED="true"
    return 0
  fi

  log_info "Auto auth without token: delegating pull-latest to prod-auto"
}

read_env_from_file() {
  local env_file="$1"
  local key="$2"
  local value
  value="$(grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

create_pre_update_backup() {
  local env_file="$1"

  if [[ "$NO_BACKUP" == "true" ]]; then
    log_warn "Skipping database backup (--no-backup)"
    return 0
  fi

  if ! docker container inspect vex-db >/dev/null 2>&1; then
    log_warn "vex-db container is not running; skipping backup"
    return 0
  fi

  if [[ ! -f "$env_file" ]]; then
    log_warn "Env file missing ($env_file); skipping backup"
    return 0
  fi

  local db_user db_name
  db_user="$(read_env_from_file "$env_file" POSTGRES_USER)"
  db_name="$(read_env_from_file "$env_file" POSTGRES_DB)"
  db_name="${db_name:-vex_db}"

  if [[ -z "$db_user" ]]; then
    log_warn "POSTGRES_USER is missing in env file; skipping backup"
    return 0
  fi

  mkdir -p "$REPO_DIR/backups"
  local backup_file="$REPO_DIR/backups/vex_db_$(safe_timestamp).sql.gz"

  if docker exec vex-db pg_dump -U "$db_user" "$db_name" | gzip > "$backup_file"; then
    if [[ -s "$backup_file" ]]; then
      log_ok "Backup created: $backup_file"
    else
      rm -f "$backup_file"
      log_warn "Backup file was empty and has been removed"
    fi
  else
    log_warn "Backup failed; continuing with update"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)
      [[ $# -ge 2 ]] || { log_error "Missing value for --repo-dir"; exit 1; }
      REPO_DIR="$2"
      shift 2
      ;;
    --repo-url)
      [[ $# -ge 2 ]] || { log_error "Missing value for --repo-url"; exit 1; }
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || { log_error "Missing value for --branch"; exit 1; }
      REPO_BRANCH="$2"
      shift 2
      ;;
    --auth-mode)
      [[ $# -ge 2 ]] || { log_error "Missing value for --auth-mode"; exit 1; }
      AUTH_MODE="$2"
      shift 2
      ;;
    --github-token)
      [[ $# -ge 2 ]] || { log_error "Missing value for --github-token"; exit 1; }
      GITHUB_TOKEN_INPUT="$2"
      shift 2
      ;;
    --env-file)
      [[ $# -ge 2 ]] || { log_error "Missing value for --env-file"; exit 1; }
      ENV_FILE_INPUT="$2"
      shift 2
      ;;
    --no-backup)
      NO_BACKUP="true"
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE="true"
      FORWARD_ARGS+=("--non-interactive")
      shift
      ;;
    --refresh-images)
      IMAGE_REFRESH_MODE="true"
      FORWARD_ARGS+=("--refresh-images")
      shift
      ;;
    --skip-image-refresh)
      IMAGE_REFRESH_MODE="false"
      FORWARD_ARGS+=("--skip-image-refresh")
      shift
      ;;
    --skip-post-verify)
      POST_DEPLOY_VERIFY="false"
      FORWARD_ARGS+=("--skip-post-verify")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done

if ! is_absolute_path "$REPO_DIR"; then
  REPO_DIR="$(pwd)/$REPO_DIR"
fi

resolve_git_auth_mode

require_command git
require_command docker
require_command gzip
ensure_docker_compose_available
warn_ubuntu_2510_update_bug

if [[ ! -d "$REPO_DIR/.git" ]]; then
  log_error "Repository directory is not initialized: $REPO_DIR"
  log_error "Run first: ./prod-auto.sh --repo-dir $REPO_DIR"
  exit 1
fi

ENV_FILE_PATH="$(resolve_path "$REPO_DIR" "$ENV_FILE_INPUT")"
create_pre_update_backup "$ENV_FILE_PATH"

if [[ -n "$GITHUB_TOKEN_VALUE" ]]; then
  export GITHUB_TOKEN="$GITHUB_TOKEN_VALUE"
fi

pull_latest_repo_before_handoff

if [[ "$IMAGE_REFRESH_MODE" == "auto" ]]; then
  FORWARD_ARGS+=("--refresh-images")
fi

AUTO_SCRIPT="$REPO_DIR/prod-auto.sh"
if [[ ! -f "$AUTO_SCRIPT" ]]; then
  log_error "prod-auto.sh not found at: $AUTO_SCRIPT"
  exit 1
fi

log_info "Running strict update flow via prod-auto (pull latest + env reconcile + redeploy)"

PULL_LATEST_FLAG=(--pull-latest)
if [[ "$REPO_PREPULLED" == "true" ]]; then
  PULL_LATEST_FLAG=()
fi

bash "$AUTO_SCRIPT" \
  --repo-dir "$REPO_DIR" \
  --repo-url "$REPO_URL" \
  --branch "$REPO_BRANCH" \
  --auth-mode "$AUTH_MODE" \
  --env-file "$ENV_FILE_INPUT" \
  --skip-repo-setup \
  "${PULL_LATEST_FLAG[@]}" \
  "${FORWARD_ARGS[@]}"

log_ok "Production update completed successfully"
echo ""
echo "Run command:"
echo "  ./prod-update.sh --repo-dir $REPO_DIR"
