#!/usr/bin/env bash
set -euo pipefail

# Bootstraps production voice stack on Ubuntu server.
# - Generates strong LIVEKIT/ TURN secrets
# - Appends/updates env values in .env
# - Opens firewall ports in safe order
# - Starts livekit + coturn via docker compose

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root."
  exit 1
fi

REPO_DIR="${REPO_DIR:-/opt/vixo}"
APP_ENV_FILE="${APP_ENV_FILE:-${REPO_DIR}/.env}"
SERVER_IP="${SERVER_IP:-72.61.187.119}"
TURN_REALM="${TURN_REALM:-vixo.click}"
TURN_USERNAME="${TURN_USERNAME:-vex_turn_user}"
LIVEKIT_KEY_NAME="${LIVEKIT_KEY_NAME:-vixo_prod}"
RTC_POLICY="${RTC_POLICY:-all}"

mkdir -p "$(dirname "${APP_ENV_FILE}")"
touch "${APP_ENV_FILE}"

LIVEKIT_SECRET="$(openssl rand -hex 32)"
TURN_PASSWORD="$(openssl rand -hex 24)"
LIVEKIT_KEYS="${LIVEKIT_KEY_NAME}: ${LIVEKIT_SECRET}"
TURN_URLS="turn:${SERVER_IP}:3478?transport=udp,turn:${SERVER_IP}:3478?transport=tcp"
STUN_URLS="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${APP_ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${APP_ENV_FILE}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${APP_ENV_FILE}"
  fi
}

upsert_env "LIVEKIT_KEYS" "${LIVEKIT_KEYS}"
upsert_env "TURN_EXTERNAL_IP" "${SERVER_IP}"
upsert_env "TURN_REALM" "${TURN_REALM}"
upsert_env "TURN_USERNAME" "${TURN_USERNAME}"
upsert_env "TURN_PASSWORD" "${TURN_PASSWORD}"
upsert_env "PUBLIC_RTC_STUN_URLS" "${STUN_URLS}"
upsert_env "PUBLIC_RTC_TURN_URLS" "${TURN_URLS}"
upsert_env "PUBLIC_RTC_TURN_USERNAME" "${TURN_USERNAME}"
upsert_env "PUBLIC_RTC_TURN_CREDENTIAL" "${TURN_PASSWORD}"
upsert_env "PUBLIC_RTC_ICE_TRANSPORT_POLICY" "${RTC_POLICY}"

# Firewall open order: baseline access first, then TURN/LiveKit ports.
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp

  ufw allow 3478/tcp
  ufw allow 3478/udp
  ufw allow 5349/tcp

  ufw allow 7880/tcp
  ufw allow 7881/tcp
  ufw allow 7882/udp

  ufw allow 49160:49200/udp
  ufw --force enable
fi

cd "${REPO_DIR}"
docker compose -f deploy/docker-compose.voice.yml --env-file .env up -d livekit coturn

echo "Voice stack started successfully."
echo "Updated env file: ${APP_ENV_FILE}"
echo "LiveKit key: ${LIVEKIT_KEY_NAME}"
echo "Rotate secrets after initial validation if required by policy."
