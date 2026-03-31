#!/bin/bash
# VEX Platform - Production Deployment Script
# Usage: ./scripts/deploy.sh
# Run on the production server

set -e

APP_DIR="/opt/vex"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"

echo "========================================"
echo "  VEX Platform - Production Deployment"
echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# Check for .env.production
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found!"
    echo "Copy .env.example to $ENV_FILE and fill in your values"
    exit 1
fi

# Check for docker compose
if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed"
    exit 1
fi

echo ""
echo "[1/6] Backing up database..."
if docker ps --format '{{.Names}}' | grep -q vex-db; then
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/vex_db_$(date +%Y%m%d_%H%M%S).sql.gz"
    docker exec vex-db pg_dump -U "$(grep POSTGRES_USER $ENV_FILE | cut -d= -f2)" \
        "$(grep POSTGRES_DB $ENV_FILE | cut -d= -f2 || echo vex_db)" \
        | gzip > "$BACKUP_FILE"
    echo "  Backup saved: $BACKUP_FILE"
else
    echo "  No running database found (first deploy?), skipping backup"
fi

echo ""
echo "[2/6] Pulling latest code..."
git pull origin main

echo ""
echo "[3/6] Building Docker image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache app

echo ""
echo "[4/6] Stopping old containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --timeout 30

echo ""
echo "[5/6] Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "[6/6] Waiting for health check..."
sleep 10
for i in $(seq 1 30); do
    if docker exec vex-app curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "  Application is healthy!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "  WARNING: Health check not passing after 60s"
        echo "  Check logs: docker logs vex-app --tail 50"
        exit 1
    fi
    sleep 2
done

echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "  Site: https://vixo.click"
echo "  Admin: https://vixo.click/admin"
echo "========================================"
echo ""
echo "Useful commands:"
echo "  docker logs vex-app --tail 100 -f     # View app logs"
echo "  docker logs vex-db --tail 50           # View DB logs"
echo "  docker exec -it vex-db psql -U \$(grep POSTGRES_USER $ENV_FILE | cut -d= -f2) vex_db  # DB shell"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps  # Service status"
