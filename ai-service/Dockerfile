FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl tini

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3100 \
    AI_AGENT_DATA_DIR=/app/data

EXPOSE 3100

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.mjs"]
