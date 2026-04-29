# VEX Agents Service - standalone container for cashier/commercial agents subsystem.
# Shares the same Postgres DB as the main app (DATABASE_URL).

FROM node:20-alpine

WORKDIR /app

# Runtime tools + tini for proper signal handling
RUN apk add --no-cache curl tini

# Install deps first for better layer caching
COPY services/agents-service/package*.json ./
RUN npm install && npm cache clean --force

# Copy the shared schema (used via path alias @shared/*)
COPY shared /shared

# Copy service source
COPY services/agents-service/tsconfig.json ./
COPY services/agents-service/src ./src

# Patch the path alias so @shared/* resolves to /shared at runtime in the container
RUN node -e "const fs=require('fs');const p='./tsconfig.json';const j=JSON.parse(fs.readFileSync(p));j.compilerOptions.paths['@shared/*']=['/shared/*'];j.include=['src/**/*','/shared/**/*'];fs.writeFileSync(p,JSON.stringify(j,null,2));"

ENV NODE_ENV=production \
    PORT=3002

EXPOSE 3002

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Drop privileges
RUN addgroup -g 1002 -S agentsgrp && \
    adduser -S -u 1002 -G agentsgrp agentsusr && \
    chown -R agentsusr:agentsgrp /app /shared
USER agentsusr

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
