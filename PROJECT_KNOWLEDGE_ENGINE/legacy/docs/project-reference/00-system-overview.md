# 00 - System Overview

## Architecture at a glance

VEX is a full-stack multiplayer gaming and P2P platform built around:

1. React + Vite frontend (`client/`).
2. Express + TypeScript backend (`server/`).
3. PostgreSQL via Drizzle ORM schema (`shared/schema.ts`).
4. Real-time channels over WebSocket (`server/websocket/` and `server/game-websocket/`).
5. Optional infrastructure components (Redis, MinIO, Docker, PM2).

## Main runtime entry points

- Backend process entry: `server/index.ts`
- Cluster entry (production scale mode): `server/cluster.ts`
- Public route registry: `server/routes/index.ts`
- Admin route registry: `server/admin-routes/index.ts`
- WebSocket gateway: `server/websocket/index.ts`
- Challenge game socket flow: `server/game-websocket/index.ts`
- Frontend entry: `client/src/main.tsx`
- Frontend app shell and route composition: `client/src/App.tsx`

## Repository map

### Backend

- `server/routes/`: Public REST modules by business domain.
- `server/admin-routes/`: Admin REST modules.
- `server/storage/`: Modular data access layer composed into one `storage` object.
- `server/game-engines/`: Game logic engines (chess, backgammon, domino, tarneeb, baloot).
- `server/websocket/`: Chat, voice, matchmaking, challenge game realtime dispatch.
- `server/setup/`: startup helpers (seeds, schedulers, admin bootstrap, rate limiters).
- `server/seed/`: dataset seeding utilities.

### Shared and database

- `shared/schema.ts`: Central Drizzle schema and type definitions.
- `migrations/`: SQL migrations and hardening changes.

### Frontend

- `client/src/pages/`: route-level screens (user and admin).
- `client/src/components/`: reusable UI and feature components.
- `client/src/lib/`: providers and core app services (auth, query client, i18n, settings, theme).
- `client/src/hooks/`: domain-specific hooks (chat, websockets, notifications, media, install).

### Operations and deployment

- `Dockerfile`: build and production image.
- `docker-compose.yml`: local/ops compose stack.
- `docker-compose.prod.yml`: production-oriented compose.
- `deploy/ecosystem.config.js`: PM2 runtime config.
- `deploy/nginx.conf`: reverse proxy config.
- `scripts/`: operational scripts (setup, deploy, backup, seed helpers).

## Core design principles observed in code

1. Domain modularization over monoliths (routes and storage split by domain).
2. Shared schema first approach (types and table ownership in one place).
3. Realtime-first multiplayer architecture.
4. Security layered middleware (auth, role checks, rate limiting, validations).
5. Seed + bootstrap logic integrated into startup.
