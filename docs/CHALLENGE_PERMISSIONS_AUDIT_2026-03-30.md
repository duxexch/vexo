# Challenge and Games Permissions Audit (2026-03-30)

Scope:

- Challenge API routes (create/join/details/listing/withdraw/session/points/gifts)
- Spectator/support routes
- Realtime gameplay paths (legacy challenge WS `/ws` and game WS `/ws/game`)
- Frontend player/spectator behavior wiring

## Deep Analysis Delta (Current Snapshot)

This section reflects the current code snapshot after the Phase 1 and Phase 2 hardening work. The historical sections below remain for traceability, but this delta is the source of truth for what is still open right now.

### Confirmed Closed In Current Code

- Private challenge read access in `details`, `gifts`, `session`, `points`, `supports`, and `odds` routes is now enforced by shared helper policy.
- Team participant normalization (`player3Id` / `player4Id`) is now active in key REST paths (listing, details, supports, points, session creation).
- Friend challenge lifecycle dead-end was addressed (reserved seat acceptance via join path).
- `/ws/game` spectate path now enforces private-visibility access and challenge spectator policy (`allowSpectators` / `maxSpectators`).
- Forfeit/disconnect flow now defers completion and settlement through `handleGameOver` without pre-marking sessions as completed.
- Private/friend challenge updates are now targeted to authorized audience only (players + invited friend), not globally broadcast.
- Team-aware payout/draw settlement and spectator support settlement are normalized across shared payout logic and legacy realtime handlers.
- Realtime gifting is now constrained: sender must be in-room (player/spectator as applicable) and recipient must be an active challenge participant.
- `getAvailableChallenges` now excludes all already-seated participants (`player1..player4`) to prevent joinable-card leakage for already-joined users.
- Regression smoke coverage was added for private challenge access, friend-reserved join blocking, and available-list participant exclusion.
- Challenge points policy is now narrowed: only active spectators can boost, seated players are blocked, and anti-spam cooldown/rate limiting is enforced.
- Deeper realtime regression coverage is now active in `scripts/smoke-challenge-permissions.mjs`: private update audience scoping (`/ws`), private spectate authorization (`/ws/game`), realtime gifting recipient constraints (legacy + `/ws/game`), and voluntary-leave forfeit sequencing with DB persistence assertions.
- Explicit gameplay regression coverage is now separated into `scripts/smoke-challenge-gameplay-regression.ts` for `chess/backgammon/tarneeb/baloot` move-path smoke checks (join, move ack, and session progression persistence).

### Open Findings (Current)

No open findings remain in this snapshot after the latest challenge-points hardening pass.

### Recommended Next Execution Block

- Wire `scripts/smoke-challenge-permissions.mjs` into automated pipelines using the deterministic limiter-reset profile (`--reset-sensitive-limiter --redis-url=$REDIS_URL`) so repeated local/container runs remain warning-free.
- Run `npm run quality:gate:phase-e` in CI to enforce both explicit multi-game gameplay regression (`chess/backgammon/tarneeb/baloot`) and Domino performance checks.

## Critical Findings

1. Private challenge information disclosure via details endpoint

- File: server/routes/challenges/details.ts:10
- Issue: `GET /api/challenges/:id` returns challenge details for any authenticated user without checking challenge visibility (`public/private`) or participant/spectator authorization.
- Impact: Any authenticated user can enumerate private challenges and view participants/metadata.

1. Private challenge gifts disclosure

- File: server/routes/challenges/gifts.ts:100
- Issue: `GET /api/challenges/:id/gifts` lacks authorization checks for challenge visibility and membership.
- Impact: Gift history and recipient metadata for private challenges can be read by unrelated users.

1. Legacy challenge session endpoint missing authorization

- File: server/routes/challenges/sessions-points.ts:12
- Issue: `GET /api/challenges/:id/session` returns session info for any authenticated user; no participant/visibility verification.
- Impact: Session state leakage for private/active games.

