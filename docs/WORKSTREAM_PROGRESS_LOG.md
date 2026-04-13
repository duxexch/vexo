# Workstream Progress Log

This file tracks completed chunks to avoid repeating the same audit/work in future requests.

## Scope

- Primary request: full project duplicate-design audit and reduction
- Rule: once a chunk is marked DONE, it is skipped in later passes unless files in that chunk change

## Chunk Status

| Chunk ID | Area | Files/Scope | Status | Result | Verified At |
|---|---|---|---|---|---|
| DEDUP-001 | Baseline duplicate scan | `client/src` via `jscpd --min-lines 8 --min-tokens 70` | DONE | Baseline: 59 clones | 2026-04-13 |
| DEDUP-002 | Transactions dialog dedup | `client/src/pages/transactions.tsx` | DONE | Extracted shared render helpers for method option + limits card | 2026-04-13 |
| DEDUP-003 | Legal pages layout dedup | `client/src/pages/privacy.tsx`, `client/src/pages/terms.tsx`, `client/src/components/legal/LegalDocumentLayout.tsx` | DONE | Unified repeated wrapper layout into shared component | 2026-04-13 |
| DEDUP-004 | Re-scan after fixes | `client/src` via `jscpd --min-lines 8 --min-tokens 70` | DONE | Improved to 57 clones | 2026-04-13 |
| DEDUP-005 | Admin pages high-clone group | `client/src/pages/admin/*` | TODO | Not finalized yet | - |
| DEDUP-006 | Games pages high-clone group | `client/src/pages/games/*`, `client/src/components/games/*` | DONE | Scoped scan completed: 13 clones (mostly shared shell blocks across game pages) | 2026-04-13 |
| DEDUP-007 | Chat feature component clones | `client/src/components/chat-*`, related hooks/pages | TODO | Not finalized yet | - |
| GAME-VERIFY-001 | Game features visibility audit | `client/src/pages/games/*`, `client/src/pages/challenge-game.tsx`, `client/src/pages/challenge-watch.tsx`, `client/src/components/games/SpectatorPanel.tsx` | DONE | Verified spectator panel + live chat + support/gifts aggregates + floating mobile controls + single route per game | 2026-04-13 |
| GAME-VERIFY-002 | Chess board path unification | `client/src/components/games/ChessBoard.tsx`, `client/src/components/games/chess/ChessBoard.tsx` | TODO | Two ChessBoard implementations are used in different routes and may produce dual visual styles | - |
| GAME-UI-003 | Challenge player lanes standards pass | `client/src/pages/challenge-game.tsx`, `client/src/pages/challenge-watch.tsx`, `client/src/index.css` | DONE | Unified clickable avatar cards with profile summary, spectator follow/friend actions, result badge near names, and stronger slower active-turn glow | 2026-04-13 |
| PERM-VERIFY-001 | Player vs spectator role enforcement | `server/websocket/challenge-games/*`, `server/game-websocket/*`, `client/src/pages/challenge-game.tsx`, `client/src/hooks/useGameWebSocket.ts` | DONE | Verified server-side role assignment + guards + spectator action blocking on both challenge and game websocket paths | 2026-04-13 |
| DIAG-CHESS-001 | Chess duplication root-cause diagnosis | `client/src/pages/challenge-game.tsx`, `client/src/pages/challenge-watch.tsx`, `client/src/pages/games/ChessGame.tsx`, `client/src/components/games/ChessBoard.tsx`, `client/src/components/games/chess/ChessBoard.tsx` | DONE | Chess only uses two distinct board components across routes; other games already reuse one board path | 2026-04-13 |

## Verification Notes

- Type check was run during dedup iterations using `npx tsc --noEmit`.
- Duplicate metric source: `npx --yes jscpd client/src --min-lines 8 --min-tokens 70 --reporters console`.
- Games-only duplicate metric source: `npx --yes jscpd client/src/pages/games client/src/components/games --min-lines 8 --min-tokens 70 --reporters console`.
- Game routing check source: `client/src/App.tsx` routes `/game/chess/:sessionId`, `/game/backgammon/:sessionId`, `/game/domino/:sessionId`, `/game/tarneeb/:sessionId`, `/game/baloot/:sessionId`.
- Role enforcement references:
  - Challenge WS role assignment/limits in `server/websocket/challenge-games/join-leave.ts`.
  - Challenge WS role guards in `server/websocket/challenge-games/guards.ts`.
  - Live game WS join/spectate/move restrictions in `server/game-websocket/auth-join.ts` and `server/game-websocket/moves.ts`.

## Re-run Policy

- Do not re-audit chunks marked DONE unless:
  - Any file in that chunk changed after verification, or
  - The user explicitly asks to re-open that chunk.

## Next Chunk To Execute

- `GAME-VERIFY-002` (Chess board path unification implementation)
