#!/bin/bash
# VEX Platform - Database Backup & Restore Script
# Usage:
#   ./scripts/db-backup.sh backup         # Create backup
#   ./scripts/db-backup.sh restore FILE   # Restore from backup
#   ./scripts/db-backup.sh list           # List backups

set -e

ENV_FILE=".env.production"
BACKUP_DIR="./backups"
CONTAINER="vex-db"

# Load env
if [ -f "$ENV_FILE" ]; then
    PGUSER=$(grep POSTGRES_USER "$ENV_FILE" | cut -d= -f2)
    PGDB=$(grep POSTGRES_DB "$ENV_FILE" | cut -d= -f2)
fi
PGUSER="${PGUSER:-vex_user}"
PGDB="${PGDB:-vex_db}"

mkdir -p "$BACKUP_DIR"

case "${1:-backup}" in
    backup)
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_FILE="$BACKUP_DIR/vex_${TIMESTAMP}.sql.gz"
        echo "Creating backup: $BACKUP_FILE"
        docker exec "$CONTAINER" pg_dump -U "$PGUSER" "$PGDB" | gzip > "$BACKUP_FILE"
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "Backup complete: $BACKUP_FILE ($SIZE)"
        
        # Keep only last 10 backups
        ls -t "$BACKUP_DIR"/vex_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
        echo "Old backups cleaned (keeping last 10)"
        ;;
    
    restore)
        if [ -z "$2" ]; then
            echo "Usage: $0 restore <backup_file>"
            echo "Available backups:"
            ls -lh "$BACKUP_DIR"/vex_*.sql.gz 2>/dev/null || echo "  No backups found"
            exit 1
        fi
        
        RESTORE_FILE="$2"
        if [ ! -f "$RESTORE_FILE" ]; then
            echo "ERROR: File not found: $RESTORE_FILE"
            exit 1
        fi
        
        echo "WARNING: This will OVERWRITE the current database!"
        echo "Restoring from: $RESTORE_FILE"
        read -p "Type 'yes' to confirm: " CONFIRM
        if [ "$CONFIRM" != "yes" ]; then
            echo "Cancelled."
            exit 0
        fi
        
        # Stop app to prevent writes during restore
        echo "Stopping app..."
        docker stop vex-app 2>/dev/null || true
        
        echo "Restoring database..."
        gunzip -c "$RESTORE_FILE" | docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDB"
        
        echo "Starting app..."
        docker start vex-app
        echo "Restore complete!"
        ;;
    
    list)
        echo "Available backups:"
        ls -lh "$BACKUP_DIR"/vex_*.sql.gz 2>/dev/null || echo "  No backups found"
        ;;
    
    *)
        echo "Usage: $0 {backup|restore|list}"
        exit 1
        ;;
esac
