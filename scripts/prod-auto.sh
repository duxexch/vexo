#!/usr/bin/env bash

# VEX Platform - Automated Production Bootstrap & Deploy
# - First-run server prep
# - Automatic Traefik network wiring
# - Persistent host tuning for Redis
# - Idempotent production deployment with health checks

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILE="docker-compose.prod.yml"
VOICE_COMPOSE_FILE="deploy/docker-compose.voice.yml"
VOICE_PROJECT_NAME="vex"
ENV_TEMPLATE_FILE=".env.production"
ENV_FALLBACK_FILE=".env.example"
ENV_FILE=".env"
TRAEFIK_CONTAINER=""
TRAEFIK_CONTAINER_OVERRIDE=""
DOMAIN="vixo.click"
TRAEFIK_NETWORK_OVERRIDE=""
PULL_LATEST="false"
NO_BUILD="false"
SKIP_SYSCTL="false"
SKIP_VOICE="false"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/prod-auto.sh [options]

Options:
  --domain <domain>           Public domain (default: vixo.click)
  --network <name>            External Traefik network name override
  --traefik-container <name>  Explicit Traefik container name (optional)
  --env-file <path>           Env file path (default: .env)
  --compose-file <path>       Compose file path (default: docker-compose.prod.yml)
  --voice-compose-file <path> Voice compose file path (default: deploy/docker-compose.voice.yml)
  --voice-project <name>      Voice compose project name (default: vex)
  --pull-latest               Pull latest code from origin/main before deploy
  --no-build                  Skip --build for app service
  --skip-sysctl               Skip host sysctl persistence setup
  --skip-voice                Skip voice stack bootstrap (livekit/coturn)
  -h, --help                  Show this help

Examples:
  ./scripts/prod-auto.sh
  ./scripts/prod-auto.sh --domain vixo.click --network vex-traefik
  ./scripts/prod-auto.sh --pull-latest
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --network)
      TRAEFIK_NETWORK_OVERRIDE="$2"
      shift 2
      ;;
    --traefik-container)
      TRAEFIK_CONTAINER_OVERRIDE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --voice-compose-file)
      VOICE_COMPOSE_FILE="$2"
      shift 2
      ;;
    --voice-project)
      VOICE_PROJECT_NAME="$2"
      shift 2
      ;;
    --pull-latest)
      PULL_LATEST="true"
      shift
      ;;
    --no-build)
      NO_BUILD="true"
      shift
      ;;
    --skip-sysctl)
      SKIP_SYSCTL="true"
      shift
      ;;
    --skip-voice)
      SKIP_VOICE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

upsert_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(escape_sed_replacement "$value")"

  if grep -Eq "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

read_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

generate_secret_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

is_placeholder_value() {
  local value="$1"
  [[ "$value" =~ your_|_here|changeme|replace_me|example.com|yourdomain.com|xxxxxxxx ]]
}

ensure_env_file_exists() {
  if [[ -f "$ENV_FILE" ]]; then
    return 0
  fi

  local selected_template=""
  if [[ -f "$ENV_TEMPLATE_FILE" ]]; then
    selected_template="$ENV_TEMPLATE_FILE"
  elif [[ -f "$ENV_FALLBACK_FILE" ]]; then
    selected_template="$ENV_FALLBACK_FILE"
  else
    log_error "Missing env file ($ENV_FILE) and templates ($ENV_TEMPLATE_FILE, $ENV_FALLBACK_FILE)"
    exit 1
  fi

  cp "$selected_template" "$ENV_FILE"
  log_success "Created $ENV_FILE from $selected_template"

  if [[ "$selected_template" == "$ENV_FALLBACK_FILE" ]]; then
    log_warn "Using fallback template .env.example; generating secure defaults for required secrets"
    upsert_env POSTGRES_PASSWORD "$(generate_secret_hex 24)"
    upsert_env REDIS_PASSWORD "$(generate_secret_hex 24)"
    upsert_env MINIO_ROOT_PASSWORD "$(generate_secret_hex 24)"
    upsert_env SESSION_SECRET "$(generate_secret_hex 48)"
    upsert_env JWT_SIGNING_KEY "$(generate_secret_hex 48)"
    upsert_env ADMIN_JWT_SECRET "$(generate_secret_hex 48)"
    upsert_env ADMIN_BOOTSTRAP_PASSWORD "$(generate_secret_hex 12)"
    upsert_env ADMIN_BOOTSTRAP_EMAIL "admin@$DOMAIN"
    upsert_env ADMIN_RECOVERY_EMAIL "admin@$DOMAIN"
    log_success "Secure defaults generated in $ENV_FILE (review/edit if needed)"
  fi
}

