# 05 - Realtime and Game Engines

## Realtime architecture layers

### Layer 1: General WebSocket gateway

Folder: `server/websocket/`

Main components:

- `index.ts`: upgrade handling and message-type dispatch.
- `auth.ts`: socket auth/session binding.
- `chat/`: chat channel handling.
- `matchmaking.ts`: matchmaking events and queueing behavior.
- `voice.ts`: voice room signaling.
- `challenge-games/`: realtime challenge game actions.
- `notifications.ts`: fan-out notifications and broadcast helpers.
- `shared.ts`: shared maps for clients and rooms.

### Layer 2: Challenge game websocket runtime

Folder: `server/game-websocket/`

Main components:

- `index.ts`: challenge game ws orchestration.
- `auth-join.ts`: auth and room-join checks.
- `moves.ts`: move apply pipeline.
- `state-resign.ts`: state transitions for resign/draw/cancel.
- `timers-disconnect.ts`: timeout and disconnect behavior.
- `game-over.ts`: completion and settlement logic.
- `chat-gifts.ts`: room-level side interactions.

## Challenge execution paths

There are two active realtime paths, each with its own session table:

1. Challenge page path (`/challenge/:id/play`, `/challenge/:id/watch`)
   - WebSocket endpoint: `/ws`
   - Dispatcher: `server/websocket/index.ts` → `server/websocket/challenge-games/*`
   - Primary session table: `challenge_game_sessions`

2. Session page path (`/game/:gameType/:sessionId`)
   - WebSocket endpoint: `/ws/game`
   - Dispatcher: `server/game-websocket/*`
   - Primary session table: `live_game_sessions`

Compatibility rule:

- Challenge start flow should prepare both session models when needed so gameplay and spectating work across both page families.

## Challenge lifecycle (create → join → play → spectate)

1. Create challenge
   - Route: `server/routes/challenges/create.ts`
   - Applies game validation, stake checks, balance deduction, and challenge settings policy.

2. Join challenge
   - Route: `server/routes/challenges/join.ts`
   - Uses row locks + atomic stake deduction.
   - On final required player, flips challenge to `active` and creates game session records.

3. Play challenge
   - Main realtime handler: `server/websocket/challenge-games/*`
   - Core actions: join room, game moves, chat/gifts, resign/draw, payout settlement.

4. Spectate challenge
   - Spectator join handled inside `server/websocket/challenge-games/join-leave.ts`.
   - Spectators receive filtered player views via `engine.getPlayerView(..., 'spectator')`.
   - Support/odds actions are served by `server/routes/spectator/*`.

## Game engine modules

Folder: `server/game-engines/`

Engines:

- chess
- backgammon
- domino
- tarneeb
- baloot

Each card/board engine keeps its own:

- state type model
- move validation
- move application
- optional bot turn automation

## Bot model

Bot participants are engine-level IDs (commonly `bot-*`) and are usually not persisted as dedicated user records. Bot turn loops run inside engine runtime logic.

## Persistence touchpoints

Realtime/game execution frequently interacts with:

- `challenge_game_sessions`
- `challenge_chat_messages`
- `challenge_points_ledger`
- live session and move tables under schema live-game sections

## Game-over and payout model

Completion flows can trigger:

1. winner resolution
2. draw/refund handling
3. wallet/currency updates
4. event broadcast to participants and spectators

## Failure triage checklist

1. Wrong turn or invalid move errors:
   - check engine validation function and turn pointer updates.
2. State mismatch between users:
   - check room affinity and ws event ordering.
3. Payout mismatch:
   - check game-over handlers and payout utility usage.
4. Disconnect edge cases:
   - check `timers-disconnect.ts` and reconnect/session logic.
5. Challenge starts but board cannot move:
   - confirm session creation in `server/routes/challenges/join.ts` and verify `challenge_game_sessions` exists for that challenge.
6. Spectators can open page but cannot sync state:
   - verify `/ws` auth handshake and role assignment in `server/websocket/challenge-games/join-leave.ts`.
