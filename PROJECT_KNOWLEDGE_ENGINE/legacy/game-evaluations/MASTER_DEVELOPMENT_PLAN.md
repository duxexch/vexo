# VEX Games — Master Development Plan

**Created**: March 6, 2026  
**Games**: Backgammon → Baloot → Domino → Tarneeb  
**Methodology**: Analyze → Plan → Execute → Test → Next Game → Repeat ×10+  
**Total Cycles**: 40+ (4 games × 10+ rounds)  
**Estimated Fixes**: 480+ (12 per cycle)

---

## Current Baseline

| Game | Stars | Engine | Bot AI | UI | a11y | i18n | Security | Performance |
|------|-------|--------|--------|-----|------|------|----------|------------|
| Backgammon | ⭐⭐½ | 668 LOC | ❌ None | 710 LOC | ❌ 0 aria | 46 keys | ✅ crypto dice | memo=0 cb=3 |
| Baloot | ⭐⭐⭐⭐ | 1197 LOC | ✅ Advanced | 1264 LOC | ✅ 16 aria | 83 keys | ✅ shuffleSecure | memo=0 cb=4 |
| Domino | ⭐⭐⭐⭐½ | 700 LOC | ✅ Good | 1014 LOC | ✅ 20+ aria | 53 keys | ✅ cryptoRandom | memo=1 cb=1 |
| Tarneeb | ⭐⭐⭐⭐½ | 1523 LOC | ✅ Expert | 1928 LOC | ⚠️ 10 aria | 48 keys | ✅ shuffleSecure | memo=0 cb=2 |

---

## Execution Pattern (Per Game Per Round)

```
┌─────────────────────────────────────────┐
│ 1. ANALYZE  — Deep code read + audit    │
│ 2. PLAN     — List 12 fixes (severity)  │
│ 3. EXECUTE  — Implement all 12          │
│ 4. TEST     — tsc + server + curl 200   │
│ 5. COMMIT   — Git commit + push         │
│ 6. NEXT     — Move to next game         │
└─────────────────────────────────────────┘
```

---

## Round 1 — Foundation (Backgammon rescue + others hardening)

### R1-Backgammon (⭐⭐½ → ⭐⭐⭐) — Bot AI Foundation
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Create `BackgammonEngine.generateBotMove()` — random valid move selection | Bot AI | Critical |
| 2 | Add `isBotPlayer()` + `runBotTurns()` loop | Bot AI | Critical |
| 3 | Add `botPlayers` field to `BackgammonState` type | Bot AI | Critical |
| 4 | Add `initializeWithPlayers()` accepting 1 player + auto-bot | Bot AI | Critical |
| 5 | Bot move: prioritize hitting blots (exposed opponent checkers) | Bot AI | High |
| 6 | Bot move: prefer making points (landing 2+ on same point) | Bot AI | High |
| 7 | Add `aria-label` to all 24 board points | a11y | High |
| 8 | Add `role="button"` + `tabIndex` to clickable checkers | a11y | High |
| 9 | Add `aria-live="polite"` on dice results | a11y | Medium |
| 10 | Add sound effects in BackgammonBoard (move, hit, bear-off, dice) | UX | Medium |
| 11 | Add gammon detection (loser has 0 borne off = ×2 score) | Engine | Medium |
| 12 | Add backgammon detection (loser has checker on bar/opponent home = ×3) | Engine | Medium |

### R1-Baloot (⭐⭐⭐⭐ → ⭐⭐⭐⭐) — Security Hardening
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | `structuredClone` consistency audit — verify all applyMove paths | Security | High |
| 2 | Validate `card` payload shape in `playCard` (prevent prototype pollution) | Security | Critical |
| 3 | Add `allowedMoveKeys` sanitization before DB storage | Security | High |
| 4 | Guard against duplicate `playerId` in `initializeWithPlayers` | Security | High |
| 5 | Bot `JSON.parse(move.card)` → single-parse cache (performance) | Performance | Medium |
| 6 | Validate `trumpSuit` is strict enum not arbitrary string | Security | High |
| 7 | Guard `passRound` overflow (cap at 2) | Engine | Medium |
| 8 | Add `gamePhase === 'finished'` guard at top of `applyMoveInternal` | Security | Medium |
| 9 | `getCardPoints` null-safe fallback | Engine | Low |
| 10 | Validate `targetPoints` range (positive integer, max 500) | Security | Medium |
| 11 | Guard `roundNumber` overflow (cap at 100) | Engine | Low |
| 12 | Add `errorKey` to all remaining error returns | i18n | Low |

