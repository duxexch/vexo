# 02 - Technical Architecture (Verified)

This architecture summary is based on direct reading of active runtime files.

## 1. Runtime Entry Points

- Main server runtime: `server/index.ts`
- Route registration bridge: `server/routes.ts`
- Public modular routes: `server/routes/index.ts`
- Admin modular routes: `server/admin-routes/index.ts`
- Cluster entry: `server/cluster.ts`
- Frontend entry: `client/src/main.tsx`
- Frontend app shell + routing: `client/src/App.tsx`

## 2. Backend Runtime Flow

1. Create Express app + HTTP server.
2. Initialize game websocket runtime (`setupGameWebSocket`).
3. Apply security middlewares:

- CORS allowlist
- security headers (CSP/HSTS/etc)
- request size limits
- prototype-pollution body sanitization

4. Register public + admin routes.
2. Register upload/static/storage routes.
3. Apply global error handlers.
4. Serve static build in production or Vite in development.
5. Listen on `PORT` (default `3001`).
6. Run startup jobs:

- seeds (multiplayer games, gifts, free play)
- security cleanup job
- challenge expiry job
- DB compatibility checks

## 3. API Composition

Public API modules are composed in `server/routes/index.ts` and include:

- auth, users, games, transactions, payments
- p2p trading + disputes + profile
- challenges, spectator, tournaments, rewards
- chat + chat features + support chat
- social + gifts + notifications + stats + profile + security
- matchmaking, game-config, external-games

Admin API modules are composed in `server/admin-routes/index.ts` and include:

- admin auth/login/password
- dashboard/users/settings/support/p2p/content/games/currency
- tournaments/challenges/alerts
- chat governance modules

## 4. Realtime Model

Two websocket paths coexist:

- General realtime path: `/ws`
  - ownership: `server/websocket/*`
  - domains: auth, chat, matchmaking, voice, challenge game events

- Session game path: `/ws/game`
  - ownership: `server/game-websocket/*`
  - domains: authenticate, join/spectate, moves, state transitions, game-over

Cluster scaling uses sticky IP hash in `server/cluster.ts` to keep websocket affinity.

Cluster-aware presence smokes (no real Redis required):

- `npm run quality:smoke:chat-viewer-count` — boots two in-process Socket.IO servers backed by a shared in-memory Redis bus (ioredis-mock + a `send_command` / `messageBuffer` shim) and verifies the production `broadcastChallengeViewerCount` helper produces accurate `chat:viewer_count` numbers (0→1→2→1→0) when spectators connect to different instances. The smoke also asserts the player socket is never counted, which guards against a Map-only regression in `socket.data.spectatorRoomIds[]` (the array mirror that survives cross-node JSON serialization in `fetchSockets`).

## 5. Data and Storage Model

- DB driver and pool: `server/db.ts`
- ORM: Drizzle over PostgreSQL
- Single source schema: `shared/schema.ts`
- Unified storage object: `server/storage/index.ts`
- Domain storage split by business area (users, financial, live-games, p2p, project-currency, admin, support)

## 6. Frontend Runtime Model

- Providers in app shell: QueryClient, Theme, i18n, Settings, Auth, Notifications.
- Route handling with Wouter in `client/src/App.tsx`.
- Lazy loading for route pages and admin pages.
- Mobile bottom navigation and responsive sidebar behavior are implemented in app shell.
- Service worker registration and update banner are in `client/src/main.tsx`.

## 7. Verified Reality Checks (Important)

- Server default port in runtime is `3001` (`server/index.ts`).
- Some legacy docs mention port `5000`; treat them as historical context only.
- Docker files historically defaulted to `5000` and were aligned in this consolidation to support local production on `3001`.
- Project reference docs under old location were strong but are now centralized under this knowledge engine.

## 8. High-Risk Hotspots

When changing these areas, require extra caution:

- `server/routes/middleware.ts` (auth/session boundary)
- `server/storage/financial.ts` (money integrity)
- `server/routes/p2p-*/*` (financial + dispute lifecycle)
- `server/game-websocket/*` and `server/websocket/challenge-games/*` (realtime correctness)
- `shared/schema.ts` (schema drift risk)
