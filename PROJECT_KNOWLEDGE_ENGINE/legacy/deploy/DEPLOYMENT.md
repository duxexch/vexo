# VEX Platform - Hostinger VPS Deployment Guide
## Optimized for 20,000+ Concurrent Users

## Prerequisites

- Hostinger VPS with Ubuntu 22.04 LTS (Recommended: KVM 4 with 4GB+ RAM)
- SSH access to your VPS
- Domain name pointed to your VPS IP
- PostgreSQL database (Hostinger managed or self-hosted)

## Server Requirements for 20,000 Users

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4GB | 8GB |
| CPU | 2 cores | 4 cores |
| Storage | 20GB SSD | 50GB SSD |
| Bandwidth | 2TB/mo | 5TB/mo |

## Quick Start

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git nginx postgresql-client ufw fail2ban

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash vex
sudo mkdir -p /var/www/vex /var/log/vex
sudo chown -R vex:vex /var/www/vex /var/log/vex

# Optimize system for high connections (add to /etc/sysctl.conf)
echo "
# VEX Performance Tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_max_tw_buckets = 65535
fs.file-max = 2097152
" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Increase open file limits (add to /etc/security/limits.conf)
echo "
vex soft nofile 65535
vex hard nofile 65535
* soft nofile 65535
* hard nofile 65535
" | sudo tee -a /etc/security/limits.conf
```

### 2. Database Setup

If using external PostgreSQL (recommended for Hostinger):
```bash
# Your DATABASE_URL will look like:
# postgresql://username:password@host:5432/database?sslmode=require
```

If self-hosting PostgreSQL:
```bash
sudo apt install -y postgresql postgresql-contrib

# Optimize PostgreSQL for high traffic (edit postgresql.conf)
sudo nano /etc/postgresql/14/main/postgresql.conf
# Set these values:
# max_connections = 100
# shared_buffers = 1GB
# effective_cache_size = 3GB
# work_mem = 16MB
# maintenance_work_mem = 256MB

sudo -u postgres createuser --interactive  # Create 'vex' user
sudo -u postgres createdb vex
sudo -u postgres psql -c "ALTER USER vex WITH PASSWORD 'your-secure-password';"
sudo systemctl restart postgresql
```

### 3. Deploy Application

```bash
# Switch to vex user
sudo su - vex
cd /var/www/vex

# Clone repository
git clone https://github.com/yourusername/vex-platform.git .

# Install dependencies
npm ci --production=false

# Build production
npm run build

# Remove dev dependencies
npm prune --production

# Create environment file
cat > .env << 'EOF'
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@host:5432/vex?sslmode=require
SESSION_SECRET=$(openssl rand -hex 32)

# Database pool - optimized for high traffic
DB_POOL_MAX=50
DB_POOL_MIN=5
DB_SSL_REJECT_UNAUTHORIZED=false

# Admin JWT (generate unique secret)
ADMIN_JWT_SECRET=$(openssl rand -hex 32)
EOF

# Run database migrations (first time only)
ALLOW_FORCE_MIGRATIONS=true npx drizzle-kit push

# Start with PM2
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions to enable startup
```

### 4. Admin Bootstrap (First Run Only)

```bash
# Set temporary admin credentials
# Password must be at least 16 characters
export ADMIN_BOOTSTRAP_PASSWORD="YourSecureAdminPassword123!"
export ADMIN_BOOTSTRAP_EMAIL="admin@yourdomain.com"

# Restart to create admin
pm2 restart vex-platform

# Wait for admin creation, then IMMEDIATELY unset
unset ADMIN_BOOTSTRAP_PASSWORD
unset ADMIN_BOOTSTRAP_EMAIL

# Verify admin was created
curl http://localhost:5000/api/health

# SECURITY: Never store these in .env file
```

### 5. Nginx Setup

```bash
# Exit to root user
exit

# Optimize nginx for high traffic (edit /etc/nginx/nginx.conf)
sudo nano /etc/nginx/nginx.conf
# Set these in http block:
# worker_processes auto;
# worker_rlimit_nofile 65535;
# events { worker_connections 4096; multi_accept on; }

# Copy nginx config
sudo cp /var/www/vex/deploy/nginx.conf /etc/nginx/sites-available/vex

# Edit domain name
sudo nano /etc/nginx/sites-available/vex
# Replace 'yourdomain.com' with your actual domain

# Enable site
sudo ln -s /etc/nginx/sites-available/vex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal test
sudo certbot renew --dry-run

# Add auto-renewal to cron (optional, certbot does this automatically)
# sudo crontab -e
# 0 0 * * * /usr/bin/certbot renew --quiet
```

### 7. Firewall & Security

```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable

# Configure fail2ban for SSH protection
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
# Set: bantime = 3600, maxretry = 3

