# VEX Platform

Full-stack TypeScript platform combining competitive games, social chat, multi-currency wallet, P2P marketplace, and an admin console. Runs on the web and as an Android app via Capacitor.

Repository: `git@github.com:duxexch/vexo.git`
Production domain: `https://vixo.click`
Production host: Hostinger VPS (Ubuntu 25.10), project path `/docker/vex`.

---

## Tech stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui (in `client/`); i18n with RTL support; mobile-first.
- **Backend:** Node.js 20 + Express + WebSocket (`server/`); cluster entry in `server/cluster.ts` for sticky WS sessions.
- **Database:** PostgreSQL 15 via Drizzle ORM. Schema in `shared/schema.ts`. Migrations in `migrations/` and applied with `drizzle-kit push --force` at container startup.
- **Cache / pub-sub:** Redis 7.
- **Object storage:** MinIO (S3-compatible) for uploads.
- **Internal AI service:** `ai-service/` (separate Node.js + Express container on port 3100).
- **Mobile:** Capacitor (`capacitor.config.ts`, `twa/`).
- **Reverse proxy (production):** Traefik v3 with Let's Encrypt (`deploy/docker-compose.traefik.yml` + `deploy/traefik/dynamic.yml`).

## Project layout

```
client/                 # React + Vite SPA
server/                 # Express API, WebSocket, admin routes, game engines
ai-service/             # Internal AI helper microservice (separate container)
shared/                 # Types & Drizzle schema shared between client and server
migrations/             # Drizzle SQL migrations (auto-applied at startup)
scripts/                # Deploy core, smoke tests, seeding, entrypoint
deploy/                 # Traefik + voice (LiveKit/Coturn) compose files
docker/                 # Misc Docker config (nginx fallback)
docs/                   # Feature playbooks and audits
PROJECT_KNOWLEDGE_ENGINE/  # Authoritative knowledge base (READ FIRST)
scripts/vps-bootstrap.sh # ⭐ One-shot fresh-install (inspects VPS, installs Docker, generates all secrets idempotently, deploys for vixo.click)
prod-update.sh          # Standard production update wrapper (re-deploys after code changes)
prod-auto.sh            # First-run bootstrap wrapper
docker-compose.prod.yml # Production stack (db, redis, minio, ai-agent, app)
docker-compose.yml      # Local-only stack (no Traefik)
Dockerfile              # Multi-stage production image for the app
.env.example            # Authoritative list of required env vars
```

## Local development (Replit / workstation)

```bash
npm install
npm run dev          # http://localhost:3001
npm run check:types  # tsc --noEmit
```

The Replit workflow `Start application` runs `npm run dev` on port 3001.
A working `.env` file with at minimum `DATABASE_URL`, `SESSION_SECRET`, `JWT_SIGNING_KEY`, `ADMIN_JWT_SECRET`, `SECRETS_ENCRYPTION_KEY`, `SESSION_SECRET` (≥32 chars each in production) is required.

## Production deployment (Hostinger VPS)

Standard update command (used by the team):

```bash
cd /docker/vex && bash prod-update.sh \
  --auth-mode ssh \
  --repo-url git@github.com:duxexch/vexo.git \
  --repo-dir /docker/vex \
  --branch main
```

Full deployment runbook: `PROJECT_KNOWLEDGE_ENGINE/05_DOCKER_DEPLOYMENT_RUNBOOK.md`.

First-time VPS bootstrap (Traefik network + Traefik container) is documented in §3.1 of that runbook.

## Authoritative documentation

- `PROJECT_KNOWLEDGE_ENGINE/` is the single source of truth. Always read `00_PRIORITIES.md` and `05_DOCKER_DEPLOYMENT_RUNBOOK.md` before making infra or deployment changes.
- `docs/` contains feature-level playbooks and dated audits.
- Per `00_PRIORITIES.md`, financial integrity, DB safety, mobile-first UX, RTL/i18n correctness, SEO, and production reliability are non-negotiable priorities.

## Recent changes

- 2026-04-23 — Production deployment hardened:
  - `deploy/docker-compose.traefik.yml` rewritten to enable the Docker provider, set `exposedByDefault=false`, mount the Docker socket read-only, add `restart: unless-stopped`, healthcheck, and structured logging.
  - Added `ACME_EMAIL` to `.env.example` (required by Traefik / Let's Encrypt).
  - Removed the redundant host port binding on the `app` service in `docker-compose.prod.yml` (kept commented for debug).
  - Rewrote `PROJECT_KNOWLEDGE_ENGINE/05_DOCKER_DEPLOYMENT_RUNBOOK.md` to reflect the actual Docker Compose + Traefik flow on Hostinger VPS (previously incorrectly stated Kubernetes was the primary runtime).
