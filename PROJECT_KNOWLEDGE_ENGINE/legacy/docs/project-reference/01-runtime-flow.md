# 01 - Runtime Flow

## Process boot sequence

1. Process starts through `server/index.ts` or `server/cluster.ts`.
2. Express app and HTTP server are created.
3. Early middleware and static handlers are attached.
4. Public and admin routes are registered.
5. WebSocket handlers are attached.
6. Startup jobs run:
   - database seed checks
   - admin bootstrap logic
   - scheduler jobs
   - challenge expiry cron
7. Server listens on configured port.

## Cluster mode flow (`server/cluster.ts`)

1. Primary process forks workers.
2. Primary uses IP-hash sticky dispatch for connection affinity.
3. Workers run full server runtime with `CLUSTER_WORKER=true`.
4. Worker exits are auto-restarted by primary.

## HTTP request flow

1. Request hits Express.
2. Request logger and API limiters execute.
3. Domain route handler executes.
4. Handlers call `storage.*` methods.
5. Storage layer uses Drizzle + PostgreSQL.
6. Response serialized to JSON.

## WebSocket flow

1. Upgrade routes handled at `/ws` and `/ws/game`.
2. Message payload is parsed and dispatched by message type.
3. `/ws` dispatch targets include auth, chat, matchmaking, voice, and challenge-games.
4. `/ws/game` dispatch targets include authenticate/join_game/spectate/make_move/chat/resign/draw.
5. Updates are broadcast to connected clients through socket registries in shared websocket state.

## Realtime challenge/game flow

1. Challenge-related action arrives (REST or WS).
2. Create/join handlers validate stake, lock balance, and atomically update challenge players/status.
3. On final join, challenge start flow creates session records used by challenge play/watch flows.
4. Session and challenge state is loaded by websocket handlers.
5. Game engine validates and applies move.
6. Session state and move/event records are persisted.
7. Results are broadcast to room participants and spectators.
8. Payout and closure logic runs on game-over paths.

## Scheduler flow (`server/setup/schedulers.ts`)

- Scheduled config changes processor.
- P2P trade expiry processor.
- Notification cleanup jobs.

## Seed/bootstrap flow

- `server/setup/seeds.ts`: base themes and feature flags.
- `server/storage/index.ts`: multiplayer games seed guard.
- `server/setup/admin-bootstrap.ts`: ensures admin account availability per environment.

## Operational warning

In development mode, if no admin exists, startup can auto-create one. This affects local data reset behavior and should be considered during cleanup/testing.
