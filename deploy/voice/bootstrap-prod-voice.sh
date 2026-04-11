#!/usr/bin/env bash
set -euo pipefail

# Bootstraps production voice stack on Ubuntu server.
# - Uses provided values when present; generates missing secrets safely
# - Synchronizes voice vars across discovered .env* files (without duplication)
# - Applies optional host sysctl and firewall rules
# - Restarts app + livekit + coturn with the updated values

REPO_DIR="${REPO_DIR:-/opt/vixo}"
APP_ENV_FILE="${APP_ENV_FILE:-${REPO_DIR}/.env}"
SERVER_IP="${SERVER_IP:-72.61.187.119}"
TURN_REALM="${TURN_REALM:-vixo.click}"
TURN_USERNAME="${TURN_USERNAME:-vex_turn_user}"
RTC_POLICY="${RTC_POLICY:-relay}"
LIVEKIT_KEY_NAME="${LIVEKIT_KEY_NAME:-vixo_prod}"

SYNC_ENV_FILES="${SYNC_ENV_FILES:-}"  # comma separated absolute/relative paths
APPLY_SYSCTL="${APPLY_SYSCTL:-true}"
APPLY_FIREWALL="${APPLY_FIREWALL:-true}"
RESTART_STACK="${RESTART_STACK:-true}"

SYSCTL_RMEM_MAX="${SYSCTL_RMEM_MAX:-5000000}"
SYSCTL_RMEM_DEFAULT="${SYSCTL_RMEM_DEFAULT:-5000000}"
SYSCTL_WMEM_MAX="${SYSCTL_WMEM_MAX:-5000000}"
SYSCTL_WMEM_DEFAULT="${SYSCTL_WMEM_DEFAULT:-5000000}"

usage() {
  cat <<'EOF'
Usage: deploy/voice/bootstrap-prod-voice.sh [options]

Options:
  --repo-dir PATH             Repo path (default: /opt/vixo)
  --app-env-file PATH         Primary env file (default: <repo>/.env)
  --sync-env-files LIST       Comma-separated env files to sync. If omitted, auto-discovers .env* files.
  --server-ip IP              Public TURN IP
  --turn-realm VALUE          TURN realm
  --turn-username VALUE       TURN username
  --rtc-policy VALUE          all|relay (default: relay)
  --livekit-key-name VALUE    Generated LIVEKIT key name if keys are not provided
  --no-sysctl                 Skip host sysctl tuning
  --no-firewall               Skip ufw updates
  --no-restart                Skip docker compose restart
  --help                      Show this help

Environment overrides:
  LIVEKIT_KEYS, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
  TURN_PASSWORD, PUBLIC_RTC_STUN_URLS, PUBLIC_RTC_TURN_URLS,
  PUBLIC_RTC_TURN_USERNAME, PUBLIC_RTC_TURN_CREDENTIAL,
  PUBLIC_RTC_ICE_TRANSPORT_POLICY.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)
      REPO_DIR="$2"; shift 2 ;;
    --app-env-file)
      APP_ENV_FILE="$2"; shift 2 ;;
    --sync-env-files)
      SYNC_ENV_FILES="$2"; shift 2 ;;
    --server-ip)
      SERVER_IP="$2"; shift 2 ;;
    --turn-realm)
      TURN_REALM="$2"; shift 2 ;;
    --turn-username)
      TURN_USERNAME="$2"; shift 2 ;;
    --rtc-policy)
      RTC_POLICY="$2"; shift 2 ;;
    --livekit-key-name)
      LIVEKIT_KEY_NAME="$2"; shift 2 ;;
    --no-sysctl)
      APPLY_SYSCTL="false"; shift ;;
    --no-firewall)
      APPLY_FIREWALL="false"; shift ;;
    --no-restart)
      RESTART_STACK="false"; shift ;;
    --help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1 ;;
  esac
done

resolve_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    echo ""
  elif command -v sudo >/dev/null 2>&1; then
    echo "sudo"
  else
    echo ""
  fi
}

SUDO_CMD="$(resolve_sudo)"

mkdir -p "$(dirname "${APP_ENV_FILE}")"
touch "${APP_ENV_FILE}"

normalize_livekit_keys() {
  local raw="$1"
  local cleaned="${raw%\"}"
  cleaned="${cleaned#\"}"
  # LiveKit expects key entries in the form "key: secret"
  cleaned="$(printf '%s' "$cleaned" | sed -E 's/:[[:space:]]*/: /g; s/,[[:space:]]*/, /g')"
  printf '%s' "$cleaned"
}

