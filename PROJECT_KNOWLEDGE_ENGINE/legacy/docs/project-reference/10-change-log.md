# 10 - Change Log

## 2026-03-28 - Baseline knowledge base created

Scope:

- Created `docs/project-reference/` as a persistent technical reference set.
- Added architecture, runtime, API, DB, realtime, frontend, security, and ops maps.
- Added maintenance protocol for continuous updates.

Reason:

- Reduce search time for future fixes and enhancements.
- Keep a stable memory of project structure and ownership boundaries.

## 2026-03-28 - Auth session behavior adjusted for local development

Behavior change:

- Session fingerprint mismatch enforcement is strict in production.
- Local development avoids false invalid-session failures from user-agent changes.

Primary code area:

- `server/routes/middleware.ts`

Operational impact:

- Local testing with device emulation and host switching is more stable.
- Production session hardening behavior remains active.

## 2026-03-28 - Local database cleanup operation executed

Operation summary:

- Backup created before destructive cleanup.
- Removed non-bot user records and related user-generated datasets in local DB.
- Preserved core game catalogs.
- Removed explicit test/demo game records.

Backup artifact:

- `backups/vex_db_pre_cleanup_20260328-061217.sql`

Post-check summary (local DB at execution time):

- users count: 0
- challenges count: 0
- challenge sessions count: 0
- p2p trades count: 0
- games count: 8
- multiplayer games count: 5

## 2026-03-28 - Challenge start flow compatibility fix and map update

Files changed:

- `server/routes/challenges/join.ts`
- `docs/project-reference/01-runtime-flow.md`
- `docs/project-reference/02-backend-api-map.md`
- `docs/project-reference/05-realtime-and-game-engines.md`

Behavior impact:

- On final challenge join, server now initializes playable challenge session state at start time.
- Session creation now covers both session models used by challenge pages and realtime flows.
- Challenge lifecycle and spectator endpoint ownership are now explicitly documented in project reference maps.

Risks:

- Added startup-time session generation logic depends on game engine initialization; malformed game setup can surface immediately instead of later on first move.

Verification done:

- Static type-check and startup checks should be run after this change.

## 2026-03-28 - Adaptive AI single-player + behavior learning/reporting

Files changed:

- `server/lib/adaptive-ai.ts`
- `server/game-websocket/ai-turns.ts`
- `server/game-websocket/moves.ts`
- `server/game-websocket/auth-join.ts`
- `server/routes/matchmaking/matches.ts`

Behavior impact:

- Added adaptive AI decision layer with difficulty levels (`easy`/`medium`/`hard`/`expert`) and auto difficulty inference from player account performance.
- Added AI turn processing in `/ws/game` runtime so bot turns are executed with human-like think delays.
- Added single-player test session creation in dev route to start human-vs-AI sessions across supported games.
- Added persistent behavior learning files (player move profiles + AI model buckets) and downloadable JSON/CSV behavior reports.

Risks:

- File-based learning/report storage can grow over time and should be monitored/rotated in production.
- Adaptive tuning is heuristic and should be validated with gameplay telemetry before competitive rollout.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime health endpoints responded (`/` and `/api/health` => 200).

## 2026-03-28 - Adaptive AI runtime bugfixes after end-to-end validation

Files changed:

- `server/lib/adaptive-ai.ts`
- `server/game-websocket/moves.ts`

Behavior impact:

- Fixed adaptive bot provisioning across multiple games by making bot nicknames globally unique (avoids `users_nickname_unique` collisions when creating single-player sessions for different game types).
- Fixed next-turn resolution in realtime move pipeline by resolving actual next player from engine state, so adaptive AI turn triggering works for color-based engines (e.g., chess and backgammon) as well as ID-based engines.

Risks:

- Existing bot users created before this fix keep their old nicknames; no migration is required for runtime correctness, but naming consistency differs between old/new bot records.

Verification done:

- TypeScript compile check passed (`TS_EXIT=0`).
- Fresh runtime instance on port `3011` started successfully.
- End-to-end websocket check confirmed AI auto-turn after human move (`turnNumber` progressed from 1 to 2).
- Report endpoints returned expected JSON/CSV with tracked behavior data after a real move.

## 2026-03-28 - Player/Spectator permission hardening and game UX role alignment

Files changed:

