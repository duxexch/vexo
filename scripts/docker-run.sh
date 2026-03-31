#!/bin/bash

# VEX Platform - Docker Quick Run Script
# سكربت تشغيل Docker السريع لمنصة VEX

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "=========================================="
echo "   VEX Platform - Docker Runner"
echo "   مشغّل Docker لمنصة VEX"
echo "=========================================="
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo -e "${RED}خطأ: ملف .env غير موجود!${NC}"
    echo ""
    echo "Run the setup script first:"
    echo "شغّل سكربت الإعداد أولاً:"
    echo "  ./scripts/docker-setup.sh"
    exit 1
fi

# Load .env variables
set -a
source .env
set +a

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed!${NC}"
    exit 1
fi

# Parse command
COMMAND=${1:-start}

case $COMMAND in
    start)
        echo -e "${YELLOW}Starting VEX Platform... / جاري تشغيل منصة VEX...${NC}"
        docker compose up -d
        echo -e "${GREEN}VEX Platform started! / تم تشغيل منصة VEX!${NC}"
        echo ""
        docker compose ps
        ;;
    
    stop)
        echo -e "${YELLOW}Stopping VEX Platform... / جاري إيقاف منصة VEX...${NC}"
        docker compose down
        echo -e "${GREEN}VEX Platform stopped! / تم إيقاف منصة VEX!${NC}"
        ;;
    
    restart)
        echo -e "${YELLOW}Restarting VEX Platform... / جاري إعادة تشغيل منصة VEX...${NC}"
        docker compose restart
        echo -e "${GREEN}VEX Platform restarted! / تم إعادة تشغيل منصة VEX!${NC}"
        ;;
    
    logs)
        echo -e "${YELLOW}Showing logs... / عرض السجلات...${NC}"
        docker compose logs -f
        ;;
    
    status)
        echo -e "${YELLOW}VEX Platform Status / حالة منصة VEX:${NC}"
        docker compose ps
        ;;
    
    build)
        echo -e "${YELLOW}Rebuilding VEX Platform... / جاري إعادة بناء منصة VEX...${NC}"
        docker compose build --no-cache
        echo -e "${GREEN}Build complete! / اكتمل البناء!${NC}"
        ;;
    
    update)
        echo -e "${YELLOW}Updating VEX Platform... / جاري تحديث منصة VEX...${NC}"
        docker compose pull
        docker compose build
        docker compose up -d
        echo -e "${GREEN}Update complete! / اكتمل التحديث!${NC}"
        ;;
    
    backup)
        echo -e "${YELLOW}Creating database backup... / جاري إنشاء نسخة احتياطية...${NC}"
        BACKUP_FILE="backups/vex_backup_$(date +%Y%m%d_%H%M%S).sql"
        mkdir -p backups
        docker compose exec -T db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "$BACKUP_FILE"
        gzip "$BACKUP_FILE"
        echo -e "${GREEN}Backup created: ${BACKUP_FILE}.gz${NC}"
        ;;
    
    shell)
        echo -e "${YELLOW}Opening shell in app container... / فتح shell في حاوية التطبيق...${NC}"
        docker compose exec app sh
        ;;
    
    db-shell)
        echo -e "${YELLOW}Opening PostgreSQL shell... / فتح shell قاعدة البيانات...${NC}"
        docker compose exec db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
        ;;
    
    clean)
        echo -e "${RED}Warning: This will remove all containers, volumes, and images!${NC}"
        echo -e "${RED}تحذير: سيتم حذف جميع الحاويات والبيانات!${NC}"
        read -p "Are you sure? (y/N) / هل أنت متأكد؟ " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker compose down -v --rmi all
            echo -e "${GREEN}Cleanup complete! / اكتمل التنظيف!${NC}"
        fi
        ;;
    
    *)
        echo "Usage / الاستخدام: $0 {start|stop|restart|logs|status|build|update|backup|shell|db-shell|clean}"
        echo ""
        echo "Commands / الأوامر:"
        echo "  start    - Start all services / تشغيل جميع الخدمات"
        echo "  stop     - Stop all services / إيقاف جميع الخدمات"
        echo "  restart  - Restart all services / إعادة تشغيل جميع الخدمات"
        echo "  logs     - View logs / عرض السجلات"
        echo "  status   - Show status / عرض الحالة"
        echo "  build    - Rebuild images / إعادة بناء الصور"
        echo "  update   - Update and restart / تحديث وإعادة تشغيل"
        echo "  backup   - Backup database / نسخ احتياطي لقاعدة البيانات"
        echo "  shell    - Open app shell / فتح shell التطبيق"
        echo "  db-shell - Open database shell / فتح shell قاعدة البيانات"
        echo "  clean    - Remove everything / حذف كل شيء"
        exit 1
        ;;
esac