if [[ -n "${LIVEKIT_KEYS:-}" ]]; then
  LIVEKIT_KEYS="$(normalize_livekit_keys "${LIVEKIT_KEYS}")"
elif [[ -n "${LIVEKIT_API_KEY:-}" && -n "${LIVEKIT_API_SECRET:-}" ]]; then
  LIVEKIT_KEYS="$(normalize_livekit_keys "${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}")"
else
  LIVEKIT_SECRET="$(openssl rand -hex 32)"
  LIVEKIT_KEYS="$(normalize_livekit_keys "${LIVEKIT_KEY_NAME}: ${LIVEKIT_SECRET}")"
fi

if [[ -z "${TURN_PASSWORD:-}" ]]; then
  TURN_PASSWORD="$(openssl rand -hex 24)"
fi

STUN_URLS="${PUBLIC_RTC_STUN_URLS:-stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302}"
TURN_URLS="${PUBLIC_RTC_TURN_URLS:-turn:${SERVER_IP}:3478?transport=udp,turn:${SERVER_IP}:3478?transport=tcp}"
RTC_TURN_USERNAME="${PUBLIC_RTC_TURN_USERNAME:-${TURN_USERNAME}}"
RTC_TURN_CREDENTIAL="${PUBLIC_RTC_TURN_CREDENTIAL:-${TURN_PASSWORD}}"
RTC_ICE_POLICY="${PUBLIC_RTC_ICE_TRANSPORT_POLICY:-${RTC_POLICY}}"

