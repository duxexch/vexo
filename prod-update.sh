#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_REPO_DIR="/docker/vex"

if [[ -d "$SERVER_REPO_DIR/.git" ]]; then
  REPO_DIR="$SERVER_REPO_DIR"
else
  REPO_DIR="$SCRIPT_DIR"
fi
ENV_FILE_INPUT=".env"
NO_BACKUP="false"
NON_INTERACTIVE="false"

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
- Pulls latest updates from GitHub
- Ensures updated env values are loaded into containers
- Performs strict production redeploy + health verification

Options:
  --repo-dir <path>      Existing repository directory (default: /docker/vex if present)
  --env-file <path>      Env file path inside repo (default: .env)
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
    log_ok "Backup created: $backup_file"
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

AUTO_SCRIPT="$REPO_DIR/prod-auto.sh"
if [[ ! -f "$AUTO_SCRIPT" ]]; then
  log_error "prod-auto.sh not found at: $AUTO_SCRIPT"
  exit 1
fi

log_info "Running strict update flow via prod-auto (pull latest + env reconcile + redeploy)"
bash "$AUTO_SCRIPT" \
  --repo-dir "$REPO_DIR" \
  --env-file "$ENV_FILE_INPUT" \
  --skip-repo-setup \
  --pull-latest \
  "${FORWARD_ARGS[@]}"

log_ok "Production update completed successfully"
echo ""
echo "Run command:"
echo "  ./prod-update.sh --repo-dir $REPO_DIR"
