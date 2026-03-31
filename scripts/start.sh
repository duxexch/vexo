#!/bin/bash

# VEX Platform - Production Startup Script
# سكربت تشغيل منصة VEX للإنتاج

set -e

echo "=========================================="
echo "   VEX Platform - Production Startup"
echo "   منصة VEX - بدء التشغيل للإنتاج"
echo "=========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "خطأ: ملف .env غير موجود!"
    echo "Please copy .env.example to .env and configure it."
    echo "يرجى نسخ .env.example إلى .env وتكوينه."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL is not set!"
    echo "خطأ: DATABASE_URL غير محدد!"
    exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
    echo "Error: SESSION_SECRET is not set!"
    echo "خطأ: SESSION_SECRET غير محدد!"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies... / جاري تثبيت المتطلبات..."
    npm ci --omit=dev
fi

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "Building project... / جاري بناء المشروع..."
    npm run build
fi

echo "Running database migrations... / جاري تشغيل ترحيلات قاعدة البيانات..."
npm run db:push

echo "Starting server... / جاري تشغيل الخادم..."
NODE_ENV=production node dist/server/index.js
