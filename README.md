uh,;# VEX - Gaming & P2P Trading Platform

<div align="center">

![VEX Platform](https://img.shields.io/badge/VEX-Gaming%20Platform-00c853?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node](https://img.shields.io/badge/node-20.x-brightgreen?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge)

**A comprehensive gaming and P2P trading platform with Binance-inspired design**

[English](#overview) | [العربية](#نظرة-عامة)

</div>

---

## Overview

VEX is a full-stack gaming and P2P (peer-to-peer) trading platform inspired by platforms like 1xBet and Binance P2P. It provides a complete solution for managing user accounts, financial transactions, agent/affiliate systems, complaints handling, game management, and real-time notifications.

### Key Features

- **Multi-Role System**: Admin, Agent, Affiliate, and Player roles with role-based access control
- **P2P Trading**: Buy and sell with multiple payment methods and currencies
- **Game Management**: Support for multiple game types with RTP controls and betting limits
- **Real-time Notifications**: Push notifications with sound alerts and offline email delivery
- **Multilingual Support**: Full Arabic and English localization (RTL/LTR)
- **Wallet System**: Multi-currency wallet with deposit, withdrawal, and transfer capabilities
- **Agent/Affiliate System**: Commission tracking, referral codes, and payout management
- **Admin Dashboard**: Comprehensive control panel with analytics and user management
- **Privacy Controls**: Stealth mode and online status visibility settings
- **Responsive Design**: Dark theme optimized for desktop and mobile

---

## نظرة عامة

VEX هي منصة متكاملة للألعاب والتداول P2P مستوحاة من منصات مثل 1xBet و Binance P2P. توفر حلاً شاملاً لإدارة حسابات المستخدمين والمعاملات المالية ونظام الوكلاء والعمولات.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
  - [Local Development](#local-development)
  - [Docker Deployment](#docker-deployment)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)
- [Admin Panel](#admin-panel)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [ChatGPT Project Summary](#chatgpt-project-summary-copy--paste)
- [Hostinger VPS Deployment Guide](#hostinger-vps-deployment-guide-ubuntu-2404-lts)
- [Admin Dashboard Configuration](#admin-dashboard-configuration-guide)
- [Authentication Setup](#authentication-setup-guide)
- [OTP/SMS Setup](#otpsms-setup-with-twilio)
- [Push Notifications Setup](#push-notifications-setup)
- [Mobile App Conversion](#mobile-app-conversion-guide)
- [Complete Environment Checklist](#complete-environment-checklist)
- [Contributing](#contributing)

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI Components** | shadcn/ui, Radix UI, Tailwind CSS |
| **State Management** | TanStack React Query |
| **Backend** | Express.js, TypeScript |
| **Database** | PostgreSQL with Drizzle ORM |
| **Authentication** | JWT with bcrypt password hashing |
| **Real-time** | WebSocket (ws) |
| **Forms** | React Hook Form + Zod validation |
| **Routing** | Wouter (frontend), Express Router (backend) |

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        VEX Platform                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   React     │    │   Express   │    │  PostgreSQL │         │
│  │  Frontend   │◄──►│   Backend   │◄──►│   Database  │         │
│  │  (Vite)     │    │   (API)     │    │  (Drizzle)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────┐    ┌─────────────┐                            │
│  │  WebSocket  │    │   Service   │                            │
│  │  Real-time  │    │   Worker    │                            │
│  │  Updates    │    │   (Push)    │                            │
│  └─────────────┘    └─────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
vex/
├── client/                      # Frontend React application
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── ui/              # shadcn/ui base components
│   │   │   └── ...              # Custom components
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── use-auth.tsx     # Authentication hook
│   │   │   ├── use-i18n.tsx     # Internationalization hook
│   │   │   └── use-toast.ts     # Toast notifications
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── queryClient.ts   # React Query configuration
│   │   │   ├── notifications.ts # Push notification utilities
│   │   │   └── utils.ts         # Helper functions
│   │   ├── pages/               # Page components
│   │   │   ├── admin/           # Admin panel pages
│   │   │   ├── dashboard.tsx    # User dashboard
│   │   │   ├── wallet.tsx       # Wallet management
│   │   │   ├── p2p.tsx          # P2P trading
│   │   │   ├── games.tsx        # Games lobby
│   │   │   ├── settings.tsx     # User settings
│   │   │   └── ...
│   │   ├── App.tsx              # Main application component
│   │   ├── main.tsx             # Application entry point
│   │   └── index.css            # Global styles & Tailwind
│   └── public/
│       └── sw.js                # Service worker for push notifications
│
├── server/                      # Backend Express application
│   ├── index.ts                 # Server entry point
│   ├── routes.ts                # API routes (user-facing)
│   ├── admin-routes.ts          # Admin API routes
│   ├── storage.ts               # Data access layer
│   ├── db.ts                    # Database connection
│   ├── websocket.ts             # WebSocket handler
│   ├── seed.ts                  # Database seeding
│   ├── vite.ts                  # Vite dev server integration
│   └── static.ts                # Static file serving
│
├── shared/                      # Shared code (frontend & backend)
│   └── schema.ts                # Database schema & types (Drizzle)
│
├── scripts/                     # Utility scripts
│   ├── seed-data.ts             # Production data seeding
│   └── ...
│
├── docker/                      # Docker configuration
│   └── nginx.conf               # Nginx reverse proxy config
│
├── PROJECT_KNOWLEDGE_ENGINE/    # Centralized project knowledge and legacy docs
│
├── Dockerfile                   # Docker image definition
├── docker-compose.yml           # Docker Compose configuration
├── package.json                 # Node.js dependencies
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite build configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── drizzle.config.ts            # Drizzle ORM configuration
└── PROJECT_KNOWLEDGE_ENGINE/03_DESIGN_MOBILE_I18N_SEO.md  # Design/mobile/i18n/SEO baseline
```

---

## Prerequisites

### Required

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v15.x or higher

### Optional (for Docker deployment)

- **Docker**: v24.x or higher
- **Docker Compose**: v2.x or higher

---

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required Variables

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/vex_db
PGUSER=username
PGPASSWORD=password
PGDATABASE=vex_db
PGHOST=localhost
PGPORT=5432

# Security
SESSION_SECRET=your-super-secret-session-key-min-32-chars
```

### Optional Variables (External Integrations)

```env
# Email Service (for notifications)
SENDGRID_API_KEY=your-sendgrid-api-key

# SMS Service
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Payment Gateway
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key

# Push Notifications
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
```

### Environment Variables Description

#### Database Variables (Required)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Full PostgreSQL connection string in format: `postgresql://user:password@host:port/database` |
| `PGUSER` | Yes | PostgreSQL username for database authentication |
| `PGPASSWORD` | Yes | PostgreSQL password for database authentication |
| `PGDATABASE` | Yes | Name of the PostgreSQL database (e.g., `vex_db`) |
| `PGHOST` | Yes | PostgreSQL server hostname (e.g., `localhost` or `db` for Docker) |
| `PGPORT` | Yes | PostgreSQL server port (default: `5432`) |

#### Security Variables (Required)

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Secret key for encrypting session cookies. Must be at least 32 characters. Use a random string generator for production. |
| `NODE_ENV` | No | Environment mode: `development` or `production`. Defaults to `development`. |
| `PORT` | No | Server port number. Defaults to `3001`. |

#### Email Service (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDGRID_API_KEY` | No | SendGrid API key for sending email notifications (deposits, withdrawals, P2P trades) |

#### SMS Service (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | No | Twilio Account SID for SMS verification and notifications |
| `TWILIO_AUTH_TOKEN` | No | Twilio Auth Token for API authentication |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number in E.164 format (e.g., `+1234567890`) |

#### OAuth Providers (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | No | Google OAuth 2.0 Client ID for social login |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth 2.0 Client Secret |
| `FACEBOOK_APP_ID` | No | Facebook App ID for social login |
| `FACEBOOK_APP_SECRET` | No | Facebook App Secret |
| `TELEGRAM_BOT_TOKEN` | No | Telegram Bot Token for Telegram authentication |
| `TWITTER_API_KEY` | No | Twitter/X API Key for social login |
| `TWITTER_API_SECRET` | No | Twitter/X API Secret |

#### Payment Gateway (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | No | Stripe Secret Key (starts with `sk_`) for payment processing |
| `STRIPE_PUBLISHABLE_KEY` | No | Stripe Publishable Key (starts with `pk_`) for frontend |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe Webhook Secret for verifying webhook events |

#### Push Notifications (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | No | Firebase project ID for push notifications |
| `FIREBASE_PRIVATE_KEY` | No | Firebase service account private key (JSON format) |
| `FIREBASE_CLIENT_EMAIL` | No | Firebase service account client email |

---

## Installation

### Local Development

1. **Clone the repository**

```bash
git clone https://github.com/your-username/vex.git
cd vex
```

1. **Install dependencies**

```bash
npm install
```

1. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

1. **Create the database**

```bash
# Create PostgreSQL database
createdb vex_db

# Or using psql
psql -U postgres -c "CREATE DATABASE vex_db;"
```

1. **Push database schema**

```bash
npm run db:push
```

1. **Seed initial data (optional)**

```bash
npx tsx scripts/seed-data.ts
```

1. **Start development server**

```bash
npm run dev
```

The application will be available at `http://localhost:3001`

---

### Docker Deployment

1. **Clone the repository**

```bash
git clone https://github.com/your-username/vex.git
cd vex
```

1. **Configure environment**

```bash
# Create .env file for Docker
cat > .env << EOF
POSTGRES_USER=vex_user
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=vex_db
SESSION_SECRET=your-super-secret-session-key-min-32-chars
EOF
```

1. **Build and start containers**

```bash
# Start with PostgreSQL and App
docker-compose up -d

# Or with Nginx reverse proxy
docker-compose --profile with-nginx up -d
```

1. **Push database schema**

```bash
docker-compose exec app npx drizzle-kit push
```

1. **Seed initial data (optional)**

```bash
docker-compose exec app npx tsx scripts/seed-data.ts
```

1. **View logs**

```bash
docker-compose logs -f app
```

#### Docker Commands Reference

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild after changes
docker-compose up -d --build

# View logs
docker-compose logs -f

# Access app container shell
docker-compose exec app sh

# Access database
docker-compose exec db psql -U vex_user -d vex_db

# Backup database
docker-compose exec db pg_dump -U vex_user vex_db > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T db psql -U vex_user -d vex_db
```

---

## Database Setup

### Schema Overview

The database includes the following main tables:

| Table | Description |
|-------|-------------|
| `users` | User accounts with roles, balances, VIP levels |
| `transactions` | Financial transaction history |
| `agents` | Agent accounts with commission settings |
| `affiliates` | Affiliate tracking with promo codes |
| `complaints` | Support ticket system |
| `complaint_messages` | Ticket conversation threads |
| `games` | Game catalog with configurations |
| `game_sessions` | Active game sessions |
| `chat_messages` | Real-time messaging |
| `promo_codes` | Promotional codes |
| `currencies` | Supported currencies |
| `payment_methods` | Available payment methods |
| `p2p_trades` | P2P trade orders |
| `audit_logs` | Admin action logging |
| `financial_limits` | User/agent financial limits |

### Database Commands

```bash
# Push schema changes to database
npm run db:push

# Generate migration files (if using migrations)
npx drizzle-kit generate

# Open Drizzle Studio (database GUI)
npx drizzle-kit studio
```

---

## Running the Application

### One-Command Local Startup (Windows PowerShell)

```powershell
# Local development (loads .env, starts infra if available, runs server)
.\scripts\start-local.ps1 -Mode dev

# Local production (loads .env.production.local, starts infra, runs dist server)
.\scripts\start-local.ps1 -Mode prod

# Force production rebuild before start
.\scripts\start-local.ps1 -Mode prod -Build
```

### Development Mode

```bash
npm run dev
```

- Frontend: Hot reload enabled via Vite
- Backend: Auto-restart via tsx
- URL: <http://localhost:3001>

### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm start
```

### TypeScript Check

```bash
npm run check
```

---

## Production Deployment

### Option 1: Automated Docker Production (Recommended)

Use the built-in production automation scripts for first-run setup and safe updates.

#### First Run (auto setup + deploy + verification)

```bash
# From project root on VPS
bash ./scripts/prod-auto.sh --domain vixo.click
```

What this does automatically:

- Creates `.env.production.local` from `.env.production` if missing
- Detects and/or creates the shared Traefik network
- Auto-detects the running Traefik container (even when hosted in a separate Compose project)
- Persists required server tuning (`vm.overcommit_memory=1`) for Redis
- Prepares runtime directories and permissions (`logs`, `uploads`)
- Starts required services and validates container health
- Verifies app routing through Traefik for production domain

If Traefik is running under a non-standard container name, pass it explicitly:

```bash
bash ./scripts/prod-auto.sh --domain vixo.click --traefik-container traefik-mebu-traefik-1
```

#### Updates (backup + pull + redeploy + verification)

```bash
bash ./scripts/prod-update.sh --domain vixo.click
```

`prod-update.sh` performs a DB backup (when possible), pulls `origin/main`, and re-runs the same production safety checks before completing.

For real-world production diagnostics and Traefik runtime caveats, see `docs/PRODUCTION_TRAEFIK_RUNTIME_NOTES_2026-04-07.md`.

### Option 2: Docker (Manual)

```bash
# Build production image
docker build -t vex:latest .

# Run with environment variables
docker run -d \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e SESSION_SECRET=your-secret \
  --name vex-app \
  vex:latest
```

### Option 3: Node.js Direct

1. **Build the application**

```bash
npm run build
```

1. **Set environment variables**

```bash
export NODE_ENV=production
export DATABASE_URL=postgresql://...
export SESSION_SECRET=...
```

1. **Start the server**

```bash
npm start
```

### Option 4: PM2 Process Manager

```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem config
pm2 start ecosystem.config.js

# Or start directly
pm2 start npm --name "vex" -- start

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

### SSL/TLS Configuration

For production with HTTPS, use the included Nginx configuration:

```bash
# Start with Nginx profile
docker-compose --profile with-nginx up -d
```

Place your SSL certificates in `docker/ssl/`:

- `docker/ssl/cert.pem`
- `docker/ssl/key.pem`

---

## API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/admin/login` | Admin login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | User logout |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/preferences` | Get user preferences |
| PATCH | `/api/user/preferences` | Update preferences |
| PATCH | `/api/user/status` | Update online status |
| GET | `/api/user/balance` | Get wallet balance |

### Transaction Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | Get transaction history |
| POST | `/api/deposit` | Request deposit |
| POST | `/api/withdraw` | Request withdrawal |

### P2P Trading Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/p2p/trades` | Get available trades |
| POST | `/api/p2p/trades` | Create new trade |
| PATCH | `/api/p2p/trades/:id` | Update trade status |

### Game Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/games` | Get all games |
| GET | `/api/games/:id` | Get game details |
| POST | `/api/games/:id/session` | Start game session |

### Admin Endpoints

All admin endpoints require Bearer token authentication:

```
Authorization: Bearer <admin-token>
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/transactions` | List all transactions |
| GET | `/api/admin/stats` | Get platform statistics |
| POST | `/api/admin/broadcast` | Send broadcast message |

---

## Admin Panel

Access the admin panel at `/admin` after logging in with admin credentials.

### Admin Features

- **Dashboard**: Platform statistics and analytics
- **User Management**: View, edit, and manage users
- **Transaction Management**: Approve/reject deposits and withdrawals
- **Agent Management**: Manage agents and commissions
- **Affiliate Management**: Track affiliates and payouts
- **Game Management**: Configure games and limits
- **Payment Methods**: Manage payment options
- **Currencies**: Configure supported currencies
- **Integrations**: Configure external services
- **Audit Logs**: View admin action history
- **Broadcast**: Send messages to all users

### Default Admin Credentials

```
Username: admin
Password: admin123
```

**Important**: Change these credentials immediately after first login!

---

## Security Considerations

1. **Change default credentials** before deploying to production
2. **Use strong SESSION_SECRET** (minimum 32 characters)
3. **Enable HTTPS** in production using Nginx or a reverse proxy
4. **Database backups**: Schedule regular backups
5. **Environment variables**: Never commit `.env` files to version control
6. **Rate limiting**: Configure rate limits for API endpoints
7. **Input validation**: All inputs are validated using Zod schemas

---

## Troubleshooting

### Common Issues

**Database connection failed**

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify connection string
psql $DATABASE_URL -c "SELECT 1"
```

**Port 3001 already in use**

```bash
# Find and kill process
lsof -i :3001
kill -9 <PID>
```

**Build fails**

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Check TypeScript errors
npm run check
```

**Docker container won't start**

```bash
# Check logs
docker-compose logs app

# Rebuild from scratch
docker-compose down -v
docker-compose up -d --build
```

---

## ChatGPT Project Summary (Copy & Paste)

Use this section to share with ChatGPT or any AI assistant to get help with deployment and configuration:

<details>
<summary>📋 Click to expand - Copy this text for ChatGPT</summary>

```
I have a VEX Gaming & P2P Trading Platform that I need help deploying. Here's the project summary:

**PROJECT TYPE:**
Full-stack web application for gaming and peer-to-peer cryptocurrency/fiat trading

**TECH STACK:**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Express.js + TypeScript
- Database: PostgreSQL with Drizzle ORM
- Authentication: JWT tokens with bcrypt password hashing
- Real-time: WebSocket for live updates
- Containerization: Docker + Docker Compose

**KEY FEATURES:**
1. Multi-role user system (Admin, Agent, Affiliate, Player)
2. P2P trading marketplace (buy/sell with 85+ currencies)
3. Wallet system with deposits, withdrawals, transfers
4. Game management with RTP controls and betting limits
5. Agent/Affiliate commission tracking
6. Push notifications with sound alerts
7. Bilingual support (English/Arabic with RTL)
8. Admin dashboard with full platform control

**PROJECT STRUCTURE:**
- /client - React frontend (Vite)
- /server - Express.js backend
- /shared - Shared TypeScript schemas (Drizzle)
- /scripts - Utility scripts for seeding data
- Dockerfile and docker-compose.yml for containerization

**REQUIRED ENVIRONMENT VARIABLES:**
- DATABASE_URL - PostgreSQL connection string
- SESSION_SECRET - JWT session encryption key (32+ chars)
- PGUSER, PGPASSWORD, PGDATABASE, PGHOST, PGPORT

**OPTIONAL INTEGRATIONS:**
- TWILIO_* - For SMS/OTP verification
- SENDGRID_API_KEY - For email notifications
- GOOGLE_CLIENT_ID/SECRET - Google OAuth login
- FACEBOOK_APP_ID/SECRET - Facebook OAuth login
- STRIPE_SECRET_KEY - Payment processing
- FIREBASE_* - Push notifications

**DEPLOYMENT TARGET:**
Hostinger VPS with Ubuntu 24.04 LTS using Docker

**COMMANDS:**
- npm run dev - Development server
- npm run build - Build for production
- npm start - Start production server
- npm run db:push - Push database schema

Please help me with [YOUR SPECIFIC QUESTION HERE]
```

</details>

---

## Hostinger VPS Deployment Guide (Ubuntu 24.04 LTS)

### دليل النشر على Hostinger VPS خطوة بخطوة

This is a complete step-by-step guide to deploy VEX on a Hostinger VPS running Ubuntu 24.04 LTS.

### Step 1: Initial Server Setup

```bash
# Connect to your VPS via SSH
ssh root@your-vps-ip

# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y curl wget git nano ufw

# Configure firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw enable
```

### Step 2: Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Start Docker and enable on boot
systemctl start docker
systemctl enable docker

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### Step 3: Create Application User (Security Best Practice)

```bash
# Create a non-root user for the application
adduser vexapp
usermod -aG docker vexapp
usermod -aG sudo vexapp

# Switch to the new user
su - vexapp
```

### Step 4: Clone and Configure the Project

```bash
# Create application directory
mkdir -p ~/apps
cd ~/apps

# Clone your repository (replace with your repo URL)
git clone https://github.com/your-username/vex.git
cd vex

# Create environment file
nano .env
```

Add the following to `.env`:

```env
# Database Configuration
POSTGRES_USER=vex_user
POSTGRES_PASSWORD=YourSecurePassword123!
POSTGRES_DB=vex_db

# Application Settings
NODE_ENV=production
PORT=3001
SESSION_SECRET=your-super-secret-key-minimum-32-characters-long

# Optional: External Services (add as needed)
# SENDGRID_API_KEY=your-sendgrid-key
# TWILIO_ACCOUNT_SID=your-twilio-sid
# TWILIO_AUTH_TOKEN=your-twilio-token
# TWILIO_PHONE_NUMBER=+1234567890
```

### Step 5: Build and Start with Docker

```bash
# Build and start all services
docker compose up -d --build

# Wait for containers to be healthy
docker compose ps

# Check logs
docker compose logs -f app
```

### Step 6: Initialize Database

```bash
# Push database schema
docker compose exec app npx drizzle-kit push

# Seed initial data (currencies, payment methods, games)
docker compose exec app npx tsx scripts/seed-data.ts

# Create admin user (if not seeded)
docker compose exec app npx tsx -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('admin123', 10);
console.log('Admin password hash:', hash);
"
```

### Step 7: Configure Domain and SSL (Optional but Recommended)

```bash
# Install Certbot for SSL
apt install -y certbot

# Get SSL certificate (replace with your domain)
certbot certonly --standalone -d your-domain.com

# Copy certificates to Docker
mkdir -p docker/ssl
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/ssl/key.pem

# Restart with Nginx
docker compose --profile with-nginx up -d
```

### Step 8: Verify Deployment

```bash
# Check all containers are running
docker compose ps

# Test health endpoint
curl http://localhost:3001/api/health

# Access the application
# http://your-vps-ip:3001
# or https://your-domain.com (if SSL configured)
```

### Useful VPS Commands

```bash
# View real-time logs
docker compose logs -f

# Restart application
docker compose restart app

# Stop all services
docker compose down

# Update and redeploy
git pull
docker compose up -d --build

# Backup database
docker compose exec db pg_dump -U vex_user vex_db > backup_$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker compose exec -T db psql -U vex_user -d vex_db

# Check disk space
df -h

# Check memory usage
free -m

# Check container resources
docker stats
```

---

## Admin Dashboard Configuration Guide

### دليل إعداد لوحة التحكم

Access the admin panel at `/admin` after logging in with admin credentials.

### Default Admin Login

```
URL: https://your-domain.com/admin
Username: admin
Password: admin123
```

**⚠️ IMPORTANT: Change the default password immediately after first login!**

### Dashboard Sections & Configuration

#### 1. Users Management (`/admin/users`)

| Setting | Description | How to Configure |
|---------|-------------|------------------|
| User Roles | Assign roles (player/agent/affiliate) | Edit user → Select role |
| VIP Level | Set VIP tier (0-10) | Edit user → Set VIP level |
| Balance | View/adjust user balance | Edit user → Modify balance |
| Status | Enable/disable accounts | Toggle active status |
| Verification | KYC verification status | Review documents, approve/reject |

#### 2. Transactions Management (`/admin/transactions`)

| Setting | Description | Action |
|---------|-------------|--------|
| Pending Deposits | Review deposit requests | Approve or Reject |
| Pending Withdrawals | Review withdrawal requests | Approve or Reject |
| Transaction History | View all platform transactions | Filter by type/status/date |

#### 3. Agents Management (`/admin/agents`)

| Setting | Description | Default |
|---------|-------------|---------|
| Commission Rate | Agent's commission percentage | 5% |
| Payment Methods | Agent's accepted payments | Set per agent |
| Limits | Daily/monthly transaction limits | Configure per agent |
| Status | Active/inactive | Toggle |

#### 4. Games Management (`/admin/games`)

| Setting | Description | Range |
|---------|-------------|-------|
| RTP (Return to Player) | Win percentage | 85-99% |
| Min Bet | Minimum bet amount | Set per game |
| Max Bet | Maximum bet amount | Set per game |
| Volatility | High/Medium/Low | Select |
| Status | Enable/disable game | Toggle |
| Pricing Type | Free/Paid/Bet-based | Select |

#### 5. Payment Methods (`/admin/payment-methods`)

| Field | Description |
|-------|-------------|
| Name | Payment method name (e.g., "Bank Transfer") |
| Type | Category (bank/e-wallet/crypto) |
| Currency | Supported currency |
| Min/Max Amount | Transaction limits |
| Fee | Processing fee percentage |
| Status | Active/inactive |

#### 6. Currencies (`/admin/currencies`)

| Field | Description |
|-------|-------------|
| Code | Currency code (e.g., USD, BTC) |
| Symbol | Currency symbol ($, ₿) |
| Type | Fiat or Crypto |
| Exchange Rate | Rate to base currency |
| Status | Active/inactive |

#### 7. Integrations (`/admin/integrations`)

Check connection status for:

- **Twilio** - SMS/OTP verification
- **SendGrid** - Email notifications
- **Google OAuth** - Social login
- **Facebook OAuth** - Social login
- **Telegram** - Bot authentication
- **Stripe** - Payment processing
- **Firebase** - Push notifications

---

## Authentication Setup Guide

### إعداد نظام تسجيل الدخول والمصادقة

### JWT Authentication (Built-in)

JWT authentication is pre-configured. Key settings:

```typescript
// server/routes.ts
const JWT_SECRET = process.env.SESSION_SECRET;
const TOKEN_EXPIRY = '7d'; // Token valid for 7 days
```

### Setting Up OAuth Providers

For production-safe Web/Mobile OAuth setup (provider-compliant), follow `docs/SOCIAL_LOGIN_WEB_MOBILE_COMPLIANCE.md`.

#### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth client ID"
5. Select "Web application"
6. Add authorized redirect URIs:

- `https://your-domain.com/api/auth/social/google/callback`

7. Copy Client ID and Client Secret
2. Add to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

#### Facebook OAuth Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app → Select "Consumer"
3. Add Facebook Login product
4. Configure Valid OAuth Redirect URIs:

- `https://your-domain.com/api/auth/social/facebook/callback`

5. Copy App ID and App Secret
2. Add to `.env`:

```env
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
```

#### Telegram Login Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the bot token
4. Set your domain with `/setdomain`
5. Add to `.env`:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
```

---

## OTP/SMS Setup with Twilio

### إعداد التحقق عبر الرسائل القصيرة

### Step 1: Create Twilio Account

1. Sign up at [Twilio Console](https://console.twilio.com/)
2. Complete verification
3. Get a phone number from Twilio

### Step 2: Get API Credentials

1. Go to Twilio Console Dashboard
2. Copy Account SID and Auth Token
3. Note your Twilio phone number

### Step 3: Configure Environment

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 4: Test SMS Sending

```bash
# Test from command line
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "From=$TWILIO_PHONE_NUMBER" \
  -d "To=+recipient-number" \
  -d "Body=Test OTP: 123456"
```

### OTP Flow in VEX

1. User requests OTP → Backend generates 6-digit code
2. Backend sends SMS via Twilio
3. Code stored with 5-minute expiry
4. User enters code → Backend validates
5. On success → User authenticated

---

## Push Notifications Setup

### إعداد الإشعارات الفورية

### Option 1: Browser Push Notifications (Built-in)

The platform includes a service worker for browser notifications. No additional setup required for basic functionality.

```javascript
// client/src/lib/notifications.ts
// Built-in notification functions:
// - showNotification(title, body, options)
// - playNotificationSound()
// - requestNotificationPermission()
```

### Option 2: Firebase Cloud Messaging (FCM)

For mobile-style push notifications:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Go to Project Settings → Service Accounts
4. Generate new private key (JSON file)
5. Add to `.env`:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

### Email Notifications Setup (SendGrid)

1. Sign up at [SendGrid](https://sendgrid.com/)
2. Create an API key with "Mail Send" permissions
3. Verify a sender email address
4. Add to `.env`:

```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@your-domain.com
```

---

## Mobile App Conversion Guide

### تحويل المشروع لتطبيق موبايل

### Option 1: Capacitor (Recommended)

See [PROJECT_KNOWLEDGE_ENGINE/legacy/root-docs/MOBILE_APP_BUILD.md](PROJECT_KNOWLEDGE_ENGINE/legacy/root-docs/MOBILE_APP_BUILD.md) for detailed instructions on building the mobile app using Capacitor.

### Option 2: Progressive Web App (PWA)

The app is already PWA-ready with the service worker. Users can:

1. Open the website in Chrome/Safari
2. Click "Add to Home Screen"
3. App installs as native-like experience

---

## Complete Environment Checklist

### قائمة فحص البيئة الكاملة قبل التشغيل

Use this checklist before deploying to production:

### Server Requirements

- [ ] Ubuntu 24.04 LTS or compatible
- [ ] Minimum 2GB RAM
- [ ] Minimum 20GB storage
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] Ports 80, 443, 3001 open in firewall

### Required Environment Variables

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `PGUSER` - Database username
- [ ] `PGPASSWORD` - Database password (strong, 16+ chars)
- [ ] `PGDATABASE` - Database name
- [ ] `PGHOST` - Database host
- [ ] `PGPORT` - Database port (usually 5432)
- [ ] `SESSION_SECRET` - Random string (32+ chars)

### Optional Integrations Checklist

#### SMS/OTP (Twilio)

- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_PHONE_NUMBER`

#### Email (SendGrid)

- [ ] `SENDGRID_API_KEY`
- [ ] Sender email verified

#### Google OAuth

- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] Redirect URI configured

#### Facebook OAuth

- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] Valid OAuth Redirect URI

#### Telegram

- [ ] `TELEGRAM_BOT_TOKEN`
- [ ] Domain set with BotFather

#### Payments (Stripe)

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_PUBLISHABLE_KEY`
- [ ] Webhook endpoint configured

#### Push Notifications (Firebase)

- [ ] `FIREBASE_PROJECT_ID`
- [ ] `FIREBASE_CLIENT_EMAIL`
- [ ] `FIREBASE_PRIVATE_KEY`

### Database Initialization

- [ ] Schema pushed with `npm run db:push`
- [ ] Seed data loaded (currencies, payment methods, games)
- [ ] Admin user created and password changed

### Security Checklist

- [ ] Default admin password changed
- [ ] SSL/TLS certificate installed
- [ ] Firewall configured (UFW)
- [ ] No `.env` files in git repository
- [ ] Strong SESSION_SECRET set
- [ ] Database accessible only internally

### Post-Deployment Verification

- [ ] Health endpoint returns 200: `/api/health`
- [ ] Admin login works at `/admin`
- [ ] User registration works
- [ ] Database queries successful
- [ ] WebSocket connection established

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

For support, email <support@vex-platform.com> or open an issue on GitHub.

---

<div align="center">

**Built with ❤️ by VEX Team**

</div>