1. Realtime stack split causes policy drift

- Files: server/websocket/index.ts:52, server/game-websocket/index.ts:26
- Issue: Two independent realtime pathways (`/ws` and `/ws/game`) with different permission and payout logic.
- Impact: Inconsistent enforcement and higher risk of bypass/regression.

## High Findings

1. Team-game support restrictions hardcoded to 2 players

- File: server/routes/spectator/support-actions.ts:42
- Issue: Support placement only accepts `player1Id/player2Id`; `player3Id/player4Id` are invalid even in 4-player challenges.
- Impact: Broken/incorrect spectator permissions and business logic for team games.

1. Challenge session creation forbids player3/player4

- File: server/routes/challenges/sessions-points.ts:35
- Issue: Participant check only allows `player1Id` or `player2Id`.
- Impact: Legitimate team players cannot manage/recover session flows.

1. Challenge points route excludes team players

- File: server/routes/challenges/sessions-points.ts:114
- Issue: Target validation only allows player1/player2.
- Impact: Team game interactions are inconsistent and partially blocked.

1. "My challenges" list ignores player3/player4 membership

- File: server/routes/challenges/listing.ts:101
- Issue: `GET /api/challenges/my` filters only by player1/player2.
- Impact: Team participants may not see their own active/history challenges.

## Medium Findings

1. Friend challenge seat pre-assignment can block acceptance path

- Files: server/routes/challenges/create.ts:198, server/routes/challenges/join.ts:195
- Issue: Friend challenge sets `player2Id=friendAccountId` at create time while `currentPlayers=1`; join rejects already-seated user as "already joined".
- Impact: Ambiguous join lifecycle and potential inability for invited friend to explicitly accept/start via join flow.

1. Legacy WS team payout/winner assumptions are 2-player biased

- Files: server/websocket/challenge-games/moves.ts:101, server/websocket/challenge-games/resign-draw.ts:31
- Issue: Winner/loser determination maps team outcomes to player1/player2 in several branches.
- Impact: Incorrect settlement/notifications in 4-player team games.

1. Legacy WS gifting does not validate recipient participation

- File: server/websocket/challenge-games/chat-gifts.ts:85
- Issue: Gift recipient is validated for existence and self-gift only; not checked that recipient belongs to current challenge participants.
- Impact: Potential out-of-scope gifting tied to a challenge context.

1. `allow ANY player to withdraw` policy is broad and needs explicit product confirmation

- File: server/routes/challenges/withdraw.ts:19
- Issue: Any seated player can withdraw active challenge (with penalties/refunds).
- Impact: Could be intended, but should be confirmed against product rules for team games and anti-abuse policy.

## Observations (No immediate bug verdict)

1. Frontend spectator flag in watch page is advisory only

- File: client/src/pages/challenge-watch.tsx:248
- Note: `isSpectator: true` in WS message is ignored by server role assignment (server correctly derives role).

1. Challenge-game page uses `/ws` legacy channel

- File: client/src/pages/challenge-game.tsx:245
- Note: Player/spectator gating in UI exists, but backend is source of truth.

## Production Plan (1 / 2 / 3)

This is a production-grade delivery plan based on actual code behavior (not assumptions), with no temporary patches and no dead-code leftovers.

### Phase 1 (Completed): Access Control Hardening and Team-Player Normalization

Status: Completed in code

Goals:

- Close private challenge data leaks.
- Introduce one reusable challenge access policy helper.
- Normalize participant checks for 2-player and 4-player challenges.

Implemented changes:

- Added centralized helper in `server/routes/challenges/helpers.ts`:
  - `getChallengeParticipantIds(...)`
  - `isChallengeParticipant(...)`
  - `getChallengeReadAccess(...)`
