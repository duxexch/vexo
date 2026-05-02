# Ludo Financial Game Master Plan

## Goal
Build a production-grade financial Ludo game from scratch and integrate it cleanly into VEX as a wallet-linked arcade product.

## Product Scope
- 2 to 4 players
- Online-first gameplay
- Financial entry fee linked to VEX Wallet
- Atomic wallet settlement on game end
- Mobile-first UI
- Reconnect-safe session flow
- Anti-cheat and anti-duplication protections
- Full documentation and QA coverage

## Delivery Phases

### Phase 1 — Product contract
- Define exact Ludo ruleset
- Define wallet/escrow settlement rules
- Define timeout, surrender, disconnect, and refund rules
- Define multiplayer state contract
- Define server/client responsibilities

### Phase 2 — Shared metadata and routing
- Add Ludo to shared arcade registry
- Add routing and discoverability
- Add landing surfaces and SEO hooks if needed

### Phase 3 — Core game engine
- Represent board, tokens, dice, turns, safe cells, captures, home, finish
- Validate moves
- Apply moves
- Determine turn transitions
- Determine winner and end-state

### Phase 4 — Realtime gameplay
- Join game
- Sync state
- Roll dice
- Move token
- Reconnect handling
- Sequence protection
- Timeout handling

### Phase 5 — Wallet settlement
- Entry fee reservation
- Win payout
- Refund on invalid termination
- Ledger records
- Anti-double-spend guards

### Phase 6 — Frontend
- Mobile-first board UI
- Dice controls
- Token selection
- Turn indicator
- Balance/bet summary
- Winner overlay
- Error and reconnect states

### Phase 7 — QA and hardening
- Engine tests
- Settlement tests
- Realtime flow tests
- Responsive QA
- Build and type checks
- Runtime verification

## Integration Files
Likely touched files:
- `shared/arcade-games.ts`
- `client/src/pages/arcade-play.tsx`
- `client/public/games/ludo/index.html`
- `server/game-engines/index.ts`
- `server/routes/arcade-sessions.ts`
- `server/websocket/*` if realtime gameplay is server-driven
- `server/storage/*` if settlement hooks are needed

## Notes
- This game must be treated as a financial product, not a casual mini-game.
- The engine and settlement logic must be deterministic and recoverable.
- Every phase should be verified before moving to the next.
