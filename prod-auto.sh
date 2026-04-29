#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_REPO_DIR="/docker/vex"

DEFAULT_REPO_URL="git@github.com:duxexch/vexo.git"
DEFAULT_REPO_BRANCH="main"
DEFAULT_DOMAIN="vixo.click"

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
ENV_FILE_INPUT=".env"
COMPOSE_FILE_INPUT="docker-compose.prod.yml"
VOICE_COMPOSE_FILE_INPUT="deploy/docker-compose.voice.yml"
VOICE_SYSCTL_COMPOSE_FILE_INPUT="deploy/docker-compose.voice.linux-sysctl.yml"
VOICE_STACK_MODE="auto"
AUTO_ENV_VALUES="true"
NON_INTERACTIVE="false"
SKIP_REPO_SETUP="false"
PULL_LATEST="false"
IMAGE_REFRESH_MODE="auto"
POST_DEPLOY_VERIFY="true"

CORE_FORWARD_ARGS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
  cat <<'EOF'
Usage: ./prod-auto.sh [options]

First-run bootstrap script:
- Creates/validates repo path
- Configures Git auth (SSH or GitHub token)
- Validates and auto-repairs .env (server-safe defaults + generated keys)
- Validates LIVEKIT/TURN voice env values and normalizes LIVEKIT_KEYS format
- Runs strict production deployment
- Rebuilds ai-agent service to ensure latest AI code is applied
- Verifies env values are loaded correctly in vex-app container
- Ensures voice stack containers (livekit + coturn) are running when voice compose exists

Options:
  --repo-dir <path>           Target repository directory (default: /docker/vex if present)
  --repo-url <url>            Git repository URL (default: git@github.com:duxexch/vexo.git)
  --branch <name>             Branch to use (default: main)
  --auth-mode <auto|ssh|token> Git auth mode (default: auto)
  --github-token <token>      GitHub token (prefer env var GITHUB_TOKEN)
  --env-file <path>           Env file path (default: .env)
  --compose-file <path>       Compose file path (default: docker-compose.prod.yml)
  --voice-compose-file <path> Voice compose file (default: deploy/docker-compose.voice.yml)
  --voice-sysctl-file <path>  Voice sysctl overlay compose file
  --enable-voice-stack        Force voice stack deployment
  --disable-voice-stack       Skip voice stack deployment
  --refresh-images            Pull latest upstream images for infra/voice services
  --skip-image-refresh        Skip pulling upstream images (even on --pull-latest)
  --skip-post-verify          Skip deep post-deploy runtime verification
  --auto-env-values           Auto-generate/fill missing required .env values (default)
  --prompt-env-values         Ask interactively for missing required .env values
  --skip-repo-setup           Skip path/repo/ssh setup (used by update script)
  --pull-latest               Pull latest code before deploy
  --non-interactive           Fail on invalid env values instead of prompting
  -h, --help                  Show this help

Any unknown options are forwarded to scripts/prod-auto.sh.
EOF
}

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

should_refresh_images() {
  case "$IMAGE_REFRESH_MODE" in
    true)
      return 0
      ;;
    false)
      return 1
      ;;
    *)
      [[ "$PULL_LATEST" == "true" ]]
      ;;
  esac
}