### R1-Domino (⭐⭐⭐⭐½ → ⭐⭐⭐⭐½) — Refinement
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Rematch button — offer to play same opponent again | UX | Medium |
| 2 | Tile placement slide-in animation on board | UX | Medium |
| 3 | Game history — show last 3 moves log in collapsible panel | UX | Low |
| 4 | Bot difficulty levels (easy/medium/hard) via scoring factor weights | Bot AI | Medium |
| 5 | Spectator count badge | UX | Low |
| 6 | 3-player mode edge case: verify pip count when 1 player finishes | Engine | Medium |
| 7 | Mobile touch gesture: drag-and-drop tile to board end | UX | Medium |
| 8 | Draw pile count animation (bounce on change) | UX | Low |
| 9 | Move undo within 2s (before server confirms) — UX only | UX | Low |
| 10 | Tile hover preview showing where it would land | UX | Low |
| 11 | Victory celebration animation (confetti/particles) | UX | Low |
| 12 | Board zoom controls for small screens | UX | Medium |

### R1-Tarneeb (⭐⭐⭐⭐½ → ⭐⭐⭐⭐½) — Accessibility + Structure
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Add `aria-label` to all player hand cards | a11y | High |
| 2 | Add `role="region"` with `aria-label` on trick area | a11y | High |
| 3 | Add `aria-live="assertive"` on bid results | a11y | High |
| 4 | Keyboard navigation for card selection (arrow keys) | a11y | Medium |
| 5 | Add `aria-label` on trump suit indicator | a11y | Medium |
| 6 | Screen reader announcement on trick winner | a11y | Medium |
| 7 | Extract bot bidding to separate file `bot-bidding.ts` | Structure | Low |
| 8 | Extract bot card-play to separate file `bot-play.ts` | Structure | Low |
| 9 | Add `React.memo` on card components | Performance | Low |
| 10 | Validate `bid` is integer (not float) in `validateMoveInternal` | Security | Medium |
| 11 | Guard `redealCount` overflow (cap at 5) | Engine | Low |
| 12 | Add `errorKey` to all remaining validation returns | i18n | Low |

---

## Round 2 — Bot Intelligence (Backgammon strategy + others optimization)

