# VEX Platform - Production Docker Image
# Multi-stage build: builder → production
# Last updated: Production-ready

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install

# Copy source files in order of change frequency (least → most)
COPY shared ./shared
COPY drizzle.config.ts tsconfig.json vite.config.ts postcss.config.js tailwind.config.ts ./
COPY server ./server
COPY client ./client
COPY script ./script
COPY scripts ./scripts

# Build the application
RUN npm run build

# Stage 2: Production (lean)
FROM node:20-alpine AS production

# Metadata
LABEL maintainer="VEX Platform Team"
LABEL version="1.0.0"
LABEL description="VEX Gaming & P2P Trading Platform"

# Create non-root user BEFORE copying files
RUN addgroup -g 1001 -S vexgroup && \
    adduser -S -u 1001 -G vexgroup vexuser

WORKDIR /app

# Install only essential runtime tools + tini for proper signal handling
RUN apk add --no-cache postgresql-client curl tini

# Copy package files
COPY --chown=vexuser:vexgroup package*.json ./

# Install production deps + drizzle-kit/tsx for migrations, then clean cache
RUN npm install --omit=dev && \
    npm install --no-save drizzle-kit tsx && \
    npm cache clean --force && \
    rm -rf /tmp/* /root/.npm

# Copy built files from builder with correct ownership
COPY --from=builder --chown=vexuser:vexgroup /app/dist ./dist
COPY --from=builder --chown=vexuser:vexgroup /app/drizzle.config.ts ./
COPY --from=builder --chown=vexuser:vexgroup /app/shared ./shared
COPY --from=builder --chown=vexuser:vexgroup /app/tsconfig.json ./

# Copy server source (needed for drizzle schema imports in migrations)
COPY --from=builder --chown=vexuser:vexgroup /app/server ./server

# Copy scripts
COPY --chown=vexuser:vexgroup scripts ./scripts
RUN chmod +x scripts/*.sh 2>/dev/null || true

# Create necessary directories with proper permissions
RUN mkdir -p logs uploads temp && \
    chown -R vexuser:vexgroup logs uploads temp && \
    chmod 755 logs uploads temp

# Set environment defaults
ENV NODE_ENV=production \
    PORT=3001 \
    TZ=UTC

# Expose port
EXPOSE 3001

# Switch to non-root user
USER vexuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Use tini as init process for proper signal handling (PID 1)
ENTRYPOINT ["/sbin/tini", "--"]

# Run entrypoint script
CMD ["./scripts/entrypoint.sh"]