wait_for_http_200() {
  local url="$1"
  local timeout_seconds="${2:-120}"
  local waited=0

  while (( waited < timeout_seconds )); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"

    if [[ "$code" == "200" ]]; then
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

wait_for_container_ready() {
  local container="$1"
  local timeout_seconds="${2:-120}"
  local waited=0

  while (( waited < timeout_seconds )); do
    local state
    state="$(container_runtime_state "$container")"

    if is_container_ready "$state"; then
      return 0
    fi

    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

container_runtime_state() {
  local container="$1"
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true
}

is_container_ready() {
  local state="$1"
  [[ "$state" == "healthy" || "$state" == "running" ]]
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

strip_wrapping_quotes() {
  local value="${1:-}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  fi
  printf '%s' "$value"
}

normalize_livekit_keys_value() {
  local raw
  raw="$(strip_wrapping_quotes "${1:-}")"
  raw="${raw//$'\r'/}"
  raw="$(printf '%s' "$raw" | sed -E 's/:[[:space:]]*/: /g; s/,[[:space:]]*/, /g')"
  printf '%s' "$raw"
}

is_valid_livekit_keys() {
  local value
  value="$(normalize_livekit_keys_value "${1:-}")"
  [[ -n "$value" && "$value" =~ ^[A-Za-z0-9._-]+:\ [^,[:space:]][^,]*([[:space:]]*,[[:space:]]*[A-Za-z0-9._-]+:\ [^,[:space:]][^,]*)*$ ]]
}

is_valid_ipv4() {
  [[ "${1:-}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

detect_public_ipv4() {
  local ip=""

  if command -v curl >/dev/null 2>&1; then
    ip="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
    if [[ -z "$ip" ]]; then
      ip="$(curl -fsS --max-time 4 https://ipv4.icanhazip.com 2>/dev/null | tr -d '\r\n' || true)"
    fi
  fi

  ip="${ip//$'\r'/}"
  ip="${ip//$'\n'/}"

  if is_valid_ipv4 "$ip"; then
    printf '%s' "$ip"
  else
    printf ''
  fi
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
    log_info "Git auth mode: token (token is used in-memory only)"
  else
    REPO_URL="$(to_ssh_url "$REPO_URL")"
    log_info "Git auth mode: ssh"
  fi
}

generate_secret_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

extract_domain_from_env() {
  local app_url
  app_url="$(read_env APP_URL)"
  app_url="${app_url#*://}"
  app_url="${app_url%%/*}"
  if [[ -z "$app_url" ]]; then
    printf '%s' "$DEFAULT_DOMAIN"
  else
    printf '%s' "$app_url"
  fi
}

value_is_placeholder() {
  local value="${1:-}"
  local lowered="${value,,}"
  [[ -z "$value" || "$lowered" =~ change_me|replace_with|your_|example|placeholder|xxxx|changeme|replace-me|replace_me ]]
}

is_valid_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

is_reserved_network() {
  local network="${1:-}"
  [[ -z "$network" || "$network" == "host" || "$network" == "bridge" || "$network" == "none" ]]
}

is_valid_key_value() {
  local key="$1"
  local value="$2"

  case "$key" in
    POSTGRES_USER)
      [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]{1,62}$ ]] && ! value_is_placeholder "$value"
      ;;
    POSTGRES_DB)
      [[ "$value" =~ ^[A-Za-z0-9_]{1,63}$ ]] && ! value_is_placeholder "$value"
      ;;
    POSTGRES_PASSWORD|REDIS_PASSWORD|MINIO_ROOT_PASSWORD|ADMIN_BOOTSTRAP_PASSWORD)
      [[ ${#value} -ge 10 ]] && ! value_is_placeholder "$value"
      ;;
    SESSION_SECRET|JWT_SIGNING_KEY|ADMIN_JWT_SECRET|SECRETS_ENCRYPTION_KEY)
      [[ ${#value} -ge 32 ]] && ! value_is_placeholder "$value"
      ;;
    AI_AGENT_SHARED_TOKEN|AI_AGENT_PAYLOAD_SALT|AI_AGENT_PRIVACY_SALT)
      [[ ${#value} -ge 16 ]] && ! value_is_placeholder "$value"
      ;;
    INTERNAL_SERVICE_TOKEN)
      [[ ${#value} -ge 32 ]] && ! value_is_placeholder "$value"
      ;;
    MINIO_ROOT_USER|ADMIN_BOOTSTRAP_USERNAME)
      [[ "$value" =~ ^[A-Za-z0-9._-]{3,64}$ ]] && ! value_is_placeholder "$value"
      ;;
    ADMIN_BOOTSTRAP_EMAIL|ADMIN_RECOVERY_EMAIL)
      is_valid_email "$value"
      ;;
    TRAEFIK_EXTERNAL_NETWORK)
      [[ "$value" =~ ^[A-Za-z0-9_.-]{2,64}$ ]] && ! is_reserved_network "$value"
      ;;
    GOOGLE_ANDROID_LOGIN_MODE)
      [[ "$value" == "sdk-only" || "$value" == "web-fallback" || "$value" == "disabled" ]]
      ;;
    GOOGLE_ANDROID_CLIENT_ID|GOOGLE_CLIENT_ID_ANDROID)
      [[ -n "$value" ]] && ! value_is_placeholder "$value"
      ;;
    *)
      [[ -n "$value" ]]
      ;;
  esac
}

read_env() {
  local key="$1"
  if [[ ! -f "$ENV_FILE_PATH" ]]; then
    printf ''
    return 0
  fi
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE_PATH" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

upsert_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"

  if [[ -f "$ENV_FILE_PATH" ]]; then
    grep -Ev "^${key}=" "$ENV_FILE_PATH" > "$tmp" || true
  fi

  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE_PATH"
}

auto_fill_key_value() {
  local key="$1"
  local default_value="${2:-}"
  local secret="${3:-false}"
  local generated=""

  if [[ "$secret" == "true" ]]; then
    case "$key" in
      SESSION_SECRET|JWT_SIGNING_KEY|ADMIN_JWT_SECRET|SECRETS_ENCRYPTION_KEY|INTERNAL_SERVICE_TOKEN)
        generated="$(generate_secret_hex 48)"
        ;;
      *)
        generated="$(generate_secret_hex 24)"
        ;;
    esac
  elif [[ -n "$default_value" ]]; then
    generated="$default_value"
  else
    return 1
  fi

  if ! is_valid_key_value "$key" "$generated"; then
    return 1
  fi

  upsert_env "$key" "$generated"
  log_warn "Auto-filled missing key: $key"
  return 0
}

prompt_for_key() {
  local key="$1"
  local label="$2"
  local default_value="${3:-}"
  local secret="${4:-false}"

  while true; do
    local current
    current="$(read_env "$key")"
    if is_valid_key_value "$key" "$current"; then
      return 0
    fi

    if [[ "$AUTO_ENV_VALUES" == "true" || "$NON_INTERACTIVE" == "true" ]]; then
      if auto_fill_key_value "$key" "$default_value" "$secret"; then
        return 0
      fi

      if [[ "$AUTO_ENV_VALUES" == "true" ]]; then
        log_error "Failed to auto-fill required env key: $key"
        exit 1
      fi
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      log_error "Invalid or missing env key in non-interactive mode: $key"
      exit 1
    fi

    log_warn "القيمة الحالية لـ $key غير صحيحة أو ناقصة"

    local input
    if [[ "$secret" == "true" ]]; then
      read -r -s -p "$label${default_value:+ [Enter لاستخدام قيمة افتراضية آمنة]}: " input
      echo ""
    else
      read -r -p "$label${default_value:+ [${default_value}]}: " input
    fi

    input="${input%$'\r'}"
    if [[ -z "$input" ]]; then
      if [[ -n "$default_value" ]]; then
        input="$default_value"
      elif [[ "$secret" == "true" ]]; then
        case "$key" in
          SESSION_SECRET|JWT_SIGNING_KEY|ADMIN_JWT_SECRET|SECRETS_ENCRYPTION_KEY)
            input="$(generate_secret_hex 48)"
            ;;
          *)
            input="$(generate_secret_hex 24)"
            ;;
        esac
        log_info "تم توليد قيمة آمنة تلقائيًا لـ $key"
      fi
    fi

    if is_valid_key_value "$key" "$input"; then
      upsert_env "$key" "$input"
      log_ok "تم تحديث $key"
      return 0
    fi

    log_warn "القيمة المدخلة لـ $key غير صالحة، حاول مرة أخرى"
  done
}

ensure_env_file_exists() {
  if [[ -f "$ENV_FILE_PATH" ]]; then
    return 0
  fi

  local template=""
  if [[ -f "$REPO_DIR/.env.example" ]]; then
    template="$REPO_DIR/.env.example"
  elif [[ -f "$REPO_DIR/.env.production" ]]; then
    template="$REPO_DIR/.env.production"
  fi

  if [[ -z "$template" ]]; then
    log_error "No .env template found in repo (checked .env.production and .env.example)"
    exit 1
  fi

  cp "$template" "$ENV_FILE_PATH"
  log_ok "Created env file from template: $ENV_FILE_PATH"
}

sync_alias_env_keys() {
  upsert_env JWT_USER_SECRET "$(read_env JWT_SIGNING_KEY)"
  upsert_env JWT_ADMIN_SECRET "$(read_env ADMIN_JWT_SECRET)"
  upsert_env MINIO_ACCESS_KEY "$(read_env MINIO_ROOT_USER)"
  upsert_env MINIO_SECRET_KEY "$(read_env MINIO_ROOT_PASSWORD)"
}

