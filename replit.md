# VEX Platform

Full-stack TypeScript platform combining competitive games, social chat, multi-currency wallet, P2P marketplace, and an admin console. Runs on the web and as an Android app via Capacitor.

Repository: `git@github.com:duxexch/vexo.git`
Production domain: `https://vixo.click`
Production host: Hostinger VPS (Ubuntu 25.10), project path `/docker/vex`.

---

## Tech stack

- **Frontend:** React + Vite + Tailwind + shadcn/ui (in `client/`); i18n with RTL support; mobile-first.
- **Backend:** Node.js 20 + Express + WebSocket (`server/`); cluster entry in `server/cluster.ts` for sticky WS sessions.
- **Database:** PostgreSQL 15 via Drizzle ORM. Schema in `shared/schema.ts`. Migrations in `migrations/` and applied with `drizzle-kit push --force` at container startup.
- **Cache / pub-sub:** Redis 7.
- **Object storage:** MinIO (S3-compatible) for uploads.
- **Internal AI service:** `ai-service/` (separate Node.js + Express container on port 3100).
- **Mobile:** Capacitor (`capacitor.config.ts`, `twa/`).
- **Reverse proxy (production):** Traefik v3 with Let's Encrypt (`deploy/docker-compose.traefik.yml` + `deploy/traefik/dynamic.yml`).

## Project layout

```
client/                 # React + Vite SPA
server/                 # Express API, WebSocket, admin routes, game engines
ai-service/             # Internal AI helper microservice (separate container)
shared/                 # Types & Drizzle schema shared between client and server
migrations/             # Drizzle SQL migrations (auto-applied at startup)
scripts/                # Deploy core, smoke tests, seeding, entrypoint
deploy/                 # Traefik + voice (LiveKit/Coturn) compose files
docker/                 # Misc Docker config (nginx fallback)
docs/                   # Feature playbooks and audits
PROJECT_KNOWLEDGE_ENGINE/  # Authoritative knowledge base (READ FIRST)
scripts/vps-bootstrap.sh # ⭐ One-shot fresh-install (inspects VPS, installs Docker, generates all secrets idempotently, deploys for vixo.click)
prod-update.sh          # Standard production update wrapper (re-deploys after code changes)
prod-auto.sh            # First-run bootstrap wrapper
docker-compose.prod.yml # Production stack (db, redis, minio, ai-agent, app)
docker-compose.yml      # Local-only stack (no Traefik)
Dockerfile              # Multi-stage production image for the app
.env.example            # Authoritative list of required env vars
```

## Local development (Replit / workstation)

```bash
npm install
npm run dev          # http://localhost:3001
npm run check:types  # tsc --noEmit
```

The Replit workflow `Start application` runs `npm run dev` on port 3001.
A working `.env` file with at minimum `DATABASE_URL`, `SESSION_SECRET`, `JWT_SIGNING_KEY`, `ADMIN_JWT_SECRET`, `SECRETS_ENCRYPTION_KEY`, `SESSION_SECRET` (≥32 chars each in production) is required.

## Production deployment (Hostinger VPS)

Standard update command (used by the team):

```bash
cd /docker/vex && bash prod-update.sh \
  --auth-mode ssh \
  --repo-url git@github.com:duxexch/vexo.git \
  --repo-dir /docker/vex \
  --branch main
```

Full deployment runbook: `PROJECT_KNOWLEDGE_ENGINE/05_DOCKER_DEPLOYMENT_RUNBOOK.md`.

First-time VPS bootstrap (Traefik network + Traefik container) is documented in §3.1 of that runbook.

## Authoritative documentation

- `PROJECT_KNOWLEDGE_ENGINE/` is the single source of truth. Always read `00_PRIORITIES.md` and `05_DOCKER_DEPLOYMENT_RUNBOOK.md` before making infra or deployment changes.
- `docs/` contains feature-level playbooks and dated audits.
- Per `00_PRIORITIES.md`, financial integrity, DB safety, mobile-first UX, RTL/i18n correctness, SEO, and production reliability are non-negotiable priorities.

## Recent changes