- `server/game-websocket/state-resign.ts`
- `server/websocket/challenge-games/join-leave.ts`
- `server/websocket/challenge-games/moves.ts`
- `server/websocket/challenge-games/resign-draw.ts`
- `client/src/hooks/useGameWebSocket.ts`
- `client/src/pages/challenge-game.tsx`
- `client/src/pages/games/ChessGame.tsx`
- `client/src/components/games/chess/ChessControls.tsx`
- `client/src/pages/games/DominoGame.tsx`
- `client/src/pages/games/BackgammonGame.tsx`
- `client/src/pages/games/TarneebGame.tsx`
- `client/src/pages/games/BalootGame.tsx`

Behavior impact:

- Enforced explicit spectator blocks on resign and draw actions in `/ws/game` and challenge-game websocket flows.
- Fixed challenge-game role assignment for 4-player games (`player3Id` / `player4Id`) so seated players are no longer treated as spectators.
- Added unified frontend guardrails so spectator clients cannot send player-only actions (move/resign/draw/turn actions).
- Added role-aware UX badges and end-of-match messaging to clearly distinguish player mode vs spectator mode across game pages.

Risks:

- Challenge-game payout paths still use winner/loser signatures oriented to 2-player settlement and should be reviewed separately for full 4-player team financial semantics.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011` (default `3001` already occupied by an existing local process).
- HTTP route smoke check succeeded (`/` returned `200` on both `3011` and existing `3001`).

## 2026-03-28 - WebSocket payload hardening and quality-gate baseline

Files changed:

- `server/websocket/challenge-games/validation.ts`
- `server/websocket/challenge-games/index.ts`
- `server/game-websocket/validation.ts`
- `server/game-websocket/index.ts`
- `scripts/audit-i18n.mjs`
- `package.json`

Behavior impact:

- Added strict schema validation for challenge websocket messages before dispatching handlers.
- Added strict schema validation for `/ws/game` message envelope and payloads before processing game actions.
- Added backward-compatible `send_gift` alias support in challenge websocket dispatcher to prevent client mismatch regressions.
- Added project-level quality scripts (`check:types`, `i18n:audit`, `quality:gate`) to standardize verification flow.

Risks:

- Strict validation now rejects malformed websocket payloads earlier; legacy clients sending invalid shapes will receive explicit errors instead of being silently ignored.
- i18n audit currently reports drift across many locales in non-strict mode; switching to strict mode will fail CI until locale drift is resolved.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Quality gate script executed successfully (`npm run quality:gate`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - General /ws envelope validation and unknown-type blocking

Files changed:

- `server/websocket/validation.ts`
- `server/websocket/index.ts`

Behavior impact:

- Added base envelope validation for `/ws` messages (object-only payload, normalized non-empty `type`, type-length guard).
- Added explicit `ws_error` responses for malformed JSON envelopes and malformed `type` fields.
- Added explicit unknown-type blocking in `/ws` dispatcher to avoid routing unrelated messages into challenge handlers.

Risks:

- Clients that previously relied on silent ignore for malformed/unknown `/ws` messages now receive explicit protocol errors.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - /ws protocol error envelope alignment (compat-safe)

Files changed:

- `server/websocket/validation.ts`
- `server/websocket/index.ts`

Behavior impact:

- Converted `/ws` validation failures to structured protocol errors with explicit codes (`invalid_envelope`, `invalid_type`, `unknown_type`, `invalid_format`).
- Standardized `/ws` error responses to include `payload.message` and `payload.code` while preserving backward-compatible top-level `error` and `code` fields.
- Kept unknown-type blocking and malformed-envelope rejection behavior introduced in the previous hardening step.

Risks:

- Clients parsing only legacy top-level error fields remain supported; clients can now migrate to `payload.message`/`payload.code` without server-side changes.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - /ws/game protocol error envelope alignment (compat-safe)

Files changed:

- `server/game-websocket/validation.ts`
- `server/game-websocket/index.ts`
- `server/game-websocket/utils.ts`

Behavior impact:

- Added structured protocol error model for `/ws/game` validation failures with explicit codes.
- Updated `/ws/game` dispatch error handling to emit coded errors for malformed payload (`invalid_payload`), malformed JSON (`invalid_format`), and unknown type (`unknown_type`).
- Standardized game websocket error responses to include `payload.message` and `payload.code` while preserving top-level `error` and `code` for backward compatibility.

Risks:

- Clients consuming only legacy top-level error fields remain supported; clients can migrate safely to payload-based error parsing.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Challenge watch websocket error handling hardening

Files changed:

- `client/src/pages/challenge-watch.tsx`

Behavior impact:

- Added explicit handling for protocol and gameplay websocket errors on challenge watch page (`ws_error`, `error`, `challenge_error`, `move_error`).
- Added robust extraction of error text from both modern payload shape (`payload.message`) and legacy top-level fields (`error`).
- Added safe JSON parse guard in challenge watch websocket listener to prevent runtime crashes from malformed messages.

Risks:

- Watch page now surfaces server websocket errors to user more consistently; noisy back-end errors may produce more visible toasts during unstable network periods.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Challenge watch websocket error toast dedupe

Files changed:

- `client/src/pages/challenge-watch.tsx`

Behavior impact:

- Added websocket error toast deduplication/throttling for challenge watch page to suppress repeated identical errors in short intervals.
- Reused normalized error signatures (`code:message`) to avoid noisy repeated destructive toasts during unstable network or repeated backend error broadcasts.
- Applied the same toast path for malformed message parsing errors using a stable error code.

Risks:

- Repeated identical errors within the dedupe window are intentionally suppressed; users may see fewer repeated alerts during persistent failures.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Frontend websocket error helper unification

Files changed:

- `client/src/lib/ws-errors.ts`
- `client/src/pages/challenge-watch.tsx`
- `client/src/hooks/useGameWebSocket.ts`

Behavior impact:

- Added a shared websocket error utility that normalizes error extraction (`message` + `code`) across modern and legacy envelope shapes.
- Replaced duplicated challenge-watch error parsing with shared helper usage.
- Updated `useGameWebSocket` to route all websocket error-like message types (`ws_error`, `error`, `challenge_error`, `move_error`, `move_rejected`) through a single handling path.
- Preserved fatal close behavior for auth/session errors (`SESSION_NOT_FOUND`, `NOT_AUTHORIZED`) while keeping non-fatal issues in `moveError` state.

Risks:

- Any component relying on per-type ad-hoc websocket error parsing now gets normalized messages; if a backend sends non-string error payloads, they are intentionally ignored.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Websocket error helper rollout to chat/notifications hooks

Files changed:

- `client/src/hooks/use-chat.tsx`
- `client/src/hooks/use-notifications.tsx`

Behavior impact:

- Extended shared websocket error parsing to chat and notifications hooks using `extractWsErrorInfo`/`isWsErrorType`.
- Added early protocol/game error interception in both hooks to prevent ad-hoc message parsing and keep runtime behavior aligned with the unified websocket error contract.
- Notifications hook now surfaces websocket protocol/game errors to users through destructive toasts with localized title.

Risks:

- Error toasts may be more visible in notifications flows during unstable websocket periods; behavior is intentional for transparency.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Notifications websocket error toast dedupe/throttle

Files changed:

- `client/src/hooks/use-notifications.tsx`

Behavior impact:

- Added websocket error toast deduplication/throttling in notifications hook to suppress identical destructive toasts in short bursts.
- Dedupe signature now combines websocket error type, normalized code, and message so distinct errors still surface.
- Preserved existing localized error title and destructive variant behavior.

Risks:

- Repeated identical websocket errors inside the dedupe window are intentionally hidden to reduce toast noise.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-28 - Challenge game websocket error handling hardening

Files changed:

- `client/src/pages/challenge-game.tsx`

Behavior impact:

- Added shared websocket protocol/game error parsing via `extractWsErrorInfo` and `isWsErrorType` in challenge-game message flow.
- Added websocket error toast dedupe/throttle to suppress repeated identical destructive toasts in short intervals.
- Added safe JSON parse guard in challenge-game websocket `onmessage` to prevent runtime crash path on malformed server frames.

Risks:

- Repeated identical websocket errors during the dedupe window are intentionally suppressed.

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`).
- Runtime boot succeeded on verification port `3011`.
- HTTP route smoke checks returned `200` on `3011` and `3001`.