ensure_google_android_env() {
  local mode
  mode="$(read_env GOOGLE_ANDROID_LOGIN_MODE)"
  mode="${mode,,}"
  mode="${mode:-sdk-only}"

  if ! is_valid_key_value GOOGLE_ANDROID_LOGIN_MODE "$mode"; then
    mode="sdk-only"
  fi
  upsert_env GOOGLE_ANDROID_LOGIN_MODE "$mode"

  if [[ "$mode" != "sdk-only" ]]; then
    return 0
  fi

  local main_id legacy_id
  main_id="$(read_env GOOGLE_ANDROID_CLIENT_ID)"
  legacy_id="$(read_env GOOGLE_CLIENT_ID_ANDROID)"

  if ! is_valid_key_value GOOGLE_ANDROID_CLIENT_ID "$main_id" && ! is_valid_key_value GOOGLE_CLIENT_ID_ANDROID "$legacy_id"; then
    if [[ "$AUTO_ENV_VALUES" == "true" || "$NON_INTERACTIVE" == "true" ]]; then
      upsert_env GOOGLE_ANDROID_LOGIN_MODE "disabled"
      log_warn "GOOGLE_ANDROID_CLIENT_ID is missing; set GOOGLE_ANDROID_LOGIN_MODE=disabled"
      return 0
    fi

    prompt_for_key GOOGLE_ANDROID_CLIENT_ID "ادخل Google Android Client ID" "" false
    main_id="$(read_env GOOGLE_ANDROID_CLIENT_ID)"
    upsert_env GOOGLE_CLIENT_ID_ANDROID "$main_id"
    return 0
  fi

  if is_valid_key_value GOOGLE_ANDROID_CLIENT_ID "$main_id" && ! is_valid_key_value GOOGLE_CLIENT_ID_ANDROID "$legacy_id"; then
    upsert_env GOOGLE_CLIENT_ID_ANDROID "$main_id"
  elif ! is_valid_key_value GOOGLE_ANDROID_CLIENT_ID "$main_id" && is_valid_key_value GOOGLE_CLIENT_ID_ANDROID "$legacy_id"; then
    upsert_env GOOGLE_ANDROID_CLIENT_ID "$legacy_id"
  elif [[ -n "$main_id" && -n "$legacy_id" && "$main_id" != "$legacy_id" ]]; then
    if [[ "$AUTO_ENV_VALUES" == "true" || "$NON_INTERACTIVE" == "true" ]]; then
      upsert_env GOOGLE_CLIENT_ID_ANDROID "$main_id"
      log_warn "Normalized Google Android client id mismatch using GOOGLE_ANDROID_CLIENT_ID"
      return 0
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      log_error "GOOGLE_ANDROID_CLIENT_ID and GOOGLE_CLIENT_ID_ANDROID mismatch in non-interactive mode"
      exit 1
    fi

    log_warn "GOOGLE_ANDROID_CLIENT_ID و GOOGLE_CLIENT_ID_ANDROID غير متطابقين"
    read -r -p "اكتب القيمة النهائية الموحدة لهما: " main_id
    main_id="${main_id%$'\r'}"
    if ! is_valid_key_value GOOGLE_ANDROID_CLIENT_ID "$main_id"; then
      log_error "Invalid Google Android Client ID"
      exit 1
    fi
    upsert_env GOOGLE_ANDROID_CLIENT_ID "$main_id"
    upsert_env GOOGLE_CLIENT_ID_ANDROID "$main_id"
  fi
}

ensure_required_env_values() {
  local domain
  domain="$(extract_domain_from_env)"

  prompt_for_key POSTGRES_USER "ادخل اسم مستخدم PostgreSQL" "vex_user" false
  prompt_for_key POSTGRES_PASSWORD "ادخل كلمة مرور PostgreSQL قوية" "" true
  prompt_for_key POSTGRES_DB "ادخل اسم قاعدة بيانات PostgreSQL" "vex_db" false
  prompt_for_key REDIS_PASSWORD "ادخل كلمة مرور Redis قوية" "" true
  prompt_for_key MINIO_ROOT_USER "ادخل MINIO_ROOT_USER" "vex_minio_admin" false
  prompt_for_key MINIO_ROOT_PASSWORD "ادخل كلمة مرور MinIO قوية" "" true

  prompt_for_key SESSION_SECRET "ادخل SESSION_SECRET بطول 32+" "" true
  prompt_for_key JWT_SIGNING_KEY "ادخل JWT_SIGNING_KEY بطول 32+" "" true
  prompt_for_key ADMIN_JWT_SECRET "ادخل ADMIN_JWT_SECRET بطول 32+" "" true
  prompt_for_key SECRETS_ENCRYPTION_KEY "ادخل SECRETS_ENCRYPTION_KEY بطول 32+" "" true

  prompt_for_key AI_AGENT_SHARED_TOKEN "ادخل AI_AGENT_SHARED_TOKEN بطول 16+" "" true
  prompt_for_key AI_AGENT_PAYLOAD_SALT "ادخل AI_AGENT_PAYLOAD_SALT بطول 16+" "" true
  prompt_for_key AI_AGENT_PRIVACY_SALT "ادخل AI_AGENT_PRIVACY_SALT بطول 16+" "" true

  # Commercial Agents Service (vex-agents-service, port 3002) — required to
  # bring up the agents-service container and to authorize the main-app proxy.
  prompt_for_key INTERNAL_SERVICE_TOKEN "ادخل INTERNAL_SERVICE_TOKEN بطول 32+" "" true

  prompt_for_key ADMIN_BOOTSTRAP_USERNAME "ادخل ADMIN_BOOTSTRAP_USERNAME" "admin" false
  prompt_for_key ADMIN_BOOTSTRAP_PASSWORD "ادخل ADMIN_BOOTSTRAP_PASSWORD قوية" "" true
  prompt_for_key ADMIN_BOOTSTRAP_EMAIL "ادخل ADMIN_BOOTSTRAP_EMAIL" "info@${domain}" false
  prompt_for_key ADMIN_RECOVERY_EMAIL "ادخل ADMIN_RECOVERY_EMAIL" "info@${domain}" false
  prompt_for_key TRAEFIK_EXTERNAL_NETWORK "ادخل اسم شبكة Traefik الخارجية" "vex-traefik" false

  ensure_google_android_env
  sync_alias_env_keys

  ensure_voice_env_values
}