discover_env_files() {
  local discovered=()
  local candidate

  discovered+=("${APP_ENV_FILE}")

  if [[ -n "${SYNC_ENV_FILES}" ]]; then
    IFS=',' read -r -a custom_files <<< "${SYNC_ENV_FILES}"
    for candidate in "${custom_files[@]}"; do
      [[ -z "${candidate}" ]] && continue
      discovered+=("${candidate}")
    done
  else
    while IFS= read -r candidate; do
      discovered+=("${candidate}")
    done < <(find "${REPO_DIR}" -maxdepth 2 -type f -name '.env*' ! -name '.env.example' ! -name '*.bak' | sort)
  fi

  # Print unique list preserving order.
  local seen="|"
  local normalized
  for candidate in "${discovered[@]}"; do
    [[ -z "${candidate}" ]] && continue
    if [[ "${candidate}" != /* ]]; then
      normalized="${REPO_DIR}/${candidate}"
    else
      normalized="${candidate}"
    fi
    normalized="$(printf '%s' "${normalized}" | sed 's#//*#/#g')"
    if [[ "${seen}" != *"|${normalized}|"* ]]; then
      seen+="${normalized}|"
      echo "${normalized}"
    fi
  done
}

upsert_env_in_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp

  mkdir -p "$(dirname "${file}")"
  touch "${file}"

  tmp="$(mktemp)"
  awk -v k="${key}" -v v="${value}" '
    BEGIN { done=0 }
    $0 ~ "^[[:space:]]*" k "=" {
      if (!done) {
        print k "=" v
        done=1
      }
      next
    }
    { print }
    END {
      if (!done) {
        print k "=" v
      }
    }
  ' "${file}" > "${tmp}"

  mv "${tmp}" "${file}"
}

update_all_env_files() {
  local env_file
  while IFS= read -r env_file; do
    upsert_env_in_file "${env_file}" "LIVEKIT_KEYS" "${LIVEKIT_KEYS}"
    upsert_env_in_file "${env_file}" "TURN_EXTERNAL_IP" "${SERVER_IP}"
    upsert_env_in_file "${env_file}" "TURN_REALM" "${TURN_REALM}"
    upsert_env_in_file "${env_file}" "TURN_USERNAME" "${TURN_USERNAME}"
    upsert_env_in_file "${env_file}" "TURN_PASSWORD" "${TURN_PASSWORD}"
    upsert_env_in_file "${env_file}" "PUBLIC_RTC_STUN_URLS" "${STUN_URLS}"
    upsert_env_in_file "${env_file}" "PUBLIC_RTC_TURN_URLS" "${TURN_URLS}"
    upsert_env_in_file "${env_file}" "PUBLIC_RTC_TURN_USERNAME" "${RTC_TURN_USERNAME}"
    upsert_env_in_file "${env_file}" "PUBLIC_RTC_TURN_CREDENTIAL" "${RTC_TURN_CREDENTIAL}"
    upsert_env_in_file "${env_file}" "PUBLIC_RTC_ICE_TRANSPORT_POLICY" "${RTC_ICE_POLICY}"

    if [[ -n "${LIVEKIT_URL:-}" ]]; then
      upsert_env_in_file "${env_file}" "LIVEKIT_URL" "${LIVEKIT_URL}"
    fi
    if [[ -n "${LIVEKIT_API_KEY:-}" ]]; then
      upsert_env_in_file "${env_file}" "LIVEKIT_API_KEY" "${LIVEKIT_API_KEY}"
    fi
    if [[ -n "${LIVEKIT_API_SECRET:-}" ]]; then
      upsert_env_in_file "${env_file}" "LIVEKIT_API_SECRET" "${LIVEKIT_API_SECRET}"
    fi

    echo "Updated env: ${env_file}"
  done < <(discover_env_files)
}

apply_host_sysctl() {
  if [[ "${APPLY_SYSCTL}" != "true" ]]; then
    return
  fi

  local sysctl_file="/etc/sysctl.d/99-vex-voice.conf"
  if [[ -z "${SUDO_CMD}" && "${EUID}" -ne 0 ]]; then
    echo "Skipping sysctl apply: run as root or install sudo." >&2
    return
  fi

  cat <<EOF | ${SUDO_CMD} tee "${sysctl_file}" >/dev/null
net.core.rmem_max=${SYSCTL_RMEM_MAX}
net.core.rmem_default=${SYSCTL_RMEM_DEFAULT}
net.core.wmem_max=${SYSCTL_WMEM_MAX}
net.core.wmem_default=${SYSCTL_WMEM_DEFAULT}
EOF

  ${SUDO_CMD} sysctl -p "${sysctl_file}" >/dev/null || true
  echo "Applied sysctl tuning from ${sysctl_file}"
}

apply_firewall_rules() {
  if [[ "${APPLY_FIREWALL}" != "true" ]]; then
    return
  fi
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi

  local ufw_cmd="ufw"
  if [[ -n "${SUDO_CMD}" && "${EUID}" -ne 0 ]]; then
    ufw_cmd="${SUDO_CMD} ufw"
  fi

  ${ufw_cmd} allow 22/tcp || true
  ${ufw_cmd} allow 80/tcp || true
  ${ufw_cmd} allow 443/tcp || true

  ${ufw_cmd} allow 3478/tcp || true
  ${ufw_cmd} allow 3478/udp || true
  ${ufw_cmd} allow 5349/tcp || true

  ${ufw_cmd} allow 7880/tcp || true
  ${ufw_cmd} allow 7881/tcp || true
  ${ufw_cmd} allow 7882/udp || true
  ${ufw_cmd} allow 49160:49200/udp || true

  ${ufw_cmd} --force enable || true
}

restart_stack() {
  if [[ "${RESTART_STACK}" != "true" ]]; then
    return
  fi

  cd "${REPO_DIR}"

  # Remove stale containers that may exist under a different compose project name.
  # These stale names block recreation and keep old LIVEKIT_KEYS values active.
  docker rm -f vex-livekit vex-coturn >/dev/null 2>&1 || true

  docker compose --env-file .env up -d app

  if [[ -f "deploy/docker-compose.voice.linux-sysctl.yml" ]]; then
    docker compose -f deploy/docker-compose.voice.yml -f deploy/docker-compose.voice.linux-sysctl.yml --env-file .env up -d --force-recreate --remove-orphans livekit coturn || \
      docker compose -f deploy/docker-compose.voice.yml --env-file .env up -d --force-recreate --remove-orphans livekit coturn
  else
    docker compose -f deploy/docker-compose.voice.yml --env-file .env up -d --force-recreate --remove-orphans livekit coturn
  fi
}

update_all_env_files
apply_host_sysctl
apply_firewall_rules
restart_stack

echo "Voice bootstrap completed successfully."
echo "LiveKit keys format used: ${LIVEKIT_KEYS%%:*}: ********"
echo "TURN user: ${TURN_USERNAME}, RTC policy: ${RTC_ICE_POLICY}"