## 2026-03-29 - Phase 0 auth security hardening (2FA, sessions, OAuth, unified verification)

Files changed:

- `server/lib/auth-verification.ts`
- `server/lib/safe-user.ts`
- `server/routes/middleware.ts`
- `server/routes/auth/two-factor-auth.ts`
- `server/routes/auth/session.ts`
- `server/routes/social-auth/oauth-flow.ts`
- `server/admin-routes/helpers.ts`
- `server/admin-routes/admin-login.ts`
- `server/websocket/auth.ts`
- `server/game-websocket/auth-join.ts`
- `server/index.ts`
- `client/src/pages/admin/admin-login.tsx`
- `client/src/pages/auth-callback.tsx`

Behavior impact:

- User/admin token verification is now centralized and reused across HTTP middleware, websocket auth, and upload auth paths.
- User 2FA verification now requires challenge token only (legacy body `userId` fallback removed).
- Admin 2FA verification now requires one-time admin challenge token (body `userId` trust removed).
- Session lifecycle now aligns with token fingerprint model (logout/refresh/logout-all invalidation + activity update).
- Social OAuth callback no longer leaks JWT in URL query; callback now uses one-time exchange code.
- Safe user serialization is standardized via reusable helper instead of ad-hoc sensitive-field stripping.

Risks:

- In-memory one-time challenge/exchange stores are process-local and reset on restart (acceptable for short-lived auth flow but should be reviewed for multi-instance scale).

Verification done:

- TypeScript compile check passed (`npx tsc --noEmit`, `EXIT:0`).
- Runtime startup validated on alternate port `3021` (default/previous verification ports were already occupied by existing local processes).
- Health route returned `200`.
- Negative-path auth checks matched hardened contracts:
  - `POST /api/auth/social/exchange` with missing code => `{"error":"Exchange code is required"}`
  - `POST /api/auth/2fa/verify` with legacy `{userId, code}` => `{"error":"Challenge token is required"}`
  - `POST /api/admin/verify-2fa` with empty body => `{"error":"Code and challenge token are required"}`

## 2026-03-29 - Critical production security closure (deps, CSP, audit visibility)

Files changed:

- `package.json`
- `package-lock.json`
- `client/index.html`
- `server/index.ts`
- `server/routes/auth/two-factor-auth.ts`
- `server/admin-routes/admin-login.ts`
- `scripts/security-smoke.mjs`

Behavior impact:

- Cleared known dependency vulnerabilities by updating lockfile-resolved package graph (`npm audit fix`) and adding explicit security scripts (`security:audit`, `security:smoke`, `security:check`).
- Hardened production CSP by removing script `'unsafe-inline'` and switching to hash-based inline script allowlist computed from app HTML, plus stricter directives (`script-src-attr 'none'`, `object-src 'none'`, mixed-content protections).
- Removed remaining inline JS usage in frontend HTML that could conflict with strict script CSP.
- Expanded auth failure observability with explicit audit/warn coverage for failed user/admin 2FA and admin password lockout-related paths.
- Added automated security smoke checks covering hardened negative paths for OAuth exchange and challenge-token-gated 2FA endpoints.

Risks:

- CSP hash strategy depends on actual inline script content in deployed HTML; future inline script edits must remain synchronized with hash computation behavior.

Verification done:

- `npm audit --audit-level=high` => `found 0 vulnerabilities`.
- `npx tsc --noEmit` => passed (`EXIT:0`).
- `node scripts/security-smoke.mjs` => all checks passed.
- Runtime startup validated on alternate port `3022`, then verification process stopped.

## 2026-03-29 - Production CSP validation + mandatory CI security gate

Files changed:

- `scripts/validate-csp-prod.mjs`
- `package.json`
- `.github/workflows/security-gate.yml`

Behavior impact:

- Added a runtime production CSP validator that checks:
  - CSP header existence on runtime response.
  - `script-src` strictness (no `'unsafe-inline'`, includes `'self'`).
  - strict directives (`script-src-attr 'none'`, `object-src 'none'`).
  - inline script hash coverage against runtime CSP values.
- Added npm script `security:csp` for repeatable CSP runtime checks.
- Added npm script `security:gate` for CI-oriented baseline gate (`typecheck + audit`).
- Introduced mandatory GitHub Actions workflow `Security Gate` on PRs/pushes to `main` that runs:
  - `check:types`
  - `security:audit`
  - production build/start
  - `security:smoke`
  - `security:csp`

Risks:

- CI production runtime checks depend on local startup prerequisites (PostgreSQL service/env) and can fail fast if runtime bootstrap assumptions change.

Verification done:

- `npm run check:types` => passed.
- `npm run build` => passed.
- Production runtime started on port `3024` and served `/` with `200`.
- `SECURITY_BASE_URL=http://localhost:3024 npm run security:smoke` => all checks passed.
- `CSP_BASE_URL=http://localhost:3024 npm run security:csp` => runtime CSP/header/hash checks passed.
- Verification server process was stopped after checks.

## Template for next entries

Use this block format for every future update:

- Date:
- Change title:
- Files changed:
- Behavior impact:
- Risks:
- Verification done:
