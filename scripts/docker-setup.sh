#!/bin/bash

# VEX Platform - Docker Interactive Setup Script
# سكربت إعداد Docker التفاعلي لمنصة VEX

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=========================================="
echo "   VEX Platform - Docker Setup"
echo "   إعداد Docker لمنصة VEX"
echo "=========================================="
echo -e "${NC}"

# Check if Docker is installed
echo -e "${YELLOW}Checking Docker installation... / جاري التحقق من تثبيت Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed!${NC}"
    echo -e "${RED}خطأ: Docker غير مثبت!${NC}"
    echo ""
    echo "Install Docker using:"
    echo "curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed!${NC}"
    echo -e "${RED}خطأ: Docker Compose غير مثبت!${NC}"
    exit 1
fi

echo -e "${GREEN}Docker is installed! / Docker مثبت!${NC}"
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo -e "${YELLOW}Found existing .env file. / تم العثور على ملف .env موجود.${NC}"
    read -p "Do you want to reconfigure? (y/N) / هل تريد إعادة التكوين؟ " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing configuration... / استخدام التكوين الموجود..."
        SKIP_CONFIG=true
    fi
fi

if [ "$SKIP_CONFIG" != "true" ]; then
    echo ""
    echo -e "${BLUE}=== Database Configuration / تكوين قاعدة البيانات ===${NC}"
    echo ""
    
    # Database username
    read -p "Enter database username (default: vex_user): " DB_USER
    DB_USER=${DB_USER:-vex_user}
    
    # Database password
    while true; do
        read -s -p "Enter database password (min 8 characters): " DB_PASS
        echo
        if [ ${#DB_PASS} -ge 8 ]; then
            break
        else
            echo -e "${RED}Password must be at least 8 characters! / يجب أن تكون كلمة المرور 8 أحرف على الأقل!${NC}"
        fi
    done
    
    # Database name
    read -p "Enter database name (default: vex_db): " DB_NAME
    DB_NAME=${DB_NAME:-vex_db}
    
    echo ""
    echo -e "${BLUE}=== Application Configuration / تكوين التطبيق ===${NC}"
    echo ""
    
    # Session secret
    echo "Generating secure session secret... / جاري إنشاء مفتاح جلسة آمن..."
    SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
    echo -e "${GREEN}Session secret generated! / تم إنشاء مفتاح الجلسة!${NC}"
    
    # Port
    read -p "Enter application port (default: 3001): " APP_PORT
    APP_PORT=${APP_PORT:-3001}
    
    # Create .env file
    echo ""
    echo -e "${YELLOW}Creating .env file... / جاري إنشاء ملف .env...${NC}"
    
    cat > .env << EOF
# VEX Platform Environment Configuration
# تكوين بيئة منصة VEX
# Generated on: $(date)

# Database Configuration
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=$DB_NAME
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@db:5432/$DB_NAME

# Application Configuration
SESSION_SECRET=$SESSION_SECRET
PORT=$APP_PORT
NODE_ENV=production
EOF

    echo -e "${GREEN}.env file created successfully! / تم إنشاء ملف .env بنجاح!${NC}"
fi

echo ""
echo -e "${BLUE}=== Building Docker Images / بناء صور Docker ===${NC}"
echo ""

# Build images
echo -e "${YELLOW}Building Docker images... / جاري بناء صور Docker...${NC}"
docker compose build

echo -e "${GREEN}Docker images built successfully! / تم بناء صور Docker بنجاح!${NC}"

echo ""
echo -e "${BLUE}=== Starting Services / تشغيل الخدمات ===${NC}"
echo ""

# Start database first
echo -e "${YELLOW}Starting database... / جاري تشغيل قاعدة البيانات...${NC}"
docker compose up -d db

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database to be ready... / انتظار جاهزية قاعدة البيانات...${NC}"
sleep 10

# Load .env variables
set -a
source .env
set +a

# Check database health
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose exec -T db pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &> /dev/null; then
        echo -e "${GREEN}Database is ready! / قاعدة البيانات جاهزة!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Database failed to start! / فشل تشغيل قاعدة البيانات!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}=== Running Database Migrations / تشغيل ترحيلات قاعدة البيانات ===${NC}"
echo ""

# Run migrations inside the container
echo -e "${YELLOW}Pushing database schema... / جاري دفع بقالب قاعدة البيانات...${NC}"

# Load .env variables for container operations
set -a
source .env
set +a

# Run db:push inside the app container
docker compose run --rm app npm run db:push

echo -e "${GREEN}Database schema pushed successfully! / تم دفع بقالب قاعدة البيانات بنجاح!${NC}"

echo ""
echo -e "${BLUE}=== Starting Application / تشغيل التطبيق ===${NC}"
echo ""

# Start the application
docker compose up -d app

echo ""
echo -e "${GREEN}=========================================="
echo "   VEX Platform is now running!"
echo "   منصة VEX تعمل الآن!"
echo "==========================================${NC}"
echo ""
echo -e "Application URL: ${BLUE}http://localhost:${APP_PORT:-3001}${NC}"
echo -e "Admin Panel: ${BLUE}http://localhost:${APP_PORT:-3001}/admin${NC}"
echo ""
echo "Useful commands / أوامر مفيدة:"
echo "  View logs / عرض السجلات:      docker compose logs -f"
echo "  Stop services / إيقاف الخدمات: docker compose down"
echo "  Restart / إعادة التشغيل:       docker compose restart"
echo "  Status / الحالة:               docker compose ps"
echo ""
echo -e "${YELLOW}Note: First time setup may take a few moments.${NC}"
echo -e "${YELLOW}ملاحظة: الإعداد الأول قد يستغرق بعض الوقت.${NC}"