sudo systemctl restart fail2ban
sudo systemctl enable fail2ban
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Yes | Server port (default: 5000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string with SSL |
| `SESSION_SECRET` | Yes | Min 32 chars for user JWT |
| `ADMIN_JWT_SECRET` | Yes | Separate secret for admin JWT |
| `DB_POOL_MAX` | No | Max DB connections (default: 50) |
| `DB_POOL_MIN` | No | Min idle connections (default: 5) |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | Set to `false` for self-signed certs |
| `ADMIN_BOOTSTRAP_PASSWORD` | Once | Initial admin password (min 16 chars) |
| `ADMIN_BOOTSTRAP_EMAIL` | Once | Initial admin email |

## Security Features Included

### Application Level
- Security headers (X-Frame-Options, CSP, HSTS, etc.)
- XSS and injection protection (input sanitization)
- Rate limiting (API: 200/min, Auth: 10/15min, Sensitive: 5/15min)
- DDoS protection (5000 req/min absolute limit, NAT/CDN friendly)
- Prototype pollution prevention
- Hidden server fingerprints

### Nginx Level
- TLS 1.2/1.3 only with strong ciphers
- Rate limiting zones for different endpoints
- Connection limiting per IP
- Hidden nginx version
- Blocked attack paths (wp-admin, phpmyadmin, etc.)

### Database Level
- SSL connections in production
- Connection pooling with limits
- Query timeouts (30s max)
- Parameterized queries (Drizzle ORM)

## Maintenance Commands

```bash
# View logs
pm2 logs vex-platform
pm2 logs vex-platform --lines 100

# Real-time monitoring
pm2 monit

# Restart application
pm2 restart vex-platform

# Zero-downtime reload
pm2 reload vex-platform

# Update application
cd /var/www/vex
git pull
npm ci --production=false
npm run build
npm prune --production
pm2 reload vex-platform

# Database backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Check health
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/detailed

# Check nginx status
sudo nginx -t
sudo systemctl status nginx

# View nginx logs
sudo tail -f /var/log/nginx/vex-access.log
sudo tail -f /var/log/nginx/vex-error.log
```

## Scaling Tips

### For 10,000+ Users
1. Increase `DB_POOL_MAX` to 75-100
2. Use 4 CPU cores minimum
3. Enable nginx caching for static assets
4. Consider Redis for session storage

### For 20,000+ Users
1. Use 8GB+ RAM
2. Set `DB_POOL_MAX` to 100+
3. Add Redis for caching and sessions
4. Consider database read replicas
5. Monitor with tools like Grafana + Prometheus

### Monitoring Setup (Optional)
```bash
# Install monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Healthcheck script (add to cron)
cat > /var/www/vex/healthcheck.sh << 'EOF'
#!/bin/bash
if ! curl -sf http://localhost:5000/api/health > /dev/null; then
    pm2 restart vex-platform
    echo "$(date): VEX platform restarted due to health check failure" >> /var/log/vex/healthcheck.log
fi
EOF
chmod +x /var/www/vex/healthcheck.sh

# Add to crontab: */5 * * * * /var/www/vex/healthcheck.sh
```

## Security Checklist

- [ ] Change default admin password immediately after first login
- [ ] Unset ADMIN_BOOTSTRAP_PASSWORD after admin creation
- [ ] Enable UFW firewall
- [ ] Configure fail2ban for SSH protection
- [ ] Set up automated backups for database
- [ ] Monitor disk space and memory usage
- [ ] Keep system packages updated weekly
- [ ] Review nginx access logs for suspicious activity
- [ ] Set up monitoring alerts for downtime
- [ ] Use SSH keys instead of passwords
- [ ] Disable root SSH login

## Troubleshooting

### Application won't start
```bash
pm2 logs vex-platform --lines 50
# Check for missing env vars or DB connection issues
node -e "console.log(process.env.DATABASE_URL)"
```

### Database connection errors
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check SSL mode - try different options:
# ?sslmode=require (recommended)
# ?sslmode=verify-full (strictest)
# ?sslmode=disable (for testing only)
```

### 502 Bad Gateway
```bash
# Check if app is running
pm2 status

# Check if port is listening
netstat -tlnp | grep 5000

# Check nginx error log
sudo tail -f /var/log/nginx/vex-error.log
```

### High memory usage
```bash
# Check current usage
pm2 monit

# Reduce PM2 instances
pm2 scale vex-platform 2  # Use 2 instances instead of max

# Restart to clear memory
pm2 restart vex-platform
```

### Rate limit issues
```bash
# Check nginx rate limiting
sudo tail -f /var/log/nginx/vex-error.log | grep "limiting"

# Adjust rate limits in nginx.conf if needed
sudo nano /etc/nginx/sites-available/vex
sudo nginx -t && sudo systemctl reload nginx
```

## Hostinger-Specific Notes

1. **Database**: Use Hostinger's managed PostgreSQL if available
2. **Firewall**: Check Hostinger panel for additional firewall settings
3. **SSH Port**: May be non-standard - check your Hostinger panel
4. **VPS Type**: KVM recommended over OpenVZ for better performance
5. **Backups**: Enable Hostinger's backup feature
6. **Support**: Contact Hostinger for network/VPS issues

## Support

For issues specific to the VEX platform:
- Application logs: `pm2 logs vex-platform`
- Database connectivity: `psql $DATABASE_URL -c "SELECT 1"`
- Health endpoint: `curl localhost:5000/api/health`
- Detailed health: `curl localhost:5000/api/health/detailed`
