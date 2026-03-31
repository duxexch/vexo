# 05 - Docker and Deployment Runbook

This runbook standardizes local/prod-like runs and keeps port expectations explicit.

## 1. Standard Port Policy

- Application runtime default: `3001`.
- Local production-like Docker run target: `http://localhost:3001`.

## 2. Local Development (Non-Docker)

- Start development server:
  - `npm run dev`

- Type check:
  - `npx tsc --noEmit`

- Direct server start (if needed):
  - `npx tsx server/index.ts`

## 3. Local Production-like Start with Docker

Use compose profile with production-oriented env values and mapped host port 3001.

Typical flow:

1. Prepare `.env` (or dedicated local production env file).
2. Build containers:

- `docker compose -f docker-compose.yml build`

3. Start stack:

- `docker compose -f docker-compose.yml up -d`

4. Verify health:

- `curl -s -o NUL -w "%{http_code}" http://localhost:3001/api/health`

## 4. Main Infra Files

- `docker-compose.yml` (local/ops stack)
- `docker-compose.prod.yml` (production-oriented stack)
- `Dockerfile` (multi-stage build)
- `scripts/entrypoint.sh` (migration + startup)
- `deploy/nginx.conf` (nginx reverse proxy model)
- `deploy/ecosystem.config.js` (PM2 process model)

## 5. Startup Safety Notes

Entrypoint responsibilities include:

- required env validation
- DB readiness wait
- migration execution path
- optional seeding path
- controlled app start with signal handling

## 6. Cluster and High Concurrency

- Cluster entry: `server/cluster.ts`.
- Sticky distribution is used to preserve websocket session affinity.
- If proxy is used, keep sticky behavior and websocket upgrade headers consistent.

## 7. Pre-Deployment Checklist

- Type check passes.
- Build succeeds.
- Health endpoint returns success.
- DB migrations complete or are intentionally skipped with safe reason.
- Required secrets are present and valid length.
- Docker services report healthy states.

## 8. Incident Quick Triage

If app is not reachable on 3001:

- confirm compose services are up and healthy
- confirm app container exposes/listens on expected port
- confirm `PORT` environment value in compose and app
- check healthcheck logs and entrypoint migration output
- verify DB/Redis connectivity from app container
