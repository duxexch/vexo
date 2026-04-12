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
ENV_FILE_INPUT=".env"
COMPOSE_FILE_INPUT="docker-compose.prod.yml"
NON_INTERACTIVE="false"
SKIP_REPO_SETUP="false"
PULL_LATEST="false"

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
- Configures Git SSH auth (no password per pull)
- Validates and interactively repairs .env
- Runs strict production deployment
- Verifies env values are loaded correctly in vex-app container

Options:
  --repo-dir <path>           Target repository directory (default: /docker/vex if present)
  --repo-url <ssh-url>        Git SSH URL (default: git@github.com:duxexch/vexo.git)
  --branch <name>             Branch to use (default: main)
  --env-file <path>           Env file path (default: .env)
  --compose-file <path>       Compose file path (default: docker-compose.prod.yml)
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

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
      if [[ "$secret" == "true" && -z "$current" ]]; then
        local generated
        case "$key" in
          SESSION_SECRET|JWT_SIGNING_KEY|ADMIN_JWT_SECRET|SECRETS_ENCRYPTION_KEY)
            generated="$(generate_secret_hex 48)"
            ;;
          *)
            generated="$(generate_secret_hex 24)"
            ;;
        esac
        upsert_env "$key" "$generated"
        log_warn "Auto-generated $key in non-interactive mode"
        continue
      fi

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
  if [[ -f "$REPO_DIR/.env.production" ]]; then
    template="$REPO_DIR/.env.production"
  elif [[ -f "$REPO_DIR/.env.example" ]]; then
    template="$REPO_DIR/.env.example"
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

  prompt_for_key ADMIN_BOOTSTRAP_USERNAME "ادخل ADMIN_BOOTSTRAP_USERNAME" "admin" false
  prompt_for_key ADMIN_BOOTSTRAP_PASSWORD "ادخل ADMIN_BOOTSTRAP_PASSWORD قوية" "" true
  prompt_for_key ADMIN_BOOTSTRAP_EMAIL "ادخل ADMIN_BOOTSTRAP_EMAIL" "info@${domain}" false
  prompt_for_key ADMIN_RECOVERY_EMAIL "ادخل ADMIN_RECOVERY_EMAIL" "info@${domain}" false
  prompt_for_key TRAEFIK_EXTERNAL_NETWORK "ادخل اسم شبكة Traefik الخارجية" "vex-traefik" false

  ensure_google_android_env
  sync_alias_env_keys
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

  if [[ "$PULL_LATEST" == "true" ]]; then
    cmd+=(--pull-latest)
  fi

  if (( ${#CORE_FORWARD_ARGS[@]} > 0 )); then
    cmd+=("${CORE_FORWARD_ARGS[@]}")
  fi

  log_info "Running strict production deploy"
  "${cmd[@]}"
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

require_command git
require_command docker
require_command curl
require_command ssh
require_command ssh-keygen
require_command ssh-agent
require_command ssh-add
ensure_docker_compose_available
warn_ubuntu_2510_update_bug

if [[ "$SKIP_REPO_SETUP" != "true" ]]; then
  ensure_repo_exists
  ensure_origin_ssh
  ensure_ssh_auth
else
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    log_error "--skip-repo-setup used but no git repo found at: $REPO_DIR"
    exit 1
  fi
fi

if [[ ! -f "$REPO_DIR/scripts/prod-auto.sh" ]]; then
  log_error "Expected core script not found in repo: $REPO_DIR/scripts/prod-auto.sh"
  exit 1
fi

ENV_FILE_PATH="$(resolve_path "$REPO_DIR" "$ENV_FILE_INPUT")"
COMPOSE_FILE_PATH="$(resolve_path "$REPO_DIR" "$COMPOSE_FILE_INPUT")"

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

run_core_deploy
repair_runtime_mismatches_if_needed

log_ok "First-run strict production bootstrap completed successfully"
echo ""
echo "Run command:"
echo "  ./prod-auto.sh --repo-dir $REPO_DIR"
