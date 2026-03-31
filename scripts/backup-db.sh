#!/bin/bash

# VEX Platform - Database Backup Script
# سكربت النسخ الاحتياطي لقاعدة البيانات

set -e

echo "=========================================="
echo "   VEX Database Backup Tool"
echo "   أداة النسخ الاحتياطي لقاعدة البيانات"
echo "=========================================="

# Load environment
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL is not set!"
    echo "خطأ: DATABASE_URL غير محدد!"
    exit 1
fi

# Create backup directory
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vex_backup_$TIMESTAMP.sql.gz"

echo "Creating backup... / جاري إنشاء النسخة الاحتياطية..."

# Create backup
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

# Calculate size
SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)

echo "=========================================="
echo "Backup complete! / اكتمل النسخ الاحتياطي!"
echo "=========================================="
echo ""
echo "File: $BACKUP_FILE"
echo "Size: $SIZE"

# Keep only last 7 backups
echo "Cleaning old backups... / جاري تنظيف النسخ القديمة..."
ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --

echo "Done! / تم!"
