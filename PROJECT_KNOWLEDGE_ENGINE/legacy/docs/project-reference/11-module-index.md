# 11 - Module Index

This is a fast index of high-signal modules for day-to-day debugging and implementation.

## Backend core

- `server/index.ts`
- `server/routes.ts`
- `server/admin-routes/index.ts`
- `server/routes/index.ts`
- `server/db.ts`
- `server/cluster.ts`

## Backend route domains

- `server/routes/auth/`
- `server/routes/challenges/`
- `server/routes/chat/`
- `server/routes/chat-features/`
- `server/routes/matchmaking/`
- `server/routes/p2p-trading/`
- `server/routes/p2p-disputes/`
- `server/routes/support-chat/`
- `server/routes/game-config/`
- `server/routes/social-auth/`
- `server/routes/spectator/`
- `server/routes/tournaments/`

## Admin route domains

- `server/admin-routes/admin-users/`
- `server/admin-routes/admin-settings/`
- `server/admin-routes/admin-support/`
- `server/admin-routes/admin-p2p/`
- `server/admin-routes/admin-content/`
- `server/admin-routes/admin-games/`
- `server/admin-routes/admin-currency/`
- `server/admin-routes/admin-tournaments/`
- `server/admin-routes/admin-challenges/`

## Data and storage

- `shared/schema.ts`
- `server/storage/index.ts`
- `server/storage/users/`
- `server/storage/p2p/`
- `server/storage/project-currency/`
- `server/storage/live-games/`
- `server/storage/admin/`

## Realtime and game execution

- `server/websocket/index.ts`
- `server/websocket/challenge-games/`
- `server/game-websocket/`
- `server/game-engines/chess.ts`
- `server/game-engines/backgammon/`
- `server/game-engines/domino/`
- `server/game-engines/tarneeb/`
- `server/game-engines/baloot/`

## Startup automation

- `server/setup/seeds.ts`
- `server/setup/schedulers.ts`
- `server/setup/admin-bootstrap.ts`
- `server/setup/rate-limiters.ts`
- `server/seed/`

## Frontend core

- `client/src/main.tsx`
- `client/src/App.tsx`
- `client/src/lib/auth.tsx`
- `client/src/lib/queryClient.ts`
- `client/src/lib/settings.tsx`
- `client/src/lib/i18n.tsx`

## Frontend routes and components

- `client/src/pages/`
- `client/src/pages/admin/`
- `client/src/components/`
- `client/src/components/ui/`
- `client/src/hooks/`

## Deployment and operations

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `deploy/ecosystem.config.js`
- `deploy/nginx.conf`
- `scripts/`
- `migrations/`
