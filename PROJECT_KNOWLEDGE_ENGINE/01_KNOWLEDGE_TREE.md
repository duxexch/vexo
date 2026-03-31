# 01 - Knowledge Tree (Searchable Map)

This file is the fast project map to locate ownership for any change.

## A. System Roots

- Frontend root: `client/src`
- Backend root: `server`
- Shared schema/types: `shared/schema.ts`
- Deployment/runtime infra: `Dockerfile`, `docker-compose*.yml`, `deploy/`
- Scripts and automation: `scripts/`, `script/`

## B. Backend Domain Tree

- Server entry and middleware
  - `server/index.ts`
  - `server/routes.ts`
  - `server/routes/index.ts`
  - `server/admin-routes/index.ts`

- Auth and session
  - `server/routes/auth/*`
  - `server/routes/middleware.ts`
  - `server/lib/auth-*`

- Financial and wallet
  - `server/routes/transaction-user.ts`
  - `server/routes/transaction-agent.ts`
  - `server/routes/payments/*`
  - `server/storage/financial.ts`

- P2P trading and disputes
  - `server/routes/p2p-trading/*`
  - `server/routes/p2p-disputes/*`
  - `server/storage/p2p/*`

- Challenges and realtime game sessions
  - `server/routes/challenges/*`
  - `server/websocket/challenge-games/*`
  - `server/game-websocket/*`
  - `server/storage/live-games/*`

- Admin operations
  - `server/admin-routes/*`
  - `server/storage/admin/*`

- Realtime and websockets
  - `server/websocket/*` (general websocket)
  - `server/game-websocket/*` (game-session websocket)
  - `server/cluster.ts` (sticky worker distribution)

## C. Frontend Domain Tree

- App shell and providers
  - `client/src/main.tsx`
  - `client/src/App.tsx`
  - `client/src/lib/auth.tsx`
  - `client/src/lib/i18n.tsx`
  - `client/src/lib/settings.tsx`
  - `client/src/lib/theme.tsx`
  - `client/src/lib/queryClient.ts`

- Route-level pages
  - `client/src/pages/*`
  - `client/src/pages/admin/*`

- Reusable feature components
  - `client/src/components/*`
  - `client/src/components/games/*`
  - `client/src/components/ui/*`

- Hooks and feature logic
  - `client/src/hooks/*`

- Localization source
  - `client/src/locales/*`

## D. Data and Storage Tree

- Schema and enums: `shared/schema.ts`
- DB connection and pooling: `server/db.ts`
- Storage composition: `server/storage/index.ts`
- Domain storage folders:
  - `server/storage/users/`
  - `server/storage/live-games/`
  - `server/storage/p2p/`
  - `server/storage/project-currency/`
  - `server/storage/admin/`

## E. Operations and Deployment Tree

- Docker and containers
  - `Dockerfile`
  - `docker-compose.yml`
  - `docker-compose.prod.yml`
  - `scripts/entrypoint.sh`

- Reverse proxy and process manager
  - `deploy/nginx.conf`
  - `deploy/ecosystem.config.js`

- Build/start helpers
  - `scripts/start-local.ps1`
  - `script/build.ts`

## F. SEO, PWA, and Crawl Tree

- Manifest: `client/public/manifest.json`
- Service worker: `client/public/sw.js`
- Crawl controls: `client/public/robots.txt`
- Sitemap: `client/public/sitemap.xml`
- Canonical update path: `client/src/App.tsx`

## G. Fast Search by Task Type

- "Login/session/token bug"
  - Start: `server/routes/auth/*`, `server/routes/middleware.ts`, `client/src/lib/auth.tsx`

- "Balance/payout/dispute bug"
  - Start: `server/storage/financial.ts`, `server/routes/payments/*`, `server/routes/p2p-*/*`

- "Challenge/game websocket bug"
  - Start: `server/websocket/challenge-games/*`, `server/game-websocket/*`, `client/src/hooks/useGameWebSocket.ts`

- "Mobile layout bug"
  - Start: `client/src/App.tsx`, `client/src/pages/*`, `client/src/components/games/*`, `client/src/hooks/use-mobile.tsx`

- "RTL/i18n bug"
  - Start: `client/src/lib/i18n.tsx`, `client/src/locales/*`, affected pages/components

- "SEO indexing/crawler bug"
  - Start: `client/public/robots.txt`, `client/public/sitemap.xml`, metadata/canonical behavior in `client/src/App.tsx`

- "Docker/startup bug"
  - Start: `docker-compose*.yml`, `Dockerfile`, `scripts/entrypoint.sh`, `server/index.ts`