validate_required_env() {
  local required_keys=(
    POSTGRES_USER
    POSTGRES_PASSWORD
    REDIS_PASSWORD
    MINIO_ROOT_USER
    MINIO_ROOT_PASSWORD
    SESSION_SECRET
    JWT_SIGNING_KEY
    ADMIN_JWT_SECRET
  )

  local key
  for key in "${required_keys[@]}"; do
    local value
    value="$(read_env "$key")"
    if [[ -z "$value" ]]; then
      log_error "Missing required env key: $key"
      exit 1
    fi
    if is_placeholder_value "$value"; then
      log_error "Env key $key still contains a placeholder value; update $ENV_FILE and retry"
      exit 1
    fi
  done

  local session_secret jwt_signing_key admin_jwt_secret
  session_secret="$(read_env SESSION_SECRET)"
  jwt_signing_key="$(read_env JWT_SIGNING_KEY)"
  admin_jwt_secret="$(read_env ADMIN_JWT_SECRET)"

  if (( ${#session_secret} < 32 || ${#jwt_signing_key} < 32 || ${#admin_jwt_secret} < 32 )); then
    log_error "SESSION_SECRET, JWT_SIGNING_KEY, and ADMIN_JWT_SECRET must be at least 32 chars"
    exit 1
  fi

  local google_android_mode google_android_client_id google_android_alias_client_id
  google_android_mode="$(read_env GOOGLE_ANDROID_LOGIN_MODE)"
  google_android_mode="${google_android_mode,,}"
  google_android_mode="${google_android_mode:-sdk-only}"
  google_android_client_id="$(read_env GOOGLE_ANDROID_CLIENT_ID)"
  google_android_alias_client_id="$(read_env GOOGLE_CLIENT_ID_ANDROID)"

  if [[ "$google_android_mode" == "sdk-only" && -z "$google_android_client_id" && -z "$google_android_alias_client_id" ]]; then
    log_error "GOOGLE_ANDROID_LOGIN_MODE=sdk-only requires GOOGLE_ANDROID_CLIENT_ID (or GOOGLE_CLIENT_ID_ANDROID)"
    exit 1
  fi

  if [[ -n "$google_android_client_id" && -n "$google_android_alias_client_id" && "$google_android_client_id" != "$google_android_alias_client_id" ]]; then
    log_error "GOOGLE_ANDROID_CLIENT_ID and GOOGLE_CLIENT_ID_ANDROID must match when both are set"
    exit 1
  fi
}

validate_compose_social_env_wiring() {
  local google_android_mode
  google_android_mode="$(read_env GOOGLE_ANDROID_LOGIN_MODE)"
  google_android_mode="${google_android_mode,,}"
  google_android_mode="${google_android_mode:-sdk-only}"

  if [[ "$google_android_mode" != "sdk-only" ]]; then
    return 0
  fi

  # Fail fast if compose app env does not expose native Google IDs to the runtime process.
  local resolved_compose
  resolved_compose="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config 2>/dev/null || true)"
  if [[ -z "$resolved_compose" ]]; then
    log_error "Unable to resolve docker compose config for env wiring validation"
    exit 1
  fi

  if ! printf '%s\n' "$resolved_compose" | grep -Eq 'GOOGLE_ANDROID_CLIENT_ID:|GOOGLE_CLIENT_ID_ANDROID:'; then
    log_error "Compose app environment does not expose GOOGLE_ANDROID_CLIENT_ID/GOOGLE_CLIENT_ID_ANDROID while sdk-only mode is enabled"
    log_error "Add Google native env passthrough keys under app.environment in $COMPOSE_FILE"
    exit 1
  fi
}

voice_env_is_ready() {
  local required_voice_keys=(
    LIVEKIT_KEYS
    TURN_EXTERNAL_IP
    TURN_REALM
    TURN_USERNAME
    TURN_PASSWORD
  )

  local key
  for key in "${required_voice_keys[@]}"; do
    local value
    value="$(read_env "$key")"
    if [[ -z "$value" ]]; then
      log_warn "Voice env key is missing: $key"
      return 1
    fi
    if is_placeholder_value "$value"; then
      log_warn "Voice env key has placeholder value: $key"
      return 1
    fi
  done

  return 0
}

wait_for_container_health() {
  local container="$1"
  local timeout_seconds="$2"
  local waited=0

  while (( waited < timeout_seconds )); do
    local status
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"

    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

wait_for_http_code_200() {
  local url="$1"
  local timeout_seconds="$2"
  local host_header="${3:-}"
  local waited=0

  while (( waited < timeout_seconds )); do
    local code

    if [[ -n "$host_header" ]]; then
      code="$(curl -k -s -o /dev/null -w '%{http_code}' "$url" -H "Host: $host_header" || true)"
    else
      code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
    fi

    if [[ "$code" == "200" ]]; then
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

detect_traefik_network() {
  is_reserved_network() {
    local name="$1"
    [[ "$name" == "host" || "$name" == "bridge" || "$name" == "none" || -z "$name" ]]
  }

  if [[ -n "$TRAEFIK_NETWORK_OVERRIDE" ]]; then
    if is_reserved_network "$TRAEFIK_NETWORK_OVERRIDE"; then
      log_error "Invalid Traefik network override: $TRAEFIK_NETWORK_OVERRIDE"
      log_error "Use a user-defined Docker network (not host/bridge/none)."
      exit 1
    fi
    printf '%s' "$TRAEFIK_NETWORK_OVERRIDE"
    return 0
  fi

  if [[ -n "$TRAEFIK_CONTAINER" ]] && docker container inspect "$TRAEFIK_CONTAINER" >/dev/null 2>&1; then
    local candidate
    while IFS= read -r candidate; do
      candidate="$(printf '%s' "$candidate" | tr -d '[:space:]')"
      if [[ -n "$candidate" ]] && ! is_reserved_network "$candidate"; then
        printf '%s' "$candidate"
        return 0
      fi
    done < <(docker inspect "$TRAEFIK_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}')
  fi

  printf '%s' "vex-traefik"
}

detect_traefik_container() {
  if [[ -n "$TRAEFIK_CONTAINER_OVERRIDE" ]]; then
    if docker container inspect "$TRAEFIK_CONTAINER_OVERRIDE" >/dev/null 2>&1; then
      printf '%s' "$TRAEFIK_CONTAINER_OVERRIDE"
      return 0
    fi
    log_error "Specified Traefik container was not found: $TRAEFIK_CONTAINER_OVERRIDE"
    exit 1
  fi

  local candidate
  candidate="$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /(^|\/)traefik(:|@|$)/ {print $1; exit}')"
  if [[ -n "$candidate" ]]; then
    printf '%s' "$candidate"
    return 0
  fi

  candidate="$(docker ps --format '{{.Names}}' | grep -Ei 'traefik' | head -n 1 || true)"
  printf '%s' "$candidate"
}

traefik_container_exists() {
  [[ -n "$TRAEFIK_CONTAINER" ]] && docker container inspect "$TRAEFIK_CONTAINER" >/dev/null 2>&1
}

ensure_host_sysctl() {
  if [[ "$SKIP_SYSCTL" == "true" ]]; then
    log_warn "Skipping sysctl setup (--skip-sysctl)"
    return 0
  fi

  local sudo_cmd=""
  if [[ "$(id -u)" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo_cmd="sudo"
    else
      log_warn "Not running as root and sudo not available; skipping persistent sysctl setup"
      return 0
    fi
  fi

  local sysctl_file="/etc/sysctl.d/99-vex-production.conf"
  cat <<EOF | ${sudo_cmd} tee "$sysctl_file" >/dev/null
vm.overcommit_memory=1
EOF

  ${sudo_cmd} sysctl -p "$sysctl_file" >/dev/null || true
  log_success "Persistent host tuning applied: vm.overcommit_memory=1"
}

ensure_network() {
  local network_name="$1"
  if [[ "$network_name" == "host" || "$network_name" == "bridge" || "$network_name" == "none" || -z "$network_name" ]]; then
    log_error "Invalid external Traefik network: $network_name"
    log_error "Set TRAEFIK_EXTERNAL_NETWORK to a user-defined network (example: vex-traefik)."
    exit 1
  fi

  if docker network inspect "$network_name" >/dev/null 2>&1; then
    log_success "Docker network exists: $network_name"
  else
    docker network create "$network_name" >/dev/null
    log_success "Docker network created: $network_name"
  fi
}

ensure_runtime_dirs() {
  mkdir -p logs uploads backups
  chown -R 1001:1001 logs uploads >/dev/null 2>&1 || true
  chmod -R 755 logs uploads >/dev/null 2>&1 || true
  log_success "Runtime directories prepared (logs/uploads/backups)"
}

sync_database_role_password() {
  local db_user="$1"
  local db_name="$2"
  local db_password="$3"

  if [[ -z "$db_user" || -z "$db_name" || -z "$db_password" ]]; then
    log_warn "Skipping DB role password sync: missing POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD"
    return 0
  fi

  if [[ ! "$db_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    log_warn "Skipping DB role password sync: unsupported POSTGRES_USER format"
    return 0
  fi

  local escaped_password
  escaped_password="${db_password//\'/\'\'}"

  docker exec -u postgres vex-db psql -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE \"$db_user\" WITH PASSWORD '$escaped_password';" >/dev/null

  log_success "Database role password synchronized for $db_user"
}

container_has_network() {
  local container="$1"
  local network_name="$2"
  docker inspect "$container" --format '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' | grep -Fxq "$network_name"
}

cleanup_mobile_release_artifacts() {
  local release_dirs=(
    "client/public/downloads"
    "dist/public/downloads"
  )

  local official_files=(
    "VEX-official-release.apk"
    "VEX-official-release.aab"
  )

  local removed_count=0
  local dir
  local path
  local file_name
  local keep_file

  for dir in "${release_dirs[@]}"; do
    if [[ ! -d "$dir" ]]; then
      continue
    fi

    while IFS= read -r path; do
      [[ -z "$path" ]] && continue

      file_name="$(basename "$path")"
      keep_file=false
      for official in "${official_files[@]}"; do
        if [[ "$file_name" == "$official" ]]; then
          keep_file=true
          break
        fi
      done

      if [[ "$keep_file" == true ]]; then
        continue
      fi

      rm -f "$path"
      removed_count=$((removed_count + 1))
      log_info "Removed mobile release artifact: $path"
    done < <(find "$dir" -maxdepth 1 -type f \( -name '*.apk' -o -name '*.aab' \))
  done

  if (( removed_count == 0 )); then
    log_info "No mobile release artifacts found to remove"
  else
    log_success "Removed $removed_count mobile release artifact(s)"
  fi
}

print_header() {
  echo "========================================"
  echo "  VEX Production Auto Bootstrap"
  echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
  echo "========================================"
}

require_command docker
require_command git
require_command curl

if ! docker compose version >/dev/null 2>&1; then
  log_error "docker compose v2 is required"
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log_error "Compose file not found: $COMPOSE_FILE"
  exit 1
fi

ensure_env_file_exists
validate_required_env
validate_compose_social_env_wiring

print_header

if [[ "$PULL_LATEST" == "true" ]]; then
  log_info "Pulling latest code from origin/main"
  git fetch origin main
  git pull --ff-only origin main
fi

cleanup_mobile_release_artifacts

TRAEFIK_CONTAINER="$(detect_traefik_container)"
if traefik_container_exists; then
  TRAEFIK_CONTAINER_MODE="$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$TRAEFIK_CONTAINER" 2>/dev/null || true)"
  log_info "Detected Traefik container: $TRAEFIK_CONTAINER (network mode: ${TRAEFIK_CONTAINER_MODE:-unknown})"
else
  TRAEFIK_CONTAINER_MODE=""
  log_warn "No running Traefik container detected. Falling back to default Traefik network heuristics."
fi

TRAEFIK_NETWORK="$(detect_traefik_network)"
log_info "Using Traefik network: $TRAEFIK_NETWORK"

upsert_env NODE_ENV production
upsert_env APP_URL "https://$DOMAIN"
upsert_env TRAEFIK_EXTERNAL_NETWORK "$TRAEFIK_NETWORK"
upsert_env ALLOW_FORCE_MIGRATIONS false

ensure_host_sysctl
ensure_network "$TRAEFIK_NETWORK"
ensure_runtime_dirs

compose_cmd=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
voice_compose_cmd=(docker compose -p "$VOICE_PROJECT_NAME" -f "$VOICE_COMPOSE_FILE" --env-file "$ENV_FILE")

log_info "Starting dependency services"
"${compose_cmd[@]}" up -d db redis minio ai-agent

if ! wait_for_container_health vex-db 180; then
  log_error "Database container did not become healthy in time"
  docker logs --tail 80 vex-db || true
  exit 1
fi

DB_USER="$(read_env POSTGRES_USER)"
DB_NAME="$(read_env POSTGRES_DB)"
DB_PASSWORD="$(read_env POSTGRES_PASSWORD)"

sync_database_role_password "$DB_USER" "${DB_NAME:-vex_db}" "$DB_PASSWORD"

log_info "Deploying application service"
if [[ "$NO_BUILD" == "true" ]]; then
  "${compose_cmd[@]}" up -d app
else
  "${compose_cmd[@]}" up -d --build app
fi

if ! wait_for_container_health vex-app 180; then
  if docker logs --tail 300 vex-app 2>&1 | grep -q "password authentication failed for user \"${DB_USER}\""; then
    log_warn "Detected database credential mismatch. Re-syncing role password and recreating app once..."
    sync_database_role_password "$DB_USER" "${DB_NAME:-vex_db}" "$DB_PASSWORD"
    "${compose_cmd[@]}" up -d --force-recreate --no-deps app
  fi

  if ! wait_for_container_health vex-app 180; then
    log_error "Application container did not become healthy in time"
    docker logs --tail 120 vex-app || true
    exit 1
  fi
fi

if [[ "$TRAEFIK_CONTAINER_MODE" == "host" ]]; then
  if container_has_network vex-app "$TRAEFIK_NETWORK"; then
    log_success "vex-app is attached to Traefik network: $TRAEFIK_NETWORK"
  else
    log_warn "vex-app is not attached to $TRAEFIK_NETWORK, but Traefik runs in host mode so host-published ports can still work."
  fi
elif ! container_has_network vex-app "$TRAEFIK_NETWORK"; then
  log_error "vex-app is not attached to Traefik network: $TRAEFIK_NETWORK"
  exit 1
fi

if traefik_container_exists; then
  if [[ "$TRAEFIK_CONTAINER_MODE" == "host" ]]; then
    log_warn "$TRAEFIK_CONTAINER is running in host network mode; skipping shared-network attachment check"
  elif ! container_has_network "$TRAEFIK_CONTAINER" "$TRAEFIK_NETWORK"; then
    log_error "$TRAEFIK_CONTAINER is not attached to network: $TRAEFIK_NETWORK"
    exit 1
  fi
fi

if ! wait_for_http_code_200 "http://127.0.0.1:3001/api/health" 120; then
  log_error "Local app health endpoint did not return 200"
  docker logs --tail 120 vex-app || true
  exit 1
fi

if [[ "$SKIP_VOICE" == "true" ]]; then
  log_warn "Voice stack bootstrap skipped by flag (--skip-voice)"
elif [[ ! -f "$VOICE_COMPOSE_FILE" ]]; then
  log_warn "Voice compose file not found: $VOICE_COMPOSE_FILE"
  log_warn "Skipping voice stack bootstrap"
elif ! voice_env_is_ready; then
  log_warn "Skipping voice stack bootstrap due to missing/placeholder voice env"
else
  # Cleanup old project labels to avoid container-name conflicts during migration.
  docker compose -p deploy -f "$VOICE_COMPOSE_FILE" --env-file "$ENV_FILE" down >/dev/null 2>&1 || true
  docker compose -p "$VOICE_PROJECT_NAME" -f "$VOICE_COMPOSE_FILE" --env-file "$ENV_FILE" down >/dev/null 2>&1 || true

  log_info "Starting voice services (livekit/coturn)"
  "${voice_compose_cmd[@]}" up -d livekit coturn

  if ! wait_for_container_health vex-livekit 120; then
    log_error "LiveKit container did not become running in time"
    docker logs --tail 120 vex-livekit || true
    exit 1
  fi

  if ! wait_for_container_health vex-coturn 120; then
    log_error "coturn container did not become running in time"
    docker logs --tail 120 vex-coturn || true
    exit 1
  fi

  log_success "Voice stack is running"
fi

if traefik_container_exists; then
  if ! wait_for_http_code_200 "https://127.0.0.1/api/health" 120 "$DOMAIN"; then
    log_error "Traefik route check failed for domain: $DOMAIN"
    exit 1
  fi
fi

log_success "Production deployment is healthy and Traefik wiring is valid"
echo ""
echo "Runbook summary:"
echo "- Env file: $ENV_FILE"
echo "- Compose file: $COMPOSE_FILE"
echo "- Voice compose file: $VOICE_COMPOSE_FILE"
echo "- Voice project: $VOICE_PROJECT_NAME"
echo "- Traefik network: $TRAEFIK_NETWORK"
echo "- Domain: $DOMAIN"
echo ""
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps"
echo "  docker logs -f vex-app"
if traefik_container_exists; then
  echo "  docker logs -f $TRAEFIK_CONTAINER"
fi
echo "  curl -k -I https://127.0.0.1 -H \"Host: $DOMAIN\""
