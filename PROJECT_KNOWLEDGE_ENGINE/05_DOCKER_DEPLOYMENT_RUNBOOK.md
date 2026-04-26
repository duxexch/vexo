# 05 - Docker and Deployment Runbook

This runbook documents the **actual production deployment** for VEX Platform.

## 0. Primary Production Runtime

- **Primary production runtime: Docker Compose on a Hostinger VPS** (Ubuntu 25.10 KVM).
- Production domain: `https://vixo.click` (and `www.vixo.click`).
- Reverse proxy: **Traefik v3** (Let's Encrypt, HTTP-01 challenge).
- Repository path on the VPS: `/docker/vex` (cloned from `git@github.com:duxexch/vexo.git`, branch `main`).
- Local production-equivalent run can use `docker-compose.yml` (see Section 4).
- Kubernetes manifests in `k8s/` and `scripts/k8s-deploy-prod.ps1` are **legacy / optional** and are not the primary deploy path.

## 1. Standard Port Policy

- Application runtime port (inside the `vex-app` container): `3001`.
- Public ports on the VPS: `80` (HTTP → 301 → HTTPS) and `443` (HTTPS), both owned by the Traefik container.
- The `vex-app` container is **not** published to the host directly in production; Traefik reaches it over the shared `vex-traefik` Docker network.

## 2. Local Development (Non-Docker, Replit / Workstation)

- Install dependencies once: `npm install`
- Start dev server: `npm run dev` (listens on `http://localhost:3001`)
- Type check: `npm run check:types`
- Direct server start (rarely needed): `npx tsx server/index.ts`

## 3. Production Deployment on Hostinger VPS

### 3.1 First-time bootstrap (one-time)

Run as root on the VPS:

```bash
# 1) Prepare the project directory
mkdir -p /docker/vex
cd /docker/vex
git clone git@github.com:duxexch/vexo.git .

# 2) Create the .env file (copy from .env.example and fill values)
cp .env.example .env
$EDITOR .env   # set APP_URL, ACME_EMAIL, secrets, SMTP, etc.

# 3) Create the shared Traefik network (idempotent)
docker network create vex-traefik 2>/dev/null || true

# 4) Start Traefik (reverse proxy + Let's Encrypt)
docker compose -f deploy/docker-compose.traefik.yml --env-file .env up -d

# 5) First production deploy
bash prod-auto.sh \
  --auth-mode ssh \
  --repo-url git@github.com:duxexch/vexo.git \
  --repo-dir /docker/vex \
  --branch main
```

### 3.2 Standard update (every release)

The canonical update command used by the team:

```bash
cd /docker/vex && bash prod-update.sh \
  --auth-mode ssh \
  --repo-url git@github.com:duxexch/vexo.git \
  --repo-dir /docker/vex \
  --branch main
```

`prod-update.sh` performs:

1. Pre-update Postgres backup (skippable with `--no-backup`).
2. `git pull --ff-only origin main` over SSH.
3. Delegates to `prod-auto.sh` → `scripts/prod-auto.sh` (the strict deploy core), which:
   - Validates / repairs `.env` (auto-generates missing secrets when allowed).
   - Detects or creates the external Traefik network (`vex-traefik`).
   - Runs `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`.
   - Rebuilds the `ai-agent` service to apply latest source.
   - Reconciles the voice stack (`livekit` + `coturn`) when the voice compose file is present.
   - Verifies runtime env values inside `vex-app` match `.env`.
   - Performs deep post-deploy verification.

## 4. Local Production-like Run (Fallback, Workstation)

For testing the production image without a VPS:

```bash
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
curl -fsS http://localhost:3001/api/health
```

This stack does **not** include Traefik or HTTPS — the app is exposed on `http://localhost:3001` directly.

## 5. Production Architecture (Hostinger VPS)

| Container | Image / Source | Role | Network(s) |
|---|---|---|---|
| `vex-traefik` | `traefik:v3.1` (`deploy/docker-compose.traefik.yml`) | TLS termination, HTTP→HTTPS redirect, routing | `vex-traefik` |
| `vex-app` | Built from root `Dockerfile` | Express + WebSocket server (port 3001) | `vex-internal`, `vex-traefik` |
| `vex-db` | `postgres:15-alpine` | Primary database | `vex-internal` |
| `vex-redis` | `redis:7-alpine` | Cache / pub-sub / sessions | `vex-internal` |
| `vex-minio` | `minio/minio:latest` | S3-compatible object storage (uploads) | `vex-internal` |
| `vex-ai-agent` | Built from `ai-service/Dockerfile` | Internal AI helper service (port 3100) | `vex-internal` |
| `livekit` + `coturn` | `deploy/docker-compose.voice.yml` (optional) | WebRTC voice / TURN | host network |

### Network model

- `vex-internal` — private Docker bridge for inter-service traffic (DB, Redis, MinIO, AI agent, app). Not exposed to the host.
- `vex-traefik` — **external** Docker network shared between Traefik and the app, declared in both compose files and auto-created by `scripts/prod-auto.sh` if missing.

### Routing (two complementary sources)

1. **Docker labels** on the `app` service in `docker-compose.prod.yml` (read by Traefik's Docker provider). This is the primary source.
2. **File provider** (`deploy/traefik/dynamic.yml`) as a static fallback that maps `vixo.click` → `http://vex-app:3001`.

## 6. Main Infra Files

- `Dockerfile` — multi-stage build (builder → lean production image, non-root user, tini PID 1).
- `docker-compose.prod.yml` — production stack (db, redis, minio, ai-agent, app + Traefik labels).
- `docker-compose.yml` — local stack (no Traefik, app exposed on host port).
- `deploy/docker-compose.traefik.yml` — Traefik v3 + Let's Encrypt.
- `deploy/traefik/dynamic.yml` — Traefik file-provider routing for `vixo.click`.
- `deploy/docker-compose.voice.yml` — optional LiveKit + Coturn stack.
- `scripts/entrypoint.sh` — env validation, DB readiness wait, migrations (`drizzle-kit push --force`), optional seed, then `exec node dist/index.cjs`.
- `prod-update.sh` / `prod-auto.sh` / `scripts/prod-auto.sh` — three-tier deploy automation (wrapper → bootstrap → strict core).

## 7. Startup Safety

The container entrypoint enforces:

1. Required env vars (`DATABASE_URL`, `SESSION_SECRET`, `JWT_USER_SECRET`, `JWT_ADMIN_SECRET`) and minimum length (≥32 chars) in production.
2. Email/SMS provider config sanity check when set to `smtp` / `sendgrid` / `twilio`.
3. Postgres readiness wait (up to 60s).
4. Pre-migration FK constraint name normalization (idempotent fixes).
5. `drizzle-kit push --force` with `MIGRATION_TIMEOUT` (default 120s).
6. Optional DB seed (`SEED_DATABASE=true`).
7. `exec node dist/index.cjs` under `tini` for proper signal handling.

## 8. Cluster and High Concurrency

- Cluster entry: `server/cluster.ts` (sticky distribution preserves WebSocket session affinity).
- Traefik passes WebSocket upgrade headers automatically.

## 9. Pre-Deployment Checklist

- `npm run check:types` passes locally.
- Build (`npm run build`) succeeds (or trust the Docker multi-stage build).
- `.env` on the VPS has all required secrets at correct length.
- Traefik container is `running` and the `vex-traefik` external network exists.
- Last `prod-update.sh` run completed with `[OK] Production update completed successfully`.
- `https://vixo.click/api/health` returns `200`.

## 10. Incident Quick Triage

If the site is unreachable:

1. **Containers** — `docker ps --filter name=vex-` should list all six (`traefik, app, db, redis, minio, ai-agent`) as `Up` / `healthy`.
2. **App container** — `docker logs --tail 200 vex-app` (look for entrypoint failures, env errors, migration errors).
3. **Traefik** — `docker logs --tail 200 vex-traefik` (look for ACME / certificate / upstream errors).
4. **Network** — `docker network inspect vex-traefik` should show both `vex-traefik` and `vex-app` as members.
5. **DB connectivity** — `docker exec vex-app curl -fsS http://localhost:3001/api/health` from inside the container.
6. **Re-deploy** — when in doubt, re-run the standard update command in §3.2.

## 11. Chat presence — staging Redis dry run (one-time, before chat rollout)

The fast `quality:smoke:chat-viewer-count` runs against `ioredis-mock`
plus a small `send_command` / `messageBuffer` adapter shim. That covers
the cluster broadcast logic and the `spectatorRoomIds[]` mirror, but
it cannot catch incompatibilities between the production `ioredis`
driver and `@socket.io/redis-adapter` (cluster-mode quirks, AUTH
failures, response timeouts under real network latency, TLS / sentinel
oddities). Run the real-Redis variant once before any production
rollout that touches the chat namespace:

```bash
# From a workstation with network access to the staging Redis:
REDIS_URL=rediss://<user>:<pass>@<staging-redis-host>:6380 \
  npm run quality:smoke:chat-viewer-count-real-redis

# Optional: extend per-step timeout for slow links (default 5000ms).
SMOKE_STEP_TIMEOUT_MS=10000 \
  REDIS_URL=rediss://... \
  npm run quality:smoke:chat-viewer-count-real-redis
```

A passing run prints exactly two lines:

```
[real-redis] Targeting redis at <REDIS_URL> (step timeout: 5000ms)
✓ chat:viewer_count smoke passed (cluster cross-instance)
```

The smoke spins up two local Socket.IO server instances both wired to
the staging Redis via `@socket.io/redis-adapter`, joins one player and
two spectators (one per "node"), and asserts the cluster-wide
`chat:viewer_count` value at every transition (0 → 1 → 2 → 1 → 0). It
deliberately does NOT touch any application data — it operates only
on adapter pub/sub channels — so it is safe to run against staging
without a maintenance window.

If the script exits non-zero:

- `[real-redis:A:pub] redis client never reached 'ready' …` — the
  `REDIS_URL` is wrong, the host is unreachable, or AUTH/TLS is
  rejecting the connection. Fix the URL and re-run.
- `Cross-instance count broke: expected count=2 everywhere …` — the
  adapter is reachable but cross-node broadcasts are not propagating.
  Check `PUBSUB NUMSUB socket.io#/chat#` against staging Redis; both
  smoke instances should appear as subscribers.
- `Timed out waiting for chat:viewer_count …` — typically network
  latency exceeds the step timeout. Re-run with
  `SMOKE_STEP_TIMEOUT_MS=10000` (or higher) before assuming a real
  failure.

Do NOT add this script to the standard CI gate — it requires a real
Redis URL that CI does not have. Treat a passing run as a
prerequisite that should be re-verified whenever the chat namespace's
adapter wiring (`server/socketio/index.ts`,
`server/socketio/challenge-chat-bridge.ts`, `server/lib/redis.ts`)
changes meaningfully.
