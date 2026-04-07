// PM2 Ecosystem Configuration for VEX Platform - Optimized for Hostinger VPS
// Usage: pm2 start ecosystem.config.js
// Designed to handle 20,000+ concurrent users

module.exports = {
  apps: [
    {
      name: "vex-platform",
      script: "dist/cluster.cjs",
      cwd: "/var/www/vex",

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        // Enable Node.js cluster mode for multi-core utilization
        // Single process: ~3,000 req/s | 4 workers: ~8,000-12,000 req/s
        NODE_CLUSTER_ENABLED: "true",
        WEB_CONCURRENCY: "4",
        SECRETS_ENCRYPTION_KEY: process.env.SECRETS_ENCRYPTION_KEY,
      },

      // PM2 fork mode — clustering is handled internally by server/cluster.ts
      // with IP-hash sticky sessions for WebSocket affinity.
      // Each worker maintains its own game room state (rooms Map), and
      // ip_hash ensures same client always routes to same worker.
      instances: 1,
      exec_mode: "fork",

      // Memory & Performance - optimized for high traffic
      max_memory_restart: "1G", // Restart if memory exceeds 1GB per instance
      node_args: "--max-old-space-size=1024 --optimize-for-size",

      // Logging
      log_file: "/var/log/vex/combined.log",
      out_file: "/var/log/vex/out.log",
      error_file: "/var/log/vex/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      log_type: "json", // Structured logging for analysis

      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_restarts: 15, // More restarts allowed for high availability
      restart_delay: 3000, // 3 second delay between restarts

      // Graceful shutdown
      kill_timeout: 10000, // 10 seconds for graceful shutdown
      wait_ready: true,
      listen_timeout: 15000,

      // Health monitoring and auto-recovery
      exp_backoff_restart_delay: 100,
      min_uptime: "30s", // Consider started if running 30s

      // Cron restart for memory cleanup (optional - every day at 4 AM)
      // Uncomment if needed for long-running deployments
      // cron_restart: "0 4 * * *",
    },

    // Automated daily database backup at 3 AM
    {
      name: "vex-db-backup",
      script: "./scripts/backup-db.sh",
      cwd: "/var/www/vex",
      cron_restart: "0 3 * * *",
      autorestart: false,
      instances: 1,
      exec_mode: "fork",
      log_file: "/var/log/vex/backup.log",
      error_file: "/var/log/vex/backup-error.log",
      out_file: "/var/log/vex/backup-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
      },
    },
  ],

  // Deployment configuration for Hostinger VPS
  deploy: {
    production: {
      user: "vex",
      host: ["YOUR_HOSTINGER_VPS_IP"], // Replace with your VPS IP
      ref: "origin/main",
      repo: "git@github.com:yourusername/vex-platform.git",
      path: "/var/www/vex",
      "pre-deploy-local": "echo 'Starting deployment...'",
      "post-deploy":
        "npm ci --production=false && " + // Install all deps for build
        "npm run build && " +              // Build the project
        "npm prune --production && " +     // Remove dev deps
        "pm2 reload ecosystem.config.js --env production && " +
        "pm2 save",                        // Save PM2 config
      "pre-setup": "mkdir -p /var/log/vex",
      env: {
        NODE_ENV: "production",
      },
    },

    // Staging environment (optional)
    staging: {
      user: "vex",
      host: ["YOUR_STAGING_VPS_IP"],
      ref: "origin/develop",
      repo: "git@github.com:yourusername/vex-platform.git",
      path: "/var/www/vex-staging",
      "post-deploy": "npm ci && npm run build && pm2 reload ecosystem.config.js --env staging",
      env: {
        NODE_ENV: "staging",
        PORT: 3002,
      },
    },
  },
};
