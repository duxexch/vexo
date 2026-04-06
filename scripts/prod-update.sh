#!/usr/bin/env bash

# VEX Platform - Automated Production Update Script
# - Optional DB backup
# - Pull latest code
# - Re-run full production bootstrap/deploy checks

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE=".env.production.local"
COMPOSE_FILE="docker-compose.prod.yml"
NO_BACKUP="false"

FORWARD_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/prod-update.sh [options passed to prod-auto.sh]

Options:
  --no-backup          Skip pre-update DB backup
  --env-file <path>    Override env file used for backup and deployment
  --compose-file <path>Override compose file used for backup and deployment
  -h, --help           Show this help

Any additional options are forwarded to ./scripts/prod-auto.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-backup)
      NO_BACKUP="true"
      shift
      ;;
    --env-file)
      ENV_FILE="$2"
      FORWARD_ARGS+=("--env-file" "$2")
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      FORWARD_ARGS+=("--compose-file" "$2")
      shift 2
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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[WARN] $ENV_FILE not found. Backup step will be skipped."
  NO_BACKUP="true"
fi

read_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

if [[ "$NO_BACKUP" != "true" ]]; then
  if docker container inspect vex-db >/dev/null 2>&1; then
    mkdir -p backups
    DB_USER="$(read_env POSTGRES_USER)"
    DB_NAME="$(read_env POSTGRES_DB)"
    DB_NAME="${DB_NAME:-vex_db}"

    if [[ -n "$DB_USER" ]]; then
      BACKUP_FILE="backups/vex_db_$(date +%Y%m%d_%H%M%S).sql.gz"
      if docker exec vex-db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"; then
        echo "[OK] Backup created: $BACKUP_FILE"
      else
        echo "[WARN] Backup failed; continuing with update"
      fi
    else
      echo "[WARN] POSTGRES_USER not found in $ENV_FILE; skipping backup"
    fi
  else
    echo "[WARN] vex-db container not running; skipping backup"
  fi
fi

bash "$SCRIPT_DIR/prod-auto.sh" --pull-latest "${FORWARD_ARGS[@]}"