### R2-Backgammon — Strategic Bot AI
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Bot: prime detection (6 consecutive blocked points = powerful position) | Bot AI | High |
| 2 | Bot: running game strategy (race to bear off when ahead in pip count) | Bot AI | High |
| 3 | Bot: anchor placement (hold points in opponent's home board) | Bot AI | High |
| 4 | Bot: blot exposure minimization (avoid leaving single checkers) | Bot AI | High |
| 5 | Bot: doubling cube decision (pip count ratio + positional advantage) | Bot AI | High |
| 6 | Bot: accept/decline double based on Janowski formula | Bot AI | Medium |
| 7 | Keyboard navigation for checker selection | a11y | Medium |
| 8 | Add `aria-label` on doubling cube with current value | a11y | Medium |
| 9 | Add `aria-label` on bar with checker count | a11y | Medium |
| 10 | Add `aria-live` for turn changes and dice rolls | a11y | Medium |
| 11 | Move history display (scrollable list of past moves) | UX | Low |
| 12 | Pip count display for each player | UX | Low |

### R2-Baloot — Bot AI Optimization
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Pre-compute `playedSet` once per bot turn (like Tarneeb) | Performance | High |
| 2 | `isMasterCard` with O(1) set lookup instead of loop | Performance | High |
| 3 | `remainingInSuit` cached per decision | Performance | Medium |
| 4 | `parseCard` caching map (like Tarneeb `parsedCardCache`) | Performance | Medium |
| 5 | Bot: sacrifice detection (bid to block opponent win) | Bot AI | Medium |
| 6 | Bot: project-aware card play (hold sequences/4-of-a-kind cards) | Bot AI | Medium |
| 7 | Bot: Baloot project detection (K+Q of trump) during play | Bot AI | Medium |
| 8 | Validate `move.card` is object with `suit`+`rank` fields | Security | High |
| 9 | `React.memo` on individual card components | Performance | Low |
| 10 | Add `useCallback` for event handlers in BalootBoard | Performance | Low |
| 11 | Timer deps audit (prevent unnecessary resets) | Performance | Medium |
| 12 | Move error banner with i18n mapping (like Domino) | UX | Medium |

### R2-Domino — Multi-round & Polish
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Multi-round mode (race to 100/150/200 points) | Engine | High |
| 2 | Round transition screen with score summary | UX | High |
| 3 | Cumulative score tracking across rounds | Engine | High |
| 4 | "Double" variant support (draw 2 at a time) | Engine | Medium |
| 5 | Player statistics page (win rate, average score) | UX | Medium |
| 6 | Performance: batch DOM updates during bot play | Performance | Low |
| 7 | Add `useCallback` for move/draw/pass handlers | Performance | Low |
| 8 | Re-verify `lowestPips` and `winningTeamPips` in all edge cases | Engine | Medium |
| 9 | Add forfeit/resign mechanism | Engine | Medium |
| 10 | Improve bot response time (avoid unnecessary delays) | Performance | Low |
| 11 | Add chat emoji reactions during game | UX | Low |
| 12 | Board layout improvements for 4p mode (square layout) | UX | Medium |

### R2-Tarneeb — Engine Hardening
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Validate `setTrump` suit is strict enum type | Security | High |
| 2 | Guard against card replay (card already in `playedCardsMemo`) | Security | Critical |
| 3 | Verify trick winner calculation for edge case: all same suit | Engine | Medium |
| 4 | Add `move_rejected` as non-fatal in WebSocket handler | WebSocket | High |
| 5 | Improve `evaluateHandStrength` accuracy (track actual vs predicted) | Bot AI | Medium |
| 6 | Add `playedCardsMemo` validation (prevents injection) | Security | High |
| 7 | Guard `totalTricksPlayed` > 13 (impossible state protection) | Engine | Low |
| 8 | Optimize `opponentTrumpsRemaining()` — cache per decision | Performance | Medium |
| 9 | Add timer deps cleanup in TarneebBoard | Performance | Medium |
| 10 | Improve `pickVoidDiscard` with situational awareness | Bot AI | Low |
| 11 | Add `structuredClone` fallback for older Node versions | Compat | Low |
| 12 | Round summary persistence across reconnection | WebSocket | Medium |

---

## Round 3 — Advanced Bot AI + UX Polish

### R3-Backgammon — Bearing Off + UI
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Bot: optimal bearing off order (highest distance first) | Bot AI | High |
| 2 | Bot: safety vs progress trade-off in bearing off phase | Bot AI | High |
| 3 | Bot: pip count calculation for race decisions | Bot AI | Medium |
| 4 | Bot: back game strategy (hold anchors when far behind) | Bot AI | Medium |
| 5 | Add timer per turn (auto-forfeit on timeout) | Engine | High |
| 6 | Checker drag-and-drop for mobile devices | UX | High |
| 7 | Valid moves highlighting (show possible destinations) | UX | High |
| 8 | Undo last partial move (before end_turn) | UX | Medium |
| 9 | Add `React.memo` on point components | Performance | Low |
| 10 | Board flip animation (rotate 180° for black player) | UX | Medium |
| 11 | Doubling cube visual indicator (3D cube rotation) | UX | Low |
| 12 | Match score tracking (first to X points) | Engine | Medium |

### R3-Baloot — UX & Animations
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Card play slide animation (hand → trick area) | UX | High |
| 2 | Project announcement banner with points animation | UX | High |
| 3 | Kaboot celebration/defeat animation | UX | High |
| 4 | Trump suit selection wheel UI (instead of dropdown) | UX | Medium |
| 5 | Last trick peek animation (fan-out cards) | UX | Medium |
| 6 | Round summary modal with detailed breakdown | UX | Medium |
| 7 | Score change animation (counter roll-up effect) | UX | Medium |
| 8 | Card sort by suit/rank toggle for hand | UX | Low |
| 9 | Player position labels (North/South/East/West) | UX | Low |
| 10 | Sound: shuffle, card play, trick win, project declare, kaboot | UX | Medium |
| 11 | Vibration feedback on mobile (card play, trick win) | UX | Low |
| 12 | Dark mode card contrast optimization | UX | Low |

### R3-Domino — Advanced Features
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Tournament mode (bracket system, 4-8 players) | Engine | High |
| 2 | Game replay viewer (step through past games) | UX | Medium |
| 3 | Tile texture/style options (classic, modern, neon) | UX | Low |
| 4 | Custom table background themes | UX | Low |
| 5 | Player avatar display on game board | UX | Medium |
| 6 | ELO rating system for matchmaking | Engine | High |
| 7 | Spectator chat overlay | UX | Low |
| 8 | "Thinking" indicator when bot is calculating | UX | Low |
| 9 | Connection quality indicator (latency display) | UX | Low |
| 10 | Win streak badge display | UX | Low |
| 11 | Engine: prevent infinite loop in edge case bot sequences | Engine | Medium |
| 12 | Security: rate-limit move submissions per player | Security | Medium |

### R3-Tarneeb — Performance & Polish
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Split engine.ts → engine.ts + bot-ai.ts + validation.ts | Structure | High |
| 2 | Card play animation (fly from hand to center) | UX | High |
| 3 | Trick collection animation (cards sweep to winner) | UX | High |
| 4 | Bid announcement animation (speech bubble) | UX | Medium |
| 5 | Trump suit indicator pulse animation | UX | Low |
| 6 | Add `React.memo` on `TarneebCard` sub-component | Performance | Medium |
| 7 | Optimize `generateBotMove` — reduce object allocations | Performance | Medium |
| 8 | Score history graph (visual chart over rounds) | UX | Medium |
| 9 | Keyboard accessibility: Enter to play selected card | a11y | Medium |
| 10 | Screen reader: announce current bid leader | a11y | Low |
| 11 | Mobile: swipe gesture to play card | UX | Medium |
| 12 | Add confetti animation on game win | UX | Low |

---

## Round 4 — WebSocket & Reconnection Hardening

### R4-Backgammon — WebSocket Integration
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | gameState safe fallback (like Domino F3-C18) | WebSocket | Critical |
| 2 | `move_rejected` as non-fatal error handling | WebSocket | Critical |
| 3 | Watchdog timer for pending moves (8s timeout) | WebSocket | High |
| 4 | `lowestPips` equivalent for score display | WebSocket | Medium |
| 5 | Spectator view support in `getPlayerView` | Engine | Medium |
| 6 | Reconnection state sync (full board recovery) | WebSocket | High |
| 7 | Bot move delay (500ms) for natural feel | UX | Low |
| 8 | Move animation queue (sequential, not simultaneous) | UX | Medium |
| 9 | Error banner with i18n error mapping | UX | Medium |
| 10 | Leave game confirmation (like Domino F8-C18) | UX | Medium |
| 11 | Opponent disconnect notification | WebSocket | Medium |
| 12 | Auto-reconnect with exponential backoff | WebSocket | High |

### R4-Baloot — WebSocket Hardening
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Safe `game_state` parsing with fallback sync | WebSocket | Critical |
| 2 | Watchdog timer for bot auto-play acknowledgement | WebSocket | High |
| 3 | Round transition state sync (new deal cards) | WebSocket | High |
| 4 | Project announcement sync across all clients | WebSocket | Medium |
| 5 | Kaboot event sync with animation trigger | WebSocket | Medium |
| 6 | Choosing phase sync (show opponent passes/choices) | WebSocket | Medium |
| 7 | Spectator view: hide all hands, show trick + score | Engine | Medium |
| 8 | Reconnection: restore correct phase (choosing/playing) | WebSocket | High |
| 9 | Error recovery: stale state detection + auto-sync | WebSocket | Medium |
| 10 | Tab visibility change → request sync | WebSocket | Low |
| 11 | Move pending timestamp + timeout reset | WebSocket | Low |
| 12 | Last completed trick preservation across sync | WebSocket | Low |

### R4-Domino — Security Deepening
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Rate-limit draw/pass attempts (prevent spam) | Security | High |
| 2 | Verify consistent game state after bot moves | Security | High |
| 3 | Add move sequence validation (turn number tracking) | Security | Medium |
| 4 | Prevent concurrent game joins (player already in game) | Security | Medium |
| 5 | Game timeout — auto-forfeit after 5 min inactivity | Engine | Medium |
| 6 | Anti-cheat: server-side timer (not client-trusted) | Security | High |
| 7 | Sanitize all WebSocket payload before broadcast | Security | High |
| 8 | Validate spectator cannot send game moves | Security | Medium |
| 9 | Add CSP headers for game iframe embedding prevention | Security | Low |
| 10 | Log suspicious move patterns (too fast, impossible sequences) | Security | Low |
| 11 | Validate tile JSON shape (prevent injection) | Security | Medium |
| 12 | Add game move audit trail for dispute resolution | Security | Low |

### R4-Tarneeb — WebSocket Robustness
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Safe `game_state` parsing (prevent raw cast) | WebSocket | Critical |
| 2 | Bid phase sync (show all bids in real-time) | WebSocket | High |
| 3 | Trump selection sync (announce to all players) | WebSocket | High |
| 4 | Trick animation sync (play cards sequentially) | WebSocket | Medium |
| 5 | Round end sync with score breakdown | WebSocket | Medium |
| 6 | Reconnection: restore bid history + current trick | WebSocket | High |
| 7 | Watchdog for stuck bot turns | WebSocket | Medium |
| 8 | Tab visibility → auto-sync | WebSocket | Low |
| 9 | Spectator: show all tricks + bids + scores | Engine | Medium |
| 10 | Move pending guards (prevent double-submit) | WebSocket | Medium |
| 11 | Error classification: fatal vs non-fatal | WebSocket | Medium |
| 12 | Network loss → queued moves retry | WebSocket | Low |

---

## Round 5 — Mobile & Responsive Design

### R5-Backgammon — Mobile-First Board
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Responsive board layout (portrait/landscape) | UI | Critical |
| 2 | Touch-optimized point targets (min 44×44px) | UI | High |
| 3 | Swipe gesture for checker movement | UI | High |
| 4 | Bottom-sheet for doubling cube actions | UI | Medium |
| 5 | Compact dice display for small screens | UI | Medium |
| 6 | Auto-scale checker size based on viewport | UI | Medium |
| 7 | PWA: offline indicator during game | UI | Low |
| 8 | Haptic feedback on checker placement | UX | Low |
| 9 | Landscape mode: full-width board | UI | Medium |
| 10 | Portrait mode: stacked board half + controls | UI | Medium |
| 11 | Pinch-to-zoom on board | UI | Low |
| 12 | Safe area insets for notched devices | UI | Medium |

### R5-Baloot — Mobile Card Layout
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Fan-out card hand for mobile (arc layout) | UI | High |
| 2 | Swipe card to play | UI | High |
| 3 | Bottom sheet for choosing phase | UI | Medium |
| 4 | Compact score display for small screens | UI | Medium |
| 5 | Card zoom on long-press | UI | Medium |
| 6 | Portrait: vertical trick layout | UI | Medium |
| 7 | Landscape: horizontal trick layout | UI | Medium |
| 8 | Project banner responsive sizing | UI | Low |
| 9 | Touch target audit (44×44px minimum) | UI | Medium |
| 10 | Safe area padding for notch devices | UI | Medium |
| 11 | Reduce card detail at small sizes | UI | Low |
| 12 | Score modal responsive layout | UI | Low |

### R5-Domino — Mobile Touch Enhancement
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Drag-and-drop tile to board endpoint | UI | High |
| 2 | Pinch-to-zoom on board chain | UI | Medium |
| 3 | Double-tap to auto-place single-valid tiles | UI | Medium |
| 4 | Swipe hand tiles left/right | UI | Medium |
| 5 | Bottom-sheet for draw/pass actions | UI | Medium |
| 6 | Compact tile size for small screens | UI | Medium |
| 7 | Board auto-center on last placed tile | UI | Low |
| 8 | Landscape: horizontal board scroll | UI | Low |
| 9 | Touch feedback (haptic on tile place) | UX | Low |
| 10 | One-handed play mode (all controls bottom) | UI | Medium |
| 11 | Quick-play: auto-select only valid tile | UI | Low |
| 12 | Safe area insets for notch devices | UI | Low |

### R5-Tarneeb — Mobile Card UX
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Arc card layout for mobile hand | UI | High |
| 2 | Swipe up to play selected card | UI | High |
| 3 | Compact bid slider for small screens | UI | Medium |
| 4 | Trump suit selector: grid of 4 large buttons | UI | Medium |
| 5 | Bottom sheet for score breakdown | UI | Medium |
| 6 | Card long-press zoom preview | UI | Medium |
| 7 | Portrait: vertical trick area | UI | Medium |
| 8 | Landscape: full-width table layout | UI | Medium |
| 9 | Touch target audit (44×44px minimum) | UI | Medium |
| 10 | Safe area padding | UI | Low |
| 11 | Reduce card text at small sizes | UI | Low |
| 12 | Haptic on trick win | UX | Low |

---

## Round 6 — i18n Completion + Error Handling

### R6-Backgammon — i18n + Error UX
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Add 20+ new i18n keys for bot messages | i18n | High |
| 2 | Move error text i18n mapping (like Domino) | i18n | High |
| 3 | Error banner component with amber styling | UX | High |
| 4 | Game result card with win/loss/gammon/backgammon | UX | High |
| 5 | Add i18n keys for doubling cube actions | i18n | Medium |
| 6 | Add i18n keys for match mode scores | i18n | Medium |
| 7 | RTL layout support for Arabic | i18n | Medium |
| 8 | Dynamic error recovery suggestions | UX | Low |
| 9 | Toast notifications for non-fatal errors | UX | Low |
| 10 | Connection status i18n messages | i18n | Low |
| 11 | Game rules hover/modal in player's language | i18n | Low |
| 12 | Victory/defeat message variations (5+ per outcome) | i18n | Low |

### R6-Baloot — Error Classification + i18n
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | `getMoveErrorText()` function (like Domino) | i18n | High |
| 2 | Error banner with i18n-mapped text | UX | High |
| 3 | Add 15+ missing `errorKey` returns | i18n | High |
| 4 | Project name translations (سرا, أربعين, خمسين, مية) | i18n | High |
| 5 | RTL card layout for Arabic | i18n | Medium |
| 6 | Choosing phase labels i18n | i18n | Medium |
| 7 | Score breakdown labels i18n | i18n | Medium |
| 8 | Dynamic error recovery: suggest valid moves | UX | Medium |
| 9 | Connection error differentiation (session vs network) | UX | Medium |
| 10 | Game rules pop-up in player's language | i18n | Low |
| 11 | Add variant-specific i18n (hokm vs sun rules text) | i18n | Low |
| 12 | Time-sensitive messages (morning/evening greetings) | i18n | Low |

### R6-Domino — Error Recovery Enhancement
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Auto-retry failed moves with backoff | WebSocket | High |
| 2 | Stale state detection with user notification | WebSocket | High |
| 3 | Network quality indicator (good/fair/poor) | UX | Medium |
| 4 | Error context preservation (what move failed) | UX | Medium |
| 5 | Graceful degradation when WS drops mid-move | WebSocket | High |
| 6 | i18n: add 10 new error recovery message keys | i18n | Medium |
| 7 | i18n: add team member name display translations | i18n | Low |
| 8 | RTL board layout for Arabic | i18n | Low |
| 9 | Auto-save game state to localStorage for recovery | UX | Medium |
| 10 | "Reconnecting..." overlay with progress indicator | UX | Low |
| 11 | Friendly error messages for technical failures | UX | Low |
| 12 | Error analytics: log error types for monitoring | Security | Low |

### R6-Tarneeb — i18n Gap Closure
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Add 15+ missing i18n keys for bid/play phases | i18n | High |
| 2 | `getMoveErrorText()` with error mapping | i18n | High |
| 3 | Error banner for move rejections | UX | High |
| 4 | Bid history labels i18n | i18n | Medium |
| 5 | Round summary labels i18n | i18n | Medium |
| 6 | Trump selection labels i18n | i18n | Medium |
| 7 | RTL card layout | i18n | Medium |
| 8 | Score breakdown modal i18n | i18n | Low |
| 9 | Winner announcement i18n | i18n | Low |
| 10 | Game rules pop-up | i18n | Low |
| 11 | Connection messages i18n | i18n | Low |
| 12 | Error recovery suggestions i18n | i18n | Low |

---

## Round 7 — Performance Optimization

### R7-Backgammon — Render Performance
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | `React.memo` on Point components | Performance | High |
| 2 | `React.memo` on Checker components | Performance | High |
| 3 | `useMemo` for valid moves calculation | Performance | High |
| 4 | `useCallback` for click/drag handlers | Performance | Medium |
| 5 | Lazy-load game assets (textures, sounds) | Performance | Medium |
| 6 | Reduce re-renders during bot turns | Performance | Medium |
| 7 | Batch state updates during multi-checker moves | Performance | Medium |
| 8 | Optimize board rendering (canvas vs DOM trade-off) | Performance | Low |
| 9 | Debounce resize handler | Performance | Low |
| 10 | Skeleton loading state for board | Performance | Low |
| 11 | Pre-compute move destinations (avoid recalc) | Performance | Low |
| 12 | Memory leak audit (cleanup intervals/listeners) | Performance | Medium |

### R7-Baloot — Engine Performance
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | `getCardStrength` inline cache per bot decision | Performance | High |
| 2 | Reduce `structuredClone` overhead (selective clone) | Performance | High |
| 3 | Bot move generation time budget (< 100ms) | Performance | Medium |
| 4 | `React.memo` on card sub-components | Performance | Medium |
| 5 | `useMemo` for playable cards calculation | Performance | Medium |
| 6 | Lazy-load card face images | Performance | Low |
| 7 | Reduce JSON.stringify/parse in getGameStatus | Performance | Medium |
| 8 | Batch trick completion + score update | Performance | Low |
| 9 | Memory: cleanup event listeners on unmount | Performance | Low |
| 10 | Throttle card hover effects | Performance | Low |
| 11 | Pre-render card back texture (shared across instances) | Performance | Low |
| 12 | Profile and fix jank during card animations | Performance | Medium |

### R7-Domino — Optimization
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Board rendering: virtualize long chains | Performance | High |
| 2 | Tile component: stable reference IDs | Performance | Medium |
| 3 | `useCallback` for draw/pass event handlers | Performance | Medium |
| 4 | Lazy-load sound files (load on first interaction) | Performance | Medium |
| 5 | Reduce re-renders during opponent's turn | Performance | Medium |
| 6 | Throttle board scroll updates | Performance | Low |
| 7 | Pre-compute tile compatibility maps | Performance | Low |
| 8 | Memory: cleanup timer intervals properly | Performance | Medium |
| 9 | Batch UI updates during bot auto-play sequence | Performance | Low |
| 10 | Profile & fix layout thrashing during animations | Performance | Low |
| 11 | Image preload for tile assets | Performance | Low |
| 12 | Code-split game page (lazy route) | Performance | Low |

### R7-Tarneeb — Render & Engine
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | `React.memo` on card components | Performance | High |
| 2 | `useMemo` for valid plays calculation | Performance | High |
| 3 | `useCallback` for card click handlers | Performance | Medium |
| 4 | Reduce bot move object allocations | Performance | Medium |
| 5 | Minimize `JSON.parse` in engine hot paths | Performance | Medium |
| 6 | Lazy-load card textures | Performance | Low |
| 7 | Throttle bid slider updates | Performance | Low |
| 8 | Batch trick winner + score calculation | Performance | Low |
| 9 | Memory: cleanup all intervals/listeners | Performance | Medium |
| 10 | Profile card animation jank | Performance | Low |
| 11 | Pre-render card components pool | Performance | Low |
| 12 | Code-split TarneebGame page | Performance | Low |

---

## Round 8 — Advanced Features

### R8-Backgammon — Match Mode + Variants
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Match mode implementation (first to X points) | Engine | High |
| 2 | Crawford rule (no doubling when 1 point from winning) | Engine | High |
| 3 | Jacoby rule option (gammon/backgammon only with cube) | Engine | Medium |
| 4 | Auto-roll option (skip roll phase) | UX | Medium |
| 5 | Move notation (standard backgammon notation) | UX | Medium |
| 6 | Game analysis post-game (equity chart) | UX | Medium |
| 7 | Resign option (single/gammon/backgammon) | Engine | Medium |
| 8 | Tournament bracket integration | Engine | Medium |
| 9 | ELO rating for matchmaking | Engine | Medium |
| 10 | Clock/timer for competitive play | Engine | Medium |
| 11 | Board color theme customization | UX | Low |
| 12 | Export game as PGN-like notation | UX | Low |

### R8-Baloot — Advanced Rules
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Galda (redeal) option when all pass first round | Engine | High |
| 2 | Ashkal (decoration) project variant | Engine | Medium |
| 3 | Team chat during game | UX | Medium |
| 4 | Replay last trick button | UX | Medium |
| 5 | Hand evaluation indicator (for learning) | UX | Low |
| 6 | Tournament mode integration | Engine | Medium |
| 7 | ELO rating for matchmaking | Engine | Medium |
| 8 | Game replay viewer | UX | Medium |
| 9 | Statistics: per-player project frequency | UX | Low |
| 10 | Card counting helper (for learning mode) | UX | Low |
| 11 | Custom victory/defeat screens | UX | Low |
| 12 | Export game history | UX | Low |

### R8-Domino — Variants
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | Draw Domino variant (different draw rules) | Engine | Medium |
| 2 | Block Domino variant (no draw, must pass) | Engine | Medium |
| 3 | Spinner variant (double-6 is spinner) | Engine | Medium |
| 4 | Custom tile sets (double-9, double-12) | Engine | Medium |
| 5 | Team voice chat integration | UX | Low |
| 6 | Game replays archive | UX | Medium |
| 7 | Player profile integration | UX | Low |
| 8 | Custom table themes | UX | Low |
| 9 | AI difficulty selector in lobby | UX | Medium |
| 10 | Match history searchable list | UX | Low |
| 11 | Export game as shareable link | UX | Low |
| 12 | Spectator controls (follow specific player) | UX | Low |

### R8-Tarneeb — Variants + Social
| # | Fix | Category | Severity |
|---|-----|----------|----------|
| 1 | 400 Tarneeb variant (bid starts at 1) | Engine | Medium |
| 2 | Royal Tarneeb variant (J/9 special values) | Engine | Medium |
| 3 | Team chat integration | UX | Medium |
| 4 | Pre-set chat messages (nice play, well done) | UX | Low |
| 5 | Replay last trick peek | UX | Medium |
| 6 | Tournament mode | Engine | Medium |
| 7 | ELO rating system | Engine | Medium |
| 8 | Game replay viewer | UX | Medium |
| 9 | Player statistics dashboard | UX | Low |
| 10 | Custom card backs | UX | Low |
| 11 | Table themes | UX | Low |
| 12 | Voice chat integration | UX | Low |

---

## Round 9 — Testing & Stability

### R9-All Games — Comprehensive Testing
Each game gets 12 test-focused improvements:

**R9-Backgammon**: Unit tests for bot AI moves, edge case bearing off, doubling cube, gammon/backgammon detection, WebSocket reconnection, concurrent move prevention, timer accuracy, spectator view, mobile touch, accessibility screen reader, performance benchmarks, error recovery.

**R9-Baloot**: Unit tests for project detection, kaboot logic, choosing phase, must-overtake rule, bot card selection, WebSocket sync, round transition, timer behavior, mobile layout, accessibility audit, performance profiling, error handling.

**R9-Domino**: Unit tests for blocked game detection, team scoring, tile placement, bot strategy, WebSocket pending state, reconnection, timer accuracy, mobile drag, accessibility compliance, performance metrics, error analytics, security penetration.

**R9-Tarneeb**: Unit tests for bid validation, trick winner, finessing AI, overruff logic, WebSocket sync, reconnection, timer behavior, mobile swipe, accessibility audit, performance benchmarks, error handling, security review.

---

## Round 10 — Final Polish & Cross-Game Consistency

### R10-All Games — Unification
Each game gets 12 consistency improvements:

1. Unified game result card design (same component, game-specific data)
2. Unified error banner design
3. Unified timer component
4. Unified sound system (shared AudioManager)
5. Unified reconnection UX (same overlay)
6. Unified spectator mode UI
7. Unified game lobby design
8. Unified post-game stats screen
9. Unified move history format
10. Unified accessibility patterns (WCAG 2.1 AA)
11. Unified mobile gesture patterns
12. Cross-game play statistics dashboard

---

## Progress Tracking

| Round | Backgammon | Baloot | Domino | Tarneeb | Total Fixes |
|-------|-----------|--------|--------|---------|-------------|
| R1 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 48 |
| R2 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 96 |
| R3 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 144 |
| R4 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 192 |
| R5 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 240 |
| R6 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 288 |
| R7 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 336 |
| R8 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 384 |
| R9 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 432 |
| R10 | ⬜ 12 | ⬜ 12 | ⬜ 12 | ⬜ 12 | 480 |

---

## Target Ratings After 10 Rounds

| Game | Before | After R1 | After R5 | After R10 |
|------|--------|----------|----------|-----------|
| Backgammon | ⭐⭐½ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Baloot | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐⭐ |
| Domino | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐⭐ |
| Tarneeb | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐½ | ⭐⭐⭐⭐⭐ |

---

## Verification Protocol (Every Cycle)

```bash
# 1. TypeScript check
npx tsc --noEmit

# 2. Server boot
npx tsx server/index.ts

# 3. HTTP health check  
curl -s -o NUL -w "%{http_code}" http://localhost:3001/

# 4. Git commit
git add -A && git commit -m "game: R{round}-{game} — 12 fixes (summary)"

# 5. Git push
git push vixotest main
```

---

**Total**: 10 rounds × 4 games × 12 fixes = **480 fixes**  
**Target**: All 4 games at ⭐⭐⭐⭐⭐
