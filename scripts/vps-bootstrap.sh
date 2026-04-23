#!/usr/bin/env bash
# =============================================================================
# VEX Platform - Professional VPS Bootstrap (One-shot installer)
# =============================================================================
# Usage (fresh VPS, as root):
#   curl -fsSL https://raw.githubusercontent.com/duxexch/vexo/main/scripts/vps-bootstrap.sh | sudo bash
#   # OR clone first then run:
#   git clone https://github.com/duxexch/vexo.git /docker/vex && cd /docker/vex && sudo bash scripts/vps-bootstrap.sh
#
# What it does (idempotent — safe to re-run):
#   1. Inspects the server (OS / RAM / disk / CPU / ports)
#   2. Installs prerequisites: Docker, Docker Compose plugin, git, jq, openssl, curl, ufw
#   3. Configures firewall (22, 80, 443)
#   4. Clones / updates the repository at $INSTALL_DIR (default /docker/vex)
#   5. Generates every required secret in .env — preserves any value you have
#      already customised; only fills missing or placeholder entries
#   6. Creates the shared Docker network used by Traefik
#   7. Brings up the full stack (app + DB + Redis + MinIO + AI agent + Traefik)
#   8. Verifies the public domain (https://vixo.click) responds
#
# Override defaults via environment:
#   DOMAIN=vixo.click
#   ACME_EMAIL=admin@vixo.click
#   REPO_URL=https://github.com/duxexch/vexo.git   (or git@github.com:duxexch/vexo.git)
#   REPO_BRANCH=main
#   INSTALL_DIR=/docker/vex
#   GIT_AUTH=https | ssh                            (default: https — no key needed)
# =============================================================================

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Defaults (override via environment variables before running)
# ---------------------------------------------------------------------------
DOMAIN="${DOMAIN:-vixo.click}"
ACME_EMAIL="${ACME_EMAIL:-admin@${DOMAIN}}"
REPO_URL="${REPO_URL:-https://github.com/duxexch/vexo.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/docker/vex}"
GIT_AUTH="${GIT_AUTH:-https}"
TURN_EXTERNAL_IP="${TURN_EXTERNAL_IP:-$(curl -fsSL https://api.ipify.org 2>/dev/null || echo "")}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@${DOMAIN}}"