- Enforced read access (`public` vs `private`) in:
  - `GET /api/challenges/:id` in `server/routes/challenges/details.ts`
  - `GET /api/challenges/:id/stakes` in `server/routes/challenges/details.ts`
  - `GET /api/challenges/:id/gifts` in `server/routes/challenges/gifts.ts`
  - `GET /api/challenges/:id/session` in `server/routes/challenges/sessions-points.ts`
  - `GET /api/challenges/:id/points` in `server/routes/challenges/sessions-points.ts`
  - `GET /api/challenges/:challengeId/supports` in `server/routes/spectator/support-odds.ts`
  - `GET /api/challenges/:challengeId/odds` in `server/routes/spectator/support-odds.ts`
- Expanded participant handling to support `player3Id` and `player4Id` in:
  - Challenge details response payload (`player3`, `player4` blocks)
  - Session creation participant check and engine player list
  - Challenge points target validation
  - Listing endpoints including `GET /api/challenges/my`
  - Spectator support target validation and self-support prevention
- Hardened challenge gifting:
  - Recipient must be a challenge participant.
  - Quantity validated with safe bounds.

Result:

- Private challenge endpoints no longer expose data to unrelated authenticated users.
- Team participants (3/4) are now consistently recognized across key challenge APIs.

### Phase 2: Support/Odds Domain Completion + Friend Challenge Lifecycle

Status: Completed in backend APIs

Goals:

- Remove remaining 2-player assumptions from support and odds behavior.
- Resolve friend challenge reserved-seat ambiguity with deterministic lifecycle rules.

Implemented changes:

- Friend challenge lifecycle:
  - Enforced `friendAccountId` as required for `opponentType=friend` in create route.
  - Forced friend challenges to `private` visibility at creation time.
  - Updated join flow so invited friend can explicitly accept reserved seat using the existing join endpoint (join-as-accept path).
  - Blocked non-invited users from joining while friend acceptance is still pending.
- Support/Odds topology hardening:
  - Added team-side helper logic (`team1: player1+player3`, `team2: player2+player4`) for 4-player challenges.
  - Updated wait-for-match support odds to compare supported side vs opposing side (not "all other players").
  - Updated support pairing to match only against opposing-side supports, preventing same-side accidental pairing.
  - Updated odds endpoint to return team-aware calculations and extended player odds metadata (`player3`, `player4`, `teams`) while keeping existing `player1/player2` compatibility.

Acceptance criteria:

- No friend-join dead-end when `friendAccountId` is prefilled.
- Support matching and odds remain correct for both 2-player and 4-player games.

### Phase 3: Realtime Policy Unification + Regression Test Net

Status: In progress (core hardening implemented; deeper realtime coverage added in smoke; CI hardening pending)

Goals:

- Eliminate policy drift between `/ws` and `/ws/game`.
- Lock behavior with regression tests at route and realtime levels.

Planned implementation:

- Realtime unification:
  - Align participant/spectator/recipient checks across both websocket stacks (implemented for spectate and gifting paths).
  - Continue reducing duplicated permission branches where possible.
- Regression coverage:
  - Baseline challenge permissions smoke added at `scripts/smoke-challenge-permissions.mjs`.
  - Added realtime assertions for:
    - `/ws` private challenge update audience scoping.
    - `/ws/game` private challenge spectate authorization.
    - Legacy + `/ws/game` gifting recipient constraints.
    - Voluntary leave forfeit sequencing (`game_over` then `player_forfeited`) plus `live_game_sessions/challenges` completion assertions.
  - Route tests for private/public access and participant matrix.
  - Team-player tests for player3/player4 in sessions/points/listings/supports.
  - Realtime action authorization tests (move/chat/gift/support) and settlement ordering tests for disconnect/forfeit.
- Cleanup standards:
  - Remove superseded helper branches and any obsolete legacy checks.
  - No feature flags left dangling without owner/deprecation path.

Acceptance criteria:

- Same access decision for equivalent operation regardless of realtime entrypoint.
- Critical permission regressions are blocked by automated test suite.

---
Prepared as a live production execution document. Phase 1 and Phase 2 are implemented; Phase 3 is active with expanded realtime smoke coverage and pending CI integration hardening.
