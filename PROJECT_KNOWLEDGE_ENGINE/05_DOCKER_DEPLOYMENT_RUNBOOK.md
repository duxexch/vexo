# 05 - Docker and Deployment Runbook

This runbook standardizes local/prod-like runs and keeps port expectations explicit.

## 0. Primary Production Runtime

- Primary production runtime: Kubernetes.
- Docker Compose is fallback/legacy only when Kubernetes is unavailable.
- Local production-equivalent deployment should use Docker Desktop Kubernetes and [scripts/k8s-deploy-prod.ps1](scripts/k8s-deploy-prod.ps1).

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

## 3. Local Production-like Start with Kubernetes (Primary)

Use Docker Desktop Kubernetes as the default production path.

1. Ensure Kubernetes is enabled in Docker Desktop.
2. Ensure `.env` exists with production keys (secrets are created from it).
3. Deploy the stack:

- `pwsh -File scripts/k8s-deploy-prod.ps1`

1. Verify health:

- `curl -s -o NUL -w "%{http_code}" http://localhost:30081/api/health`

## 4. Local Production-like Start with Docker Compose (Fallback)

Use compose profile with production-oriented env values and mapped host port 3001.

Typical flow:

1. Prepare `.env` (or dedicated local production env file).
2. Build containers:

- `docker compose -f docker-compose.yml build`

1. Start stack:

- `docker compose -f docker-compose.yml up -d`

1. Verify health:

- `curl -s -o NUL -w "%{http_code}" http://localhost:3001/api/health`

## 5. Main Infra Files

- `docker-compose.yml` (local/ops stack)
- `docker-compose.prod.yml` (production-oriented stack)
- `Dockerfile` (multi-stage build)
- `scripts/entrypoint.sh` (migration + startup)
- `deploy/nginx.conf` (nginx reverse proxy model)
- `deploy/ecosystem.config.js` (PM2 process model)

## 6. Startup Safety Notes

Entrypoint responsibilities include:

- required env validation
- DB readiness wait
- migration execution path
- optional seeding path
- controlled app start with signal handling

## 7. Cluster and High Concurrency

- Cluster entry: `server/cluster.ts`.
- Sticky distribution is used to preserve websocket session affinity.
- If proxy is used, keep sticky behavior and websocket upgrade headers consistent.

## 8. Pre-Deployment Checklist

- Type check passes.
- Build succeeds.
- Health endpoint returns success.
- DB migrations complete or are intentionally skipped with safe reason.
- Required secrets are present and valid length.
- Docker services report healthy states.

## 9. Incident Quick Triage

If app is not reachable on 3001:

- confirm compose services are up and healthy
- confirm app container exposes/listens on expected port
- confirm `PORT` environment value in compose and app
- check healthcheck logs and entrypoint migration output
- verify DB/Redis connectivity from app container