# ---------------------------------------------------------------------------
# Pretty output
# ---------------------------------------------------------------------------
RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; BLU=$'\033[0;34m'; CYN=$'\033[0;36m'; NC=$'\033[0m'
info()  { echo -e "${BLU}[INFO]${NC} $*"; }
ok()    { echo -e "${GRN}[OK]${NC} $*"; }
warn()  { echo -e "${YLW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo; echo -e "${CYN}━━━ $* ━━━${NC}"; }

trap 'err "Bootstrap failed at line $LINENO. Re-run after addressing the error above."' ERR

# ---------------------------------------------------------------------------
# Must run as root (we install packages, edit /etc, etc.)
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "Please run as root: sudo bash scripts/vps-bootstrap.sh"
  exit 1
fi

# =============================================================================
# 1. INSPECT THE SERVER
# =============================================================================
step "1/8  Inspecting the server"

OS_NAME="$(. /etc/os-release && echo "${PRETTY_NAME:-unknown}")"
OS_ID="$(. /etc/os-release && echo "${ID:-unknown}")"
OS_VERSION="$(. /etc/os-release && echo "${VERSION_ID:-unknown}")"
KERNEL="$(uname -r)"
ARCH="$(uname -m)"
CPU_CORES="$(nproc)"
RAM_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"
DISK_FREE_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
PUBLIC_IP="${TURN_EXTERNAL_IP:-unknown}"

echo "  OS:        $OS_NAME ($ARCH)"
echo "  Kernel:    $KERNEL"
echo "  CPU:       $CPU_CORES cores"
echo "  RAM:       ${RAM_MB} MB"
echo "  Disk free: ${DISK_FREE_GB} GB on /"
echo "  Public IP: $PUBLIC_IP"
echo "  Domain:    $DOMAIN"
echo "  Install:   $INSTALL_DIR"

# Hard requirements
[[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" ]] || { err "Only Ubuntu/Debian supported (got: $OS_ID)"; exit 1; }
(( RAM_MB >= 1800 )) || warn "Low RAM (${RAM_MB} MB). Recommended: ≥ 2 GB"
(( DISK_FREE_GB >= 10 )) || warn "Low disk space (${DISK_FREE_GB} GB free). Recommended: ≥ 20 GB"

# Port conflict scan
ports_in_use=()
for p in 80 443 3001 5432 6379 9000; do
  if ss -tlnH "( sport = :$p )" 2>/dev/null | grep -q .; then
    ports_in_use+=("$p")
  fi
done
if (( ${#ports_in_use[@]} > 0 )); then
  warn "Ports already in use: ${ports_in_use[*]}  (will try to free them in step 4)"
fi

ok "Server inspection complete"

# =============================================================================
# 2. INSTALL PREREQUISITES
# =============================================================================
step "2/8  Installing prerequisites"

export DEBIAN_FRONTEND=noninteractive

# Auto-disable known-broken third-party APT sources so they don't block us
disable_broken_repo() {
  local pattern="$1" label="$2"
  local files
  files=$(grep -rlE "$pattern" /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null || true)
  for f in $files; do
    [[ "$f" == *.disabled ]] && continue
    warn "Disabling broken APT source ($label): $f"
    mv "$f" "${f}.disabled"
  done
}
disable_broken_repo 'repository\.monarx\.com' 'monarx'

# apt-get update may emit warnings from third-party repos; we only fail if the
# subsequent install fails (which is the real signal that something is missing).
apt-get update -qq -o Acquire::AllowInsecureRepositories=true 2>&1 | \
  grep -vE 'does not have a Release file|signed-by|InRelease|^$' || true

if ! apt-get install -y -qq \
    ca-certificates curl gnupg lsb-release \
    git jq openssl ufw netcat-openbsd \
    apt-transport-https software-properties-common >/dev/null 2>&1; then
  err "Failed to install base packages. Try: sudo apt-get install -y ca-certificates curl gnupg jq openssl ufw"
  exit 1
fi
ok "Base packages installed"

# Docker — install only if missing
if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg | \
    gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
  ok "Docker installed: $(docker --version | head -1)"
else
  ok "Docker present: $(docker --version | head -1)"
fi

docker compose version >/dev/null 2>&1 || { err "Docker Compose plugin missing"; exit 1; }
ok "Docker Compose: $(docker compose version | head -1)"

# =============================================================================
# 3. FIREWALL
# =============================================================================
step "3/8  Configuring firewall (UFW)"

if ! ufw status | grep -q "Status: active"; then
  ufw --force reset >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp comment 'SSH' >/dev/null
  ufw allow 80/tcp comment 'HTTP' >/dev/null
  ufw allow 443/tcp comment 'HTTPS' >/dev/null
  ufw allow 3478/udp comment 'TURN' >/dev/null
  ufw allow 3478/tcp comment 'TURN' >/dev/null
  ufw --force enable >/dev/null
  ok "UFW enabled with rules: 22, 80, 443, 3478"
else
  for rule in "22/tcp" "80/tcp" "443/tcp" "3478/udp" "3478/tcp"; do
    ufw status | grep -q "$rule" || ufw allow "$rule" >/dev/null
  done
  ok "UFW already active — required ports verified"
fi

# =============================================================================
# 4. RESOLVE PORT CONFLICTS (kill orphan docker-proxy processes if any)
# =============================================================================
step "4/8  Resolving port conflicts"

if (( ${#ports_in_use[@]} > 0 )); then
  for p in "${ports_in_use[@]}"; do
    cids=$(docker ps -aq --filter "publish=$p" 2>/dev/null || true)
    if [[ -n "$cids" ]]; then
      info "Removing containers holding port $p"
      docker rm -f $cids >/dev/null 2>&1 || true
    fi
  done
  # Restart docker if orphan docker-proxy processes survived
  if pgrep -f docker-proxy >/dev/null 2>&1 && \
     ss -tlnH "( sport = :80 or sport = :443 )" 2>/dev/null | grep -q docker-proxy; then
    warn "Orphan docker-proxy detected — restarting Docker daemon"
    systemctl restart docker
    sleep 3
  fi
  ok "Port cleanup complete"
else
  ok "No port conflicts"
fi

# =============================================================================
# 5. CLONE / UPDATE REPOSITORY
# =============================================================================
step "5/8  Preparing repository at $INSTALL_DIR"

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repository exists — pulling latest from $REPO_BRANCH"
  git -C "$INSTALL_DIR" fetch --quiet origin "$REPO_BRANCH"
  git -C "$INSTALL_DIR" checkout --quiet "$REPO_BRANCH"
  git -C "$INSTALL_DIR" pull --quiet --ff-only origin "$REPO_BRANCH"
else
  info "Cloning $REPO_URL into $INSTALL_DIR"
  git clone --quiet --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
ok "Repository ready: $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"

# =============================================================================
# 6. GENERATE / RECONCILE .env  (IDEMPOTENT — preserves user values)
# =============================================================================
step "6/8  Reconciling .env (preserving any custom values)"

ENV_FILE="$INSTALL_DIR/.env"
ENV_EXAMPLE="$INSTALL_DIR/.env.example"
[[ -f "$ENV_EXAMPLE" ]] || { err ".env.example missing — corrupt repo?"; exit 1; }

# Bootstrap .env from example if absent.  IMPORTANT: when we create a fresh
# .env from the public template, every secret value in the template is treated
# as a placeholder (the example values are visible on GitHub), so we force
# regeneration of all secret keys below.
FRESH_ENV="false"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  FRESH_ENV="true"
  info "Created fresh $ENV_FILE from template (all secrets will be regenerated)"
else
  info "Existing .env found — will only fill missing / placeholder values"
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)"
fi

# Helpers to read / write a key in .env
get_env() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  echo "${val}"
}

set_env() {
  local key="$1" val="$2"
  # Escape for sed: replace |, &, \, /
  local escaped
  escaped=$(printf '%s' "$val" | sed -e 's/[\/&|]/\\&/g')
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

# A value is "placeholder" if empty or matches a known placeholder pattern.
is_placeholder() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  case "$v" in
    replace_with_*|REPLACE_WITH_*|__GENERATE__|changeme|CHANGEME|your.*) return 0 ;;
    *) return 1 ;;
  esac
}

# Fill key only if missing OR placeholder.
# When FRESH_ENV=true (we just copied from the public template), force-regenerate
# every secret because the template values are publicly visible on GitHub.
ensure() {
  local key="$1" generator="$2"
  local current
  current="$(get_env "$key")"
  if [[ "$FRESH_ENV" == "true" ]] || is_placeholder "$current"; then
    local new
    new="$(eval "$generator")"
    set_env "$key" "$new"
    echo "  ✓ generated $key"
  else
    echo "  • kept     $key"
  fi
}

gen_hex()    { openssl rand -hex "${1:-32}"; }
gen_b64()    { openssl rand -base64 "${1:-24}" | tr -d '=+/' | head -c "${1:-24}"; }
gen_pass()   { openssl rand -base64 18 | tr -d '=+/'; }

# Core infrastructure passwords
ensure POSTGRES_PASSWORD       'gen_hex 24'
ensure REDIS_PASSWORD          'gen_hex 24'
ensure MINIO_ROOT_PASSWORD     'gen_hex 24'

# Auth / crypto secrets (≥ 32 chars enforced by entrypoint)
ensure SESSION_SECRET          'gen_hex 48'
ensure JWT_SIGNING_KEY         'gen_hex 48'
ensure ADMIN_JWT_SECRET        'gen_hex 48'
ensure SECRETS_ENCRYPTION_KEY  'gen_hex 64'
ensure AI_AGENT_SHARED_TOKEN   'gen_hex 48'
ensure AI_AGENT_PAYLOAD_SALT   'gen_hex 16'
ensure AI_AGENT_PRIVACY_SALT   'gen_hex 16'

# Admin bootstrap password (one-time)
ensure ADMIN_BOOTSTRAP_PASSWORD 'gen_pass'

# TURN/voice
ensure TURN_PASSWORD           'gen_pass'

# Apply derived values (URLs depend on the passwords above)
PG_PASS="$(get_env POSTGRES_PASSWORD)"
RED_PASS="$(get_env REDIS_PASSWORD)"
MIN_PASS="$(get_env MINIO_ROOT_PASSWORD)"
JWT_KEY="$(get_env JWT_SIGNING_KEY)"
ADMIN_JWT="$(get_env ADMIN_JWT_SECRET)"
TURN_PASS="$(get_env TURN_PASSWORD)"

set_env DATABASE_URL "postgresql://$(get_env POSTGRES_USER):${PG_PASS}@vex-db:5432/$(get_env POSTGRES_DB)"
set_env REDIS_URL    "redis://:${RED_PASS}@vex-redis:6379"
set_env MINIO_SECRET_KEY  "$MIN_PASS"
set_env MINIO_ACCESS_KEY  "$(get_env MINIO_ROOT_USER)"
set_env JWT_USER_SECRET   "$JWT_KEY"
set_env JWT_ADMIN_SECRET  "$ADMIN_JWT"
set_env PUBLIC_RTC_TURN_CREDENTIAL "$TURN_PASS"

# Domain-derived values
set_env APP_URL                  "https://${DOMAIN}"
set_env ACME_EMAIL               "$ACME_EMAIL"
set_env ADMIN_BOOTSTRAP_EMAIL    "$ADMIN_EMAIL"
set_env ADMIN_RECOVERY_EMAIL     "$ADMIN_EMAIL"
set_env BASE_URL                 "https://${DOMAIN}"
set_env SECURITY_BASE_URL        "https://${DOMAIN}"
set_env CSP_BASE_URL             "https://${DOMAIN}"
set_env WS_SMOKE_BASE_URL        "https://${DOMAIN}"
set_env TURN_REALM               "$DOMAIN"
[[ -n "$PUBLIC_IP" && "$PUBLIC_IP" != "unknown" ]] && set_env TURN_EXTERNAL_IP "$PUBLIC_IP"

chmod 600 "$ENV_FILE"
ok ".env reconciled at $ENV_FILE (mode 600)"

# =============================================================================
# 7. DOCKER NETWORK + STACK DEPLOYMENT
# =============================================================================
step "7/8  Deploying the stack"

# External shared network for Traefik ↔ app
docker network inspect vex-traefik >/dev/null 2>&1 || {
  docker network create vex-traefik >/dev/null
  ok "Created Docker network: vex-traefik"
}

# Persistent kernel tuning required for voice stack
sysctl -w vm.overcommit_memory=1 >/dev/null 2>&1 || true
grep -q '^vm.overcommit_memory' /etc/sysctl.conf 2>/dev/null \
  || echo 'vm.overcommit_memory=1' >> /etc/sysctl.conf

# Bring up application stack via the canonical updater
info "Running prod-update.sh (build + migrate + start)"
bash "$INSTALL_DIR/prod-update.sh" \
  --auth-mode "$([[ "$GIT_AUTH" == "ssh" ]] && echo ssh || echo auto)" \
  --repo-url  "$REPO_URL" \
  --repo-dir  "$INSTALL_DIR" \
  --branch    "$REPO_BRANCH" \
  --non-interactive \
  || { err "prod-update.sh failed — inspect logs above"; exit 1; }

# Bring up Traefik (reverse proxy + Let's Encrypt)
info "Starting Traefik reverse proxy"
docker compose -f "$INSTALL_DIR/deploy/docker-compose.traefik.yml" --env-file "$ENV_FILE" up -d
ok "Traefik started"

# =============================================================================
# 8. VERIFY
# =============================================================================
step "8/8  Verifying deployment (give Let's Encrypt up to 60 s)"

sleep 15
echo
docker ps --filter name=vex- --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo

verify_url() {
  local url="$1" attempts="${2:-12}" sleep_s="${3:-5}"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null | grep -qE '^(200|301|302|404)$'; then
      return 0
    fi
    sleep "$sleep_s"
  done
  return 1
}

if verify_url "http://${DOMAIN}/api/health" 6 5; then
  ok "HTTP reachable: http://${DOMAIN}"
else
  warn "HTTP not yet reachable — check DNS for ${DOMAIN} → ${PUBLIC_IP}"
fi

if verify_url "https://${DOMAIN}/api/health" 12 5; then
  ok "HTTPS reachable: https://${DOMAIN}"
else
  warn "HTTPS not ready yet. Common causes:"
  warn "  • DNS A record for ${DOMAIN} not pointing to ${PUBLIC_IP}"
  warn "  • Let's Encrypt rate limit / pending certificate"
  warn "  Inspect: docker logs vex-traefik --tail 80"
fi

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "VEX bootstrap finished"
echo "  Site:           https://${DOMAIN}"
echo "  Admin user:     $(get_env ADMIN_BOOTSTRAP_USERNAME)"
echo "  Admin password: $(get_env ADMIN_BOOTSTRAP_PASSWORD)   (saved in .env)"
echo "  .env path:      $ENV_FILE"
echo
echo "Next steps:"
echo "  • Re-deploy any time:   cd $INSTALL_DIR && bash prod-update.sh"
echo "  • View app logs:        docker logs -f vex-app"
echo "  • View Traefik logs:    docker logs -f vex-traefik"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
