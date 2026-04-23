#!/usr/bin/env bash
# Render deploy/coturn/turnserver.conf from the .env file.
#
# Run from the repo root on the VPS:
#   ./deploy/coturn/render-config.sh
#
# After rendering, restart the coturn service:
#   docker compose -f docker-compose.prod.yml up -d coturn
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/turnserver.conf.template"
OUTPUT="${SCRIPT_DIR}/turnserver.conf"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../../.env}"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "fatal: template missing at ${TEMPLATE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "fatal: env file missing at ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${TURN_HOST:?TURN_HOST is required (e.g. turn.vixo.click)}"
: "${TURN_REALM:?TURN_REALM is required (e.g. vixo.click)}"
: "${TURN_STATIC_SECRET:?TURN_STATIC_SECRET is required}"
: "${TURN_EXTERNAL_IP:?TURN_EXTERNAL_IP is required (public IPv4 of the VPS)}"

envsubst '${TURN_HOST} ${TURN_REALM} ${TURN_STATIC_SECRET} ${TURN_EXTERNAL_IP}' \
  < "${TEMPLATE}" > "${OUTPUT}"

chmod 600 "${OUTPUT}"
echo "rendered ${OUTPUT}"