- 2026-04-24 — **Pro-grade incoming-call experience (Task #38):**
  - New `client/src/lib/call-ringtone.ts` — Web Audio two-tone synthesised ringtone loop **plus** a high-priority Capacitor `LocalNotifications` channel (`vex_incoming_calls`, importance 5, vibration + lights, deterministic ID 919191, 4.5s repeat) so backgrounded mobile tabs still ring loudly. `startCallRingtone({ includeNativeNotification })` / `stopCallRingtone()` are idempotent — duplicate starts/stops are no-ops.
  - New `client/src/lib/call-permission-rationale.ts` — versioned `localStorage` flag (`vex_call_permission_rationale_v1`, voice/video kinds, video acknowledgement covers voice) and a cross-component request bus. `ensureCallRationale(kind, { force })` resolves to `"allow" | "dismiss"`; with no UI listener bound, falls through to native prompt to avoid headless deadlocks.
  - New shared modal `client/src/components/calls/CallPermissionPrompt.tsx` — mounted once inside `CallSessionProvider`. Explains the mic/camera ask in EN + AR, surfaces an "Open settings" CTA when re-shown after a denial, and is fully `data-testid`-tagged.
  - `client/src/components/chat/private-call-layer.tsx` (DM/billing manager) and `client/src/hooks/use-call-session.tsx` (challenge manager) — both now gate `getUserMedia` behind `ensureCallRationale`, drive `startCallRingtone` from their phase/status state machines, and re-show the rationale forced when the OS denies access. The DM layer pipes `rtcCall.incomingTitle / incomingBody` into the native ringer for backgrounded tabs.
  - **Cross-manager action bus** `client/src/lib/call-actions.ts` — small registry pattern (`registerCallActionHandler` + `dispatchCallAction`) that lets each call manager claim incoming accept/decline events by `callId`. Both `private-call-layer` and `use-call-session` register handlers; `CallSessionProvider` listens for the SW `NOTIFICATION_CLICK` message and routes through the bus, so tapping Decline on the OS notification actually emits `rtc:end` (challenge) or hits `/api/chat/calls/end` (DM) — not just silencing the ringer.
  - `client/src/components/calls/CallSessionProvider.tsx` — listens for the new SW `WAKE_RINGER` broadcast, drives the action bus on `NOTIFICATION_CLICK` (treats legacy `open_call` as accept for back-compat), and stops the ringtone the moment the user resolves the call from the OS UI.
  - `client/public/sw.js` — `private_call_invite` notifications now ship `accept` / `decline` actions (replacing legacy `open_call` / `dismiss`), `requireInteraction: true`, an aggressive call-vibration pattern, deterministic per-session tags, and broadcast `WAKE_RINGER` (carrying `callId` + `conversationId`) to every open client so the in-app continuous ringer fires immediately. `notificationclick` for `decline` wakes the SPA without pulling focus.
  - `server/websocket/notifications.ts` — incoming-call web-push payload coerces `priority: "urgent"` and `requireInteraction: true`, mirrors `callId` + `conversationId` at both the root and inside `data` (so the SW can dedupe and forward), and sends the new `accept` / `decline` action labels.
  - New `client/src/locales/en.ts` + `client/src/locales/ar.ts` keys: `rtcCall.incomingTitle / incomingBody` and the full `callPermission.*` set.
  - New `scripts/smoke-call-experience.ts` (`quality:smoke:call-experience`) — 8 checks: (1) push-payload shape contract (urgent/requireInteraction/accept+decline/mirrored ids/deterministic tag, no legacy actions), (2) live server source parity, (3) SW source contract (WAKE_RINGER + accept/decline + requireInteraction branch), (4) entry-point audit (only `chat.tsx`/PrivateCallLayer + `challenge-game.tsx`/useCall are allowed; both must wire ringtone + rationale + the provider must mount the prompt and listen for WAKE_RINGER), (5) provider-dispatches-actions guard (CallSessionProvider must call `dispatchCallAction` and both managers must register handlers), (6) **behavioural** call-action bus test (decline runs handler, accept runs handler, mismatched sessionId is not claimed, dispatch with no handlers returns false), (7) rationale storage + bus contract (versioned key, exports, forced re-prompt), (8) EN/AR locale parity.
  - **Out of scope, follow-ups noted:** true native CallKit (iOS) / ConnectionService (Android) plugins require generating the missing `android/` Capacitor project and writing native code; we approximate via the high-priority LocalNotifications channel today.

- 2026-04-24 — **Unified game visuals across every surface (Task #40):**
  - `client/src/lib/game-config.ts` — `buildGameConfig` keeps the **API as the source of truth for the LIST** (so `Object.entries(GAME_CONFIG)` in the multiplayer lobby never surfaces fallback-only keys like `snake`); falls back to `FALLBACK_GAME_CONFIG` only when the API is unavailable. New `resolveGameConfigEntry(apiConfig, key)` helper opts into the fallback layer **one key at a time** for spot lookups (history rows, notifications, end-of-game dialogs) without polluting list semantics. The function header documents the **single-source-of-truth rule**: every surface (cards, dialogs, popups, end-of-game screens, notifications) MUST source its icon, gradient, color and thumbnail from this config or from `<GameConfigIcon />`. Game-specific Lucide icons must NOT be hardcoded in UI files — admin uploads from the Visual Identity panel must propagate everywhere.
  - New shared component `client/src/components/GameCardBackground.tsx` — encapsulates the `thumbnailUrl + dark overlay` vs `gradient` background pattern used on lobby and catalog cards. Adopted by `client/src/pages/game-lobby.tsx` and `client/src/pages/games-catalog.tsx`.
  - `client/src/pages/game-history.tsx` — replaced manual `<img>` / direct icon rendering on the Active and Completed lists with `<GameConfigIcon />`, so admin icon changes apply to history rows too.
  - `client/src/pages/games-catalog.tsx` — old `GAME_CATALOG` hardcoded list collapsed into metadata-only `CATALOG_METADATA` (multiplayer entries reuse `multiplayerGameConfig`; browser mini-games keep an inline `fallback` only). Lobby/catalog/dialogs (multiplayer match-found, challenge create, lobby quick-match) all read visuals through `buildGameConfig` + `<GameConfigIcon />`.
  - `scripts/smoke-game-icon-purity.ts` (`quality:smoke:game-icon-purity`) — guardrail smoke that scans `client/src/pages` + `client/src/components` and fails if (a) any non-allowlisted file imports the strictly game-keyed Lucide icons `Bone` / `Dice5` / `Spade`, or (b) any UI literal pairs a multiplayer key (`chess`, `backgammon`, `domino`, `tarneeb`, `baloot`, `languageduel`) with a hardcoded `icon:` / `gradient:` / `color:` / `accentColor:` / `thumbnailUrl:` / `iconUrl:` value.
  - `scripts/smoke-game-config-resolution.ts` (`quality:smoke:game-config-resolution`) — 14 assertions covering `buildGameConfig` list semantics (no fallback-only key leaks into multiplayer iterations), `resolveGameConfigEntry` per-key fallback (API hit wins, fallback when missed, undefined when both miss), and the catalog regression contract (every multiplayer key in CATALOG_METADATA resolves from FALLBACK even when `/api/multiplayer-games?activeOnly=true` returns a partial subset).
  - Both wired into a new `quality:gate:game-visuals` aggregate (typecheck + both smokes) and prepended to `quality:gate:phase-e` so visual-identity regressions are caught in CI.
  - **Contributor rule (enforced by smoke):** any per-key access to a game config map MUST go through `resolveGameConfigEntry(config, key)` — never `config[key]` / `GAME_CONFIG[key]` / `multiplayerGameConfig[key]`. The purity smoke also requires every acceptance-critical surface (multiplayer, challenges, game-lobby, game-history, challenge-game, challenge-watch, player-profile, games-catalog, GameStartCinematic) to import `<GameConfigIcon />`; a regression there fails CI.

- 2026-04-24 — **Room (challenge / game-room) chat fan-out gated by smoke (Task #30):**
  - New shared helper `server/lib/room-chat-payload.ts` exposes `buildRoomChatBroadcast` (canonical `ChatBroadcast` payload assembly) + `shouldDeliverRoomChatToRecipient` (per-recipient suppression rule covering sender-block, recipient-block, recipient-mute, and self-echo).
  - `server/socketio/challenge-chat-bridge.ts` (`deliverRealtimeChallengeChat`) refactored to: (a) delegate broadcast assembly to `buildRoomChatBroadcast`, (b) delegate per-recipient suppression to `shouldDeliverRoomChatToRecipient`, (c) accept an optional `ChallengeChatDeps` injection seam so smokes can stub DB / Redis / Socket.IO.
  - New `scripts/smoke-room-notifications.ts` (6 checks: 4 suppression-rule cases incl. self-echo, 2 broadcast-assembly shapes, 5-socket bridge fan-out asserting only allowed peers receive AND every emit carries an identical canonical payload, plus solo-sender and empty-text edges).
  - Wired into `quality:smoke:room-notifications`, prepended to `quality:gate:phase-e`, added to `quality:gate:chat`, and runs in parallel inside `verify:fast` alongside the typecheck and DM smoke.

- 2026-04-24 — **Chat-notifications gated before each release:**
  - `quality:smoke:dm-notifications` (15 checks: helper-level suppression rules, HTTP↔realtime payload parity, preview rules, real-bridge integration via DI for allowed/blocked/`mutedUsers`/`notificationMutedUsers`, and HTTP runtime integration via `dispatchHttpDmNotification`) is now part of the existing release-readiness aggregate `quality:gate:phase-e` and runs first so any DM-notification regression surfaces in seconds.
  - `quality:gate:chat` aggregate now also runs `quality:smoke:room-notifications` for fast chat-only verification covering both DM and room paths.
  - The same smoke also runs in parallel inside `verify:fast` (Task #23 wiring), so local pre-commit verification catches regressions too.
  - Run before publishing: `npm run quality:gate:phase-e` (full release gate) or `npm run quality:gate:chat` (chat-only fast check).

- 2026-04-23 — **Admin · Games Management visual identity overhaul:**
  - New reusable admin components under `client/src/components/admin/games/`:
    - `GameAssetUploader.tsx` — drag-and-drop + file picker + URL paste, preview thumbnail, remove, recommended size hint, configurable aspect (square/wide/card). Posts to `/api/upload` via shared `adminFetch`.
    - `GameVisualPicker.tsx` — `GameIconPicker` (Lucide icon grid, used as fallback when no image is uploaded) and `GameColorPicker` (12 Tailwind color/gradient presets).
    - `GameCardPreview.tsx` — live lobby + compact tile preview that updates as the admin edits the form.
  - `client/src/lib/admin-fetch.ts` — shared admin fetch helper that injects `x-admin-token` from `localStorage.adminToken`.
  - `client/src/pages/admin/admin-unified-games.tsx` — `gameFormSchema` now includes `iconUrl/imageUrl/thumbnailUrl/iconName/colorClass/gradientClass`; new `VisualSection` rendered at the top of the Add/Edit dialog with the uploader trio + icon/color pickers + live preview. Both create/update mutations send the visual fields (multiplayer via spread; single-player explicitly mapped to `/api/admin/games/:id`). After save, `invalidateGameConfigCaches()` ensures every consumer (home, lobby, challenges, leaderboard, history, cinematic) re-renders with the new visuals — they already read from DB via `buildGameConfig`.

- 2026-04-23 — **Shared game systems uplift (Yalla-Ludo style unification, phase 1):**
  - **Unified `GameLayout` HUD**: new `hud` and `banner` slots in `client/src/components/games/GameLayout.tsx`, plus pill components in `client/src/components/games/GameHUD.tsx` (`GameHUDBalance`, `GameHUDTimer`, `GameHUDScore`). All 6 games will migrate to this shared shell instead of bespoke headers.
  - **Shared timer hook**: `client/src/hooks/use-game-timer.ts` — drift-resistant per-side clock with low-time audio cue and `onTimeout`.
  - **Skill-based matchmaking**: `server/lib/matchmaking-skill.ts` computes a soft skill rating from `users.gamesPlayed/gamesWon/longestWinStreak/vipLevel`, partitions waiters into rookie/regular/elite tiers, expands tolerance with wait time, and auto-expires queue entries after 60s. Wired into `server/routes/matchmaking/queue.ts` (random queue).
  - **Leaderboard period & region filters**: `/api/leaderboard` now accepts `period=day|week|month|all` and `region=<country>`. Period-scoped path aggregates wins from `game_matches.completed_at`. `client/src/pages/leaderboard.tsx` exposes period as a Select (All time / Today / This week / This month).
  - **Chat pricing model — friends-free / stranger unlock**: new `server/lib/chat-pricing.ts`. The DM endpoint `POST /api/chat/:userId/messages` now returns **HTTP 402** with `code:"chat_unlock_required"` on first contact with a non-friend; the client confirms by re-posting with `confirmUnlock:true`, which atomically charges the configured one-time fee from the sender's project-currency wallet (defaults: enabled, 1.00 VXC; tunable via `chat_settings` keys `chat_stranger_unlock_enabled`, `chat_stranger_unlock_fee_vxc`, `chat_friends_always_free`). Friends (mutual follow) and any conversation with prior history are always free. New UI `client/src/components/chat/ChatUnlockDialog.tsx`.

- 2026-04-23 — Production deployment hardened:
  - `deploy/docker-compose.traefik.yml` rewritten to enable the Docker provider, set `exposedByDefault=false`, mount the Docker socket read-only, add `restart: unless-stopped`, healthcheck, and structured logging.
  - Added `ACME_EMAIL` to `.env.example` (required by Traefik / Let's Encrypt).
  - Removed the redundant host port binding on the `app` service in `docker-compose.prod.yml` (kept commented for debug).
  - Rewrote `PROJECT_KNOWLEDGE_ENGINE/05_DOCKER_DEPLOYMENT_RUNBOOK.md` to reflect the actual Docker Compose + Traefik flow on Hostinger VPS (previously incorrectly stated Kubernetes was the primary runtime).
