#!/bin/bash

# VEX Platform - Installation Script for VPS
# سكربت تثبيت منصة VEX على VPS

set -e

echo "=========================================="
echo "   VEX Platform - VPS Installation"
echo "   منصة VEX - تثبيت على VPS"
echo "=========================================="

# Update system
echo "Updating system... / جاري تحديث النظام..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "Installing Node.js 20... / جاري تثبيت Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install PostgreSQL
echo "Installing PostgreSQL... / جاري تثبيت PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Install PM2 for process management
echo "Installing PM2... / جاري تثبيت PM2..."
sudo npm install -g pm2

# Install Nginx
echo "Installing Nginx... / جاري تثبيت Nginx..."
sudo apt install -y nginx

# Install Certbot for SSL
echo "Installing Certbot... / جاري تثبيت Certbot..."
sudo apt install -y certbot python3-certbot-nginx

echo "=========================================="
echo "Installation complete! / اكتمل التثبيت!"
echo "=========================================="
echo ""
echo "Next steps / الخطوات التالية:"
echo "1. Create PostgreSQL database / أنشئ قاعدة بيانات PostgreSQL"
echo "2. Configure .env file / قم بتكوين ملف .env"
echo "3. Run: ./scripts/start.sh / شغّل: ./scripts/start.sh"