ensure_voice_env_values() {
  if [[ "$VOICE_STACK_MODE" == "false" ]]; then
    return 0
  fi

  if [[ ! -f "$VOICE_COMPOSE_FILE_PATH" ]]; then
    if [[ "$VOICE_STACK_MODE" == "true" ]]; then
      log_error "Voice stack is forced but compose file was not found: $VOICE_COMPOSE_FILE_PATH"
      exit 1
    fi
    return 0
  fi

  local livekit_keys normalized_keys
  livekit_keys="$(read_env LIVEKIT_KEYS)"
  normalized_keys="$(normalize_livekit_keys_value "$livekit_keys")"

  if ! is_valid_livekit_keys "$normalized_keys" || value_is_placeholder "$normalized_keys"; then
    if [[ "$AUTO_ENV_VALUES" == "true" || "$NON_INTERACTIVE" == "true" ]]; then
      normalized_keys="vixo_prod: $(generate_secret_hex 24)"
      upsert_env LIVEKIT_KEYS "$normalized_keys"
      log_warn "Auto-generated LIVEKIT_KEYS"
    else
      while true; do
        log_warn "LIVEKIT_KEYS الحالية غير صالحة. الصيغة المطلوبة: key: secret"
        read -r -p "ادخل LIVEKIT_KEYS (Enter للتوليد التلقائي): " livekit_keys
        livekit_keys="${livekit_keys%$'\r'}"

        if [[ -z "$livekit_keys" ]]; then
          livekit_keys="vixo_prod: $(generate_secret_hex 24)"
          log_info "تم توليد LIVEKIT_KEYS آمن تلقائيًا"
        fi

        normalized_keys="$(normalize_livekit_keys_value "$livekit_keys")"
        if is_valid_livekit_keys "$normalized_keys"; then
          upsert_env LIVEKIT_KEYS "$normalized_keys"
          log_ok "تم تحديث LIVEKIT_KEYS"
          break
        fi
      done
    fi
  else
    upsert_env LIVEKIT_KEYS "$normalized_keys"
  fi

  local turn_ip
  turn_ip="$(read_env TURN_EXTERNAL_IP)"
  turn_ip="$(strip_wrapping_quotes "$turn_ip")"

  if value_is_placeholder "$turn_ip" || ! is_valid_ipv4 "$turn_ip"; then
    turn_ip="$(detect_public_ipv4)"
  fi

  if [[ -z "$turn_ip" ]]; then
    if [[ "$AUTO_ENV_VALUES" == "true" ]]; then
      log_warn "TURN_EXTERNAL_IP could not be auto-detected; voice stack will be skipped"
      VOICE_STACK_MODE="false"
      return 0
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      log_error "TURN_EXTERNAL_IP is missing/invalid and could not be auto-detected"
      exit 1
    fi

    while true; do
      read -r -p "ادخل TURN_EXTERNAL_IP (IPv4 public): " turn_ip
      turn_ip="${turn_ip%$'\r'}"
      if is_valid_ipv4 "$turn_ip"; then
        break
      fi
      log_warn "TURN_EXTERNAL_IP غير صالح"
    done
  fi
  upsert_env TURN_EXTERNAL_IP "$turn_ip"

  local turn_realm turn_username turn_password
  turn_realm="$(read_env TURN_REALM)"
  turn_username="$(read_env TURN_USERNAME)"
  turn_password="$(read_env TURN_PASSWORD)"

  if value_is_placeholder "$turn_realm"; then
    turn_realm="$(extract_domain_from_env)"
  fi
  if value_is_placeholder "$turn_username"; then
    turn_username="vex_turn_user"
  fi
  if value_is_placeholder "$turn_password" || [[ ${#turn_password} -lt 10 ]]; then
    turn_password="$(generate_secret_hex 24)"
    log_info "Generated TURN_PASSWORD automatically"
  fi

  upsert_env TURN_REALM "$turn_realm"
  upsert_env TURN_USERNAME "$turn_username"
  upsert_env TURN_PASSWORD "$turn_password"

  # ----------------------------------------------------------------
  # CANONICAL: ephemeral HMAC credentials for coturn (use-auth-secret)
  # ----------------------------------------------------------------
  # The bundled coturn config (deploy/coturn/turnserver.conf.template)
  # runs with `use-auth-secret`, which means it ONLY accepts time-limited
  # HMAC-SHA1 credentials signed by the backend with TURN_STATIC_SECRET.
  # Without this, in-game voice and friend voice calls cannot establish a
  # relay path on cellular/symmetric-NAT networks → no audio.
  local turn_static_secret turn_host
  turn_static_secret="$(read_env TURN_STATIC_SECRET)"
  if value_is_placeholder "$turn_static_secret" || [[ ${#turn_static_secret} -lt 32 ]]; then
    turn_static_secret="$(generate_secret_hex 32)"
    log_info "Generated TURN_STATIC_SECRET automatically"
  fi
  upsert_env TURN_STATIC_SECRET "$turn_static_secret"

  turn_host="$(read_env TURN_HOST)"
  if value_is_placeholder "$turn_host"; then
    # Prefer turn.<domain> if a domain is configured; otherwise fall back to IP
    local app_domain
    app_domain="$(extract_domain_from_env)"
    if [[ -n "$app_domain" && "$app_domain" != "localhost" ]]; then
      turn_host="turn.${app_domain}"
    else
      turn_host="$turn_ip"
    fi
    log_info "Defaulted TURN_HOST to ${turn_host}"
  fi
  upsert_env TURN_HOST "$turn_host"

  # Sensible defaults for ports/TTL (overridable in .env)
  local turn_port turn_tls_port turn_ttl stun_extra
  turn_port="$(read_env TURN_PORT)"
  turn_tls_port="$(read_env TURN_TLS_PORT)"
  turn_ttl="$(read_env TURN_TTL_SECONDS)"
  stun_extra="$(read_env STUN_URLS)"
  [[ -z "$turn_port" || "$turn_port" =~ [^0-9] ]] && turn_port="3478"
  [[ -z "$turn_tls_port" || "$turn_tls_port" =~ [^0-9] ]] && turn_tls_port="5349"
  [[ -z "$turn_ttl" || "$turn_ttl" =~ [^0-9] ]] && turn_ttl="3600"
  if value_is_placeholder "$stun_extra"; then
    stun_extra="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
  fi
  upsert_env TURN_PORT "$turn_port"
  upsert_env TURN_TLS_PORT "$turn_tls_port"
  upsert_env TURN_TTL_SECONDS "$turn_ttl"
  upsert_env STUN_URLS "$stun_extra"

  # ----------------------------------------------------------------
  # LEGACY: static-credential fallback. Left empty in production by
  # design — coturn rejects static creds when `use-auth-secret` is on.
  # ----------------------------------------------------------------
  local stun_urls
  stun_urls="$(read_env PUBLIC_RTC_STUN_URLS)"
  if value_is_placeholder "$stun_urls"; then
    stun_urls="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
  fi
  upsert_env PUBLIC_RTC_STUN_URLS "$stun_urls"

  local ice_policy
  ice_policy="$(read_env PUBLIC_RTC_ICE_TRANSPORT_POLICY)"
  ice_policy="${ice_policy,,}"
  if [[ "$ice_policy" != "all" && "$ice_policy" != "relay" ]]; then
    ice_policy="all"
  fi
  upsert_env PUBLIC_RTC_ICE_TRANSPORT_POLICY "$ice_policy"
}

ensure_repo_exists() {
  mkdir -p "$REPO_DIR"

  if [[ -d "$REPO_DIR/.git" ]]; then
    return 0
  fi

  if find "$REPO_DIR" -mindepth 1 -maxdepth 1 | read -r _; then
    log_error "Target repo directory exists and is not empty: $REPO_DIR"
    log_error "Initialize it manually or choose an empty path with --repo-dir"
    exit 1
  fi

  log_info "Cloning repository into $REPO_DIR"

  if [[ "$USE_TOKEN_AUTH" == "true" ]]; then
    local token_url
    token_url="$(to_token_url "$REPO_URL" "$GITHUB_TOKEN_VALUE")"
    git clone --branch "$REPO_BRANCH" "$token_url" "$REPO_DIR"

    # Keep origin clean (without embedded token) after clone.
    git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
    return 0
  fi

  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
}

ensure_origin_ssh() {
  local origin_url
  origin_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

  if [[ -z "$origin_url" ]]; then
    git -C "$REPO_DIR" remote add origin "$REPO_URL"
    origin_url="$REPO_URL"
  fi

  local ssh_url
  ssh_url="$(to_ssh_url "$origin_url")"
  if [[ "$ssh_url" != "$origin_url" ]]; then
    git -C "$REPO_DIR" remote set-url origin "$ssh_url"
    log_ok "Converted origin remote to SSH: $ssh_url"
  fi
}

ensure_origin_https() {
  local origin_url
  origin_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

  if [[ -z "$origin_url" ]]; then
    git -C "$REPO_DIR" remote add origin "$REPO_URL"
    return 0
  fi

  local https_url
  https_url="$(to_https_url "$origin_url")"
  if [[ "$https_url" != "$origin_url" || "$origin_url" != "$REPO_URL" ]]; then
    git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
    log_ok "Normalized origin remote URL for token auth"
  fi
}

ensure_ssh_auth() {
  local ssh_dir="$HOME/.ssh"
  local key_path="$ssh_dir/id_ed25519"

  mkdir -p "$ssh_dir"
  chmod 700 "$ssh_dir"

  if [[ ! -f "$key_path" ]]; then
    log_info "Generating SSH key for GitHub auth"
    ssh-keygen -t ed25519 -C "vexo-deploy@$(hostname)" -f "$key_path" -N "" >/dev/null
    log_ok "SSH key generated: $key_path"
  fi

  touch "$ssh_dir/known_hosts"
  chmod 600 "$ssh_dir/known_hosts"
  ssh-keyscan -H github.com >> "$ssh_dir/known_hosts" 2>/dev/null || true

  eval "$(ssh-agent -s)" >/dev/null
  ssh-add "$key_path" >/dev/null 2>&1 || true

  local public_key
  public_key="$(cat "${key_path}.pub")"

  local attempts=0
  while ! GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" git -C "$REPO_DIR" ls-remote --heads origin "$REPO_BRANCH" >/dev/null 2>&1; do
    attempts=$((attempts + 1))

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      log_error "Git SSH auth failed in non-interactive mode"
      log_error "Add this SSH key to GitHub Deploy Keys / SSH Keys first:"
      echo "$public_key"
      exit 1
    fi

    log_warn "GitHub SSH auth is not ready yet"
    echo ""
    echo "انسخ المفتاح التالي إلى GitHub > Settings > SSH and GPG keys:"
    echo "$public_key"
    echo ""
    read -r -p "بعد الإضافة اضغط Enter لإعادة المحاولة... " _

    if (( attempts >= 10 )); then
      log_error "Failed to verify GitHub SSH access after multiple attempts"
      exit 1
    fi
  done

  log_ok "GitHub SSH auth verified (no password pull/push)"
}

run_core_deploy() {
  local core_script="$REPO_DIR/scripts/prod-auto.sh"

  if [[ ! -f "$core_script" ]]; then
    log_error "Core deployment script not found: $core_script"
    exit 1
  fi

  local cmd=(bash "$core_script" --env-file "$ENV_FILE_PATH" --compose-file "$COMPOSE_FILE_PATH")

  if [[ "$PULL_LATEST" == "true" && "$USE_TOKEN_AUTH" != "true" ]]; then
    cmd+=(--pull-latest)
  fi

  if (( ${#CORE_FORWARD_ARGS[@]} > 0 )); then
    cmd+=("${CORE_FORWARD_ARGS[@]}")
  fi

  log_info "Running strict production deploy"
  "${cmd[@]}"
}

pull_latest_with_token_if_needed() {
  if [[ "$PULL_LATEST" != "true" || "$USE_TOKEN_AUTH" != "true" ]]; then
    return 0
  fi

  local token_url
  token_url="$(to_token_url "$REPO_URL" "$GITHUB_TOKEN_VALUE")"

  log_info "Pulling latest code using token auth"
  git -C "$REPO_DIR" pull --ff-only "$token_url" "$REPO_BRANCH"
}

refresh_upstream_images_if_needed() {
  if ! should_refresh_images; then
    return 0
  fi

  log_info "Refreshing upstream images for infrastructure services"

  local compose_cmd=(docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")
  local service

  for service in db redis minio; do
    if "${compose_cmd[@]}" pull "$service" >/dev/null 2>&1; then
      log_ok "Pulled image: $service"
    else
      log_warn "Could not pull image for $service (continuing)"
    fi
  done

  if [[ "$VOICE_STACK_MODE" == "false" || ! -f "$VOICE_COMPOSE_FILE_PATH" ]]; then
    return 0
  fi

  local voice_cmd=(docker compose -f "$VOICE_COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")

  for service in livekit coturn; do
    if "${voice_cmd[@]}" pull "$service" >/dev/null 2>&1; then
      log_ok "Pulled image: $service"
    else
      log_warn "Could not pull image for $service (continuing)"
    fi
  done
}

rebuild_ai_agent_service() {
  local compose_cmd=(docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")

  if ! "${compose_cmd[@]}" config --services 2>/dev/null | grep -Fxq 'ai-agent'; then
    log_info "Service ai-agent is not defined in compose; skipping ai-agent rebuild"
    return 0
  fi

  log_info "Rebuilding ai-agent service to apply latest source code"
  if ! "${compose_cmd[@]}" up -d --build ai-agent; then
    log_error "Failed to rebuild ai-agent service"
    return 1
  fi

  if ! wait_for_container_ready vex-ai-agent 180; then
    local agent_state
    agent_state="$(container_runtime_state vex-ai-agent)"
    log_error "ai-agent container check failed after rebuild (state: ${agent_state:-missing})"
    docker logs --tail 120 vex-ai-agent 2>/dev/null || true
    return 1
  fi

  log_ok "ai-agent rebuilt and running"
}

# vex-agents-service is the standalone commercial-agents container (port 3002).
# It is a peer of vex-ai-agent and follows the same rebuild/wait pattern. Older
# repo snapshots may not yet declare the service in compose; in that case we
# log and skip (idempotent / safe to re-run on legacy hosts).
rebuild_agents_service() {
  local compose_cmd=(docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")

  if ! "${compose_cmd[@]}" config --services 2>/dev/null | grep -Fxq 'agents-service'; then
    log_info "Service agents-service is not defined in compose; skipping agents-service rebuild"
    return 0
  fi

  log_info "Rebuilding agents-service to apply latest source code"
  if ! "${compose_cmd[@]}" up -d --build agents-service; then
    log_error "Failed to rebuild agents-service"
    return 1
  fi

  if ! wait_for_container_ready vex-agents-service 180; then
    local svc_state
    svc_state="$(container_runtime_state vex-agents-service)"
    log_error "agents-service container check failed after rebuild (state: ${svc_state:-missing})"
    docker logs --tail 120 vex-agents-service 2>/dev/null || true
    return 1
  fi

  log_ok "agents-service rebuilt and running"
}

container_env_value() {
  local env_dump="$1"
  local key="$2"
  printf '%s\n' "$env_dump" | grep -E "^${key}=" | tail -n 1 | cut -d= -f2- || true
}

collect_runtime_mismatch_keys() {
  local app_env
  app_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' vex-app 2>/dev/null || true)"

  if [[ -z "$app_env" ]]; then
    printf 'APP_CONTAINER_MISSING\n'
    return 0
  fi

  local -A mismatch=()
  local expected actual

  expected="$(read_env SESSION_SECRET)"
  actual="$(container_env_value "$app_env" SESSION_SECRET)"
  [[ "$expected" == "$actual" ]] || mismatch[SESSION_SECRET]=1

  expected="$(read_env JWT_SIGNING_KEY)"
  actual="$(container_env_value "$app_env" JWT_USER_SECRET)"
  [[ "$expected" == "$actual" ]] || mismatch[JWT_SIGNING_KEY]=1

  expected="$(read_env ADMIN_JWT_SECRET)"
  actual="$(container_env_value "$app_env" JWT_ADMIN_SECRET)"
  [[ "$expected" == "$actual" ]] || mismatch[ADMIN_JWT_SECRET]=1

  expected="$(read_env SECRETS_ENCRYPTION_KEY)"
  actual="$(container_env_value "$app_env" SECRETS_ENCRYPTION_KEY)"
  [[ "$expected" == "$actual" ]] || mismatch[SECRETS_ENCRYPTION_KEY]=1

  expected="$(read_env MINIO_ROOT_USER)"
  actual="$(container_env_value "$app_env" MINIO_ACCESS_KEY)"
  [[ "$expected" == "$actual" ]] || mismatch[MINIO_ROOT_USER]=1

  expected="$(read_env MINIO_ROOT_PASSWORD)"
  actual="$(container_env_value "$app_env" MINIO_SECRET_KEY)"
  [[ "$expected" == "$actual" ]] || mismatch[MINIO_ROOT_PASSWORD]=1

  local db_url redis_url
  db_url="$(container_env_value "$app_env" DATABASE_URL)"
  redis_url="$(container_env_value "$app_env" REDIS_URL)"

  local db_user db_pass db_name redis_pass
  db_user="$(read_env POSTGRES_USER)"
  db_pass="$(read_env POSTGRES_PASSWORD)"
  db_name="$(read_env POSTGRES_DB)"
  redis_pass="$(read_env REDIS_PASSWORD)"

  if [[ "$db_url" != *"${db_user}"* || "$db_url" != *"${db_pass}"* || "$db_url" != *"/${db_name}"* ]]; then
    mismatch[POSTGRES_USER]=1
    mismatch[POSTGRES_PASSWORD]=1
    mismatch[POSTGRES_DB]=1
  fi

  if [[ "$redis_url" != *"${redis_pass}"* ]]; then
    mismatch[REDIS_PASSWORD]=1
  fi

  local key
  for key in "${!mismatch[@]}"; do
    printf '%s\n' "$key"
  done
}

repair_runtime_mismatches_if_needed() {
  local attempts=0

  while (( attempts < 3 )); do
    mapfile -t mismatch_keys < <(collect_runtime_mismatch_keys)

    if [[ ${#mismatch_keys[@]} -eq 0 ]]; then
      log_ok "Runtime env validation passed inside vex-app"
      return 0
    fi

    attempts=$((attempts + 1))
    log_warn "Detected env mismatch after deployment (attempt $attempts/3)"

    if [[ " ${mismatch_keys[*]} " == *" APP_CONTAINER_MISSING "* ]]; then
      log_warn "vex-app container not found. Redeploying..."
      run_core_deploy
      continue
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      log_error "Runtime env mismatch in non-interactive mode: ${mismatch_keys[*]}"
      return 1
    fi

    local key
    for key in "${mismatch_keys[@]}"; do
      case "$key" in
        POSTGRES_USER)
          prompt_for_key POSTGRES_USER "ادخل اسم مستخدم PostgreSQL الصحيح" "vex_user" false
          ;;
        POSTGRES_PASSWORD)
          prompt_for_key POSTGRES_PASSWORD "ادخل كلمة مرور PostgreSQL الصحيحة" "" true
          ;;
        POSTGRES_DB)
          prompt_for_key POSTGRES_DB "ادخل اسم قاعدة بيانات PostgreSQL الصحيح" "vex_db" false
          ;;
        REDIS_PASSWORD)
          prompt_for_key REDIS_PASSWORD "ادخل كلمة مرور Redis الصحيحة" "" true
          ;;
        MINIO_ROOT_USER)
          prompt_for_key MINIO_ROOT_USER "ادخل MINIO_ROOT_USER الصحيح" "vex_minio_admin" false
          ;;
        MINIO_ROOT_PASSWORD)
          prompt_for_key MINIO_ROOT_PASSWORD "ادخل كلمة مرور MinIO الصحيحة" "" true
          ;;
        SESSION_SECRET)
          prompt_for_key SESSION_SECRET "ادخل SESSION_SECRET الصحيح" "" true
          ;;
        JWT_SIGNING_KEY)
          prompt_for_key JWT_SIGNING_KEY "ادخل JWT_SIGNING_KEY الصحيح" "" true
          ;;
        ADMIN_JWT_SECRET)
          prompt_for_key ADMIN_JWT_SECRET "ادخل ADMIN_JWT_SECRET الصحيح" "" true
          ;;
        SECRETS_ENCRYPTION_KEY)
          prompt_for_key SECRETS_ENCRYPTION_KEY "ادخل SECRETS_ENCRYPTION_KEY الصحيح" "" true
          ;;
      esac
    done

    sync_alias_env_keys
    run_core_deploy
  done

  log_error "Failed to reconcile runtime env mismatches after 3 attempts"
  return 1
}

run_voice_stack_deploy_if_needed() {
  if [[ "$VOICE_STACK_MODE" == "false" ]]; then
    log_info "Voice stack deployment skipped (--disable-voice-stack)"
    return 0
  fi

  if [[ ! -f "$VOICE_COMPOSE_FILE_PATH" ]]; then
    if [[ "$VOICE_STACK_MODE" == "true" ]]; then
      log_error "Voice compose file not found: $VOICE_COMPOSE_FILE_PATH"
      return 1
    fi
    return 0
  fi

  log_info "Deploying voice stack (livekit + coturn)"
  docker rm -f vex-livekit vex-coturn >/dev/null 2>&1 || true

  if [[ -f "$VOICE_SYSCTL_COMPOSE_FILE_PATH" ]]; then
    if ! docker compose -f "$VOICE_COMPOSE_FILE_PATH" -f "$VOICE_SYSCTL_COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH" up -d --force-recreate --remove-orphans livekit coturn; then
      log_warn "Voice sysctl overlay failed, retrying with base voice compose"
      docker compose -f "$VOICE_COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH" up -d --force-recreate --remove-orphans livekit coturn
    fi
  else
    docker compose -f "$VOICE_COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH" up -d --force-recreate --remove-orphans livekit coturn
  fi

  local livekit_state coturn_state
  livekit_state="$(docker inspect --format '{{.State.Status}}' vex-livekit 2>/dev/null || true)"
  coturn_state="$(docker inspect --format '{{.State.Status}}' vex-coturn 2>/dev/null || true)"

  if [[ "$livekit_state" != "running" ]]; then
    log_error "LiveKit container is not running (state: ${livekit_state:-missing})"
    docker logs --tail 80 vex-livekit 2>/dev/null || true
    return 1
  fi

  if [[ "$coturn_state" != "running" ]]; then
    log_error "Coturn container is not running (state: ${coturn_state:-missing})"
    docker logs --tail 80 vex-coturn 2>/dev/null || true
    return 1
  fi

  log_ok "Voice stack is running (vex-livekit + vex-coturn)"
}

verify_post_deploy_stack() {
  local required_containers=(vex-db vex-redis vex-minio vex-ai-agent vex-app)
  local container state

  # vex-agents-service is required only when the service is declared in the
  # active compose file. This keeps the verification compatible with legacy
  # compose snapshots that predate the agents-service split.
  local compose_cmd=(docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")
  if "${compose_cmd[@]}" config --services 2>/dev/null | grep -Fxq 'agents-service'; then
    required_containers+=(vex-agents-service)
  fi

  for container in "${required_containers[@]}"; do
    state="$(container_runtime_state "$container")"
    if ! is_container_ready "$state"; then
      log_error "Container check failed: $container (state: ${state:-missing})"
      docker logs --tail 80 "$container" 2>/dev/null || true
      return 1
    fi
  done

  # Verify the agents-service /health endpoint responds inside the container.
  # Port 3002 is intentionally not published to the host (the main app reaches
  # it on the internal docker network), so we exec into the container.
  if docker container inspect vex-agents-service >/dev/null 2>&1; then
    if ! docker exec vex-agents-service \
         curl -sf http://127.0.0.1:3002/health >/dev/null 2>&1; then
      log_error "agents-service /health did not respond inside vex-agents-service"
      docker logs --tail 120 vex-agents-service 2>/dev/null || true
      return 1
    fi
  fi

  if ! wait_for_http_200 "http://127.0.0.1:3001/api/health" 120; then
    log_error "Health endpoint did not return 200: /api/health"
    docker logs --tail 120 vex-app 2>/dev/null || true
    return 1
  fi

  if ! wait_for_http_200 "http://127.0.0.1:3001/" 120; then
    log_error "Root endpoint did not return 200: /"
    docker logs --tail 120 vex-app 2>/dev/null || true
    return 1
  fi

  local db_user db_name
  db_user="$(read_env POSTGRES_USER)"
  db_name="$(read_env POSTGRES_DB)"
  db_name="${db_name:-vex_db}"

  if ! docker exec vex-db pg_isready -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
    log_error "Database readiness check failed (pg_isready)"
    docker logs --tail 80 vex-db 2>/dev/null || true
    return 1
  fi

  local redis_pass redis_ping
  redis_pass="$(read_env REDIS_PASSWORD)"
  redis_ping="$(docker exec vex-redis redis-cli -a "$redis_pass" --no-auth-warning ping 2>/dev/null | tr -d '\r' || true)"
  if [[ "$redis_ping" != "PONG" ]]; then
    log_error "Redis PING check failed"
    docker logs --tail 80 vex-redis 2>/dev/null || true
    return 1
  fi

  if [[ "$VOICE_STACK_MODE" != "false" && -f "$VOICE_COMPOSE_FILE_PATH" ]]; then
    local livekit_state coturn_state
    livekit_state="$(container_runtime_state vex-livekit)"
    coturn_state="$(container_runtime_state vex-coturn)"

    if ! is_container_ready "$livekit_state"; then
      log_error "Voice verification failed: vex-livekit (state: ${livekit_state:-missing})"
      docker logs --tail 80 vex-livekit 2>/dev/null || true
      return 1
    fi

    if ! is_container_ready "$coturn_state"; then
      log_error "Voice verification failed: vex-coturn (state: ${coturn_state:-missing})"
      docker logs --tail 80 vex-coturn 2>/dev/null || true
      return 1
    fi
  fi

  # Task #157 — pin the live Permissions-Policy header. The source-level
  # guard at tests/permissions-policy-header.test.ts catches code-side
  # regressions; this on-the-wire check catches proxy-layer regressions
  # (Cloudflare, Hostinger panel, an extra nginx include, etc.) that
  # could silently strip `camera=(self)` and re-disable the camera
  # inside the WebView, reproducing the Task #143 outage.
  local verify_domain verify_url
  verify_domain="$(extract_domain_from_env)"
  # Strip any trailing :port — extract_domain_from_env preserves it, but a
  # public verify URL must hit the TLS edge on 443 (or whatever the proxy
  # publishes), not the internal app port. Without this strip, an APP_URL
  # like https://host:3001 would build https://host:3001/ and fail for a
  # non-regression reason.
  verify_domain="${verify_domain%%:*}"
  verify_url="https://${verify_domain}/"
  # `docker exec -e KEY=VALUE` is required to push env vars INTO the
  # container — setting them on the host side of the pipe would only
  # affect the docker CLI process, and the script inside vex-app would
  # silently fall back to its own defaults.
  if ! docker exec \
       -e "DEPLOY_VERIFY_URL=$verify_url" \
       -e "DEPLOY_VERIFY_RETRY=6" \
       -e "DEPLOY_VERIFY_DELAY=5" \
       vex-app node scripts/smoke-permissions-policy-header.mjs; then
    log_error "Permissions-Policy header check failed against $verify_url — rollout blocked. Inspect deploy/nginx.conf, server/index.ts, and any upstream proxy for a header rewrite."
    return 1
  fi

  log_ok "Deep post-deploy verification passed (containers + API + DB + Redis + Permissions-Policy)"
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
    --compose-file)
      [[ $# -ge 2 ]] || { log_error "Missing value for --compose-file"; exit 1; }
      COMPOSE_FILE_INPUT="$2"
      shift 2
      ;;
    --voice-compose-file)
      [[ $# -ge 2 ]] || { log_error "Missing value for --voice-compose-file"; exit 1; }
      VOICE_COMPOSE_FILE_INPUT="$2"
      shift 2
      ;;
    --voice-sysctl-file)
      [[ $# -ge 2 ]] || { log_error "Missing value for --voice-sysctl-file"; exit 1; }
      VOICE_SYSCTL_COMPOSE_FILE_INPUT="$2"
      shift 2
      ;;
    --enable-voice-stack)
      VOICE_STACK_MODE="true"
      shift
      ;;
    --disable-voice-stack)
      VOICE_STACK_MODE="false"
      shift
      ;;
    --refresh-images)
      IMAGE_REFRESH_MODE="true"
      shift
      ;;
    --skip-image-refresh)
      IMAGE_REFRESH_MODE="false"
      shift
      ;;
    --skip-post-verify)
      POST_DEPLOY_VERIFY="false"
      shift
      ;;
    --auto-env-values)
      AUTO_ENV_VALUES="true"
      shift
      ;;
    --prompt-env-values)
      AUTO_ENV_VALUES="false"
      shift
      ;;
    --skip-repo-setup)
      SKIP_REPO_SETUP="true"
      shift
      ;;
    --pull-latest)
      PULL_LATEST="true"
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      CORE_FORWARD_ARGS+=("$1")
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
require_command curl

if [[ "$USE_TOKEN_AUTH" != "true" && "$SKIP_REPO_SETUP" != "true" ]]; then
  require_command ssh
  require_command ssh-keygen
  require_command ssh-agent
  require_command ssh-add
fi

ensure_docker_compose_available
warn_ubuntu_2510_update_bug

if [[ "$SKIP_REPO_SETUP" != "true" ]]; then
  ensure_repo_exists

  if [[ "$USE_TOKEN_AUTH" == "true" ]]; then
    ensure_origin_https
  else
    ensure_origin_ssh
    ensure_ssh_auth
  fi
else
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    log_error "--skip-repo-setup used but no git repo found at: $REPO_DIR"
    exit 1
  fi

  if [[ "$USE_TOKEN_AUTH" == "true" ]]; then
    ensure_origin_https
  fi
fi

pull_latest_with_token_if_needed

if [[ ! -f "$REPO_DIR/scripts/prod-auto.sh" ]]; then
  log_error "Expected core script not found in repo: $REPO_DIR/scripts/prod-auto.sh"
  exit 1
fi

ENV_FILE_PATH="$(resolve_path "$REPO_DIR" "$ENV_FILE_INPUT")"
COMPOSE_FILE_PATH="$(resolve_path "$REPO_DIR" "$COMPOSE_FILE_INPUT")"
VOICE_COMPOSE_FILE_PATH="$(resolve_path "$REPO_DIR" "$VOICE_COMPOSE_FILE_INPUT")"
VOICE_SYSCTL_COMPOSE_FILE_PATH="$(resolve_path "$REPO_DIR" "$VOICE_SYSCTL_COMPOSE_FILE_INPUT")"

if [[ ! -f "$COMPOSE_FILE_PATH" ]]; then
  log_error "Compose file not found: $COMPOSE_FILE_PATH"
  exit 1
fi

ensure_env_file_exists
ensure_required_env_values

if ! docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH" config >/dev/null 2>&1; then
  log_error "docker compose config failed with current env values"
  exit 1
fi

refresh_upstream_images_if_needed
run_core_deploy
rebuild_ai_agent_service
rebuild_agents_service
repair_runtime_mismatches_if_needed
run_voice_stack_deploy_if_needed

if [[ "$POST_DEPLOY_VERIFY" == "true" ]]; then
  verify_post_deploy_stack
else
  log_warn "Deep post-deploy verification skipped (--skip-post-verify)"
fi

log_ok "First-run strict production bootstrap completed successfully"
echo ""
echo "Run command:"
echo "  ./prod-auto.sh --repo-dir $REPO_DIR"
