#!/usr/bin/env bash
# VEX Production Update & Deploy Script
# - Pulls latest code from GitHub
# - Verifies and uses the correct env file
# - Restarts all containers cleanly
# - Logs all steps for audit

set -Eeuo pipefail

# ----------- CONFIG -----------
REPO_DIR="/docker/vex" # Change if your repo is in a different path
COMPOSE_FILE="docker-compose.prod.yml"
DEFAULT_ENV_FILE=".env"
ALT_ENV_FILE=".env.production.local"
GIT_REMOTE="origin"
GIT_BRANCH="main"

# ----------- ARGUMENTS -----------
ENV_FILE=""
if [[ -f "$REPO_DIR/$ALT_ENV_FILE" ]]; then
  ENV_FILE="$ALT_ENV_FILE"
elif [[ -f "$REPO_DIR/$DEFAULT_ENV_FILE" ]]; then
  ENV_FILE="$DEFAULT_ENV_FILE"
else
  echo "[FATAL] No environment file found!" >&2
  exit 1
fi

cd "$REPO_DIR"
echo "[INFO] Using env file: $ENV_FILE"

# ----------- GIT PULL -----------
echo "[INFO] Pulling latest code from $GIT_REMOTE/$GIT_BRANCH ..."
git fetch "$GIT_REMOTE"
git reset --hard "$GIT_REMOTE/$GIT_BRANCH"

echo "[INFO] Checking env file content..."
if [[ ! -s "$ENV_FILE" ]]; then
  echo "[FATAL] Env file $ENV_FILE is empty!" >&2
  exit 2
fi
cat "$ENV_FILE" | grep -E '^[A-Z0-9_]+='

# ----------- DOCKER COMPOSE RESTART -----------
echo "[INFO] Stopping all running containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

echo "[INFO] Starting containers with latest code and env..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

echo "[INFO] Rebuilding containers if needed..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "[INFO] Bringing up containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "[INFO] Deployment complete. Checking container status:"
docker compose -f "$COMPOSE_FILE" ps

echo "[SUCCESS] All steps completed."
