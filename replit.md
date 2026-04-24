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

- 2026-04-24 — **DM scroll-anchor on "load older" pagination (Task #27):**
  - `client/src/pages/chat.tsx` — added a `prependAnchorRef` + `justRestoredAnchorRef` pair and a new `useLayoutEffect` that runs *before* paint to pin the viewport whenever an older page lands. `handleScroll` snapshots `{ scrollHeight, scrollTop }` the moment we trigger `loadMoreMessages()`; the layout effect computes `scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop` once React commits the prepended messages, so the message the user was reading stays at the same on-screen position with no flash. The existing auto-scroll-to-bottom effect now early-returns when the anchor was just restored, so it can't yank the viewport back to the latest message. Anchor is also cleared on `activeConversation` change to avoid wrong-direction jumps after a thread switch. Direction-agnostic (works for RTL + LTR), input-agnostic (mouse-wheel + touch).
  - No hook signature change in `client/src/hooks/use-chat.tsx` — we infer "page loaded" from the `messages` reference change while the anchor is set, which is sufficient and avoids a new event channel.

- 2026-04-24 — **In-game chat viewer-count pill (Task #26):**
  - `shared/socketio-events.ts` — new `chat:viewer_count` server→client event with `{ roomId, count }` payload, broadcast on every spectator join/leave/disconnect for the chat namespace.
  - `server/socketio/challenge-chat-bridge.ts` — exported `broadcastChallengeViewerCount(chatNs, roomId)` that counts sockets whose `socket.data.spectatorRoomIds` array includes the room (Redis-adapter-safe presence mirror) and emits the count to that room. Also keeps the array up-to-date on chat:join/leave.
  - `server/socketio/index.ts` — wires the broadcaster into `chat:join` (after spectator role grant), `chat:leave` (after role revoke), and a new `disconnecting` handler that snapshots `spectatorRoomIds` then schedules `setImmediate` broadcasts so room membership has time to settle.
  - `client/src/hooks/use-socket-chat.tsx` — subscribes to `chat:viewer_count`, exposes `viewerCount` in the return type, resets to 0 on roomId change so a stale value never leaks across rooms.
  - `client/src/components/games/GameChat.tsx` — accepts optional `spectatorCount` prop. When > 0 the header renders a small amber `Eye + N watching/N يشاهد` pill next to the existing message-count pill, with a tooltip and `data-testid="game-chat-viewer-count"`.
  - `client/src/pages/challenge-game.tsx` — the chat dialog passes `spectatorCount={Math.max(realtimeChat.viewerCount, gameSession?.spectatorCount ?? 0)}` (Socket.IO authoritative, legacy WS as fallback) and renders a matching `data-testid="game-chat-dialog-viewer-count"` Badge in the DialogTitle so the count is visible whether or not the dialog body has scrolled.

- 2026-04-24 — **Tournament refund visibility (Task #58):**
  - `server/routes/tournaments/listing.ts` — new `loadUserRefundsByTournament(userId, tournamentIds)` helper that scans both refund ledgers in a single pass per currency: `transactions` (USD, `type='refund'`, no `referenceType` column → match by `referenceId LIKE 'tournament-(cancel|delete)-refund:<tid>:<uid>'`) and `projectCurrencyLedger` (VXC, `referenceType IN ('tournament_cancel_refund','tournament_delete_refund')`). Both `GET /api/tournaments` and `GET /api/tournaments/:id` now decorate each tournament with `userRefund: { amount, currency, reason } | null` for the authenticated player. Reason is derived from the referenceId (`cancel` → `'cancelled'`, `delete` → `'deleted'`) so the UI can choose copy without re-querying status.
  - `client/src/pages/tournaments.tsx` — added shared `UserRefundInfo` type + `userRefund` field on both `TournamentListItem` and `TournamentDetail`; new `TournamentRefundBanner` component renders an emerald-toned strip with the refunded amount via `formatTournamentAmountText` (so VXC tournaments read "VXC X.XX" and USD reads "$X.XX") and full EN/AR copy distinguishing cancellation vs deletion. Banner is mounted in the list cards (under the existing badges/date row) and at the top of the detail view (above the stats grid). Wallet history page already shows the refund row; this gives players the explanation in-context on the tournament itself.
  - `scripts/smoke-tournament-currency-e2e.mjs` (`quality:smoke:tournament-currency`) — extended to 47 checks: after both the USD-cancel and VXC-cancel refund flows, the test now logs in as the affected player, hits `GET /api/tournaments/:id` and `GET /api/tournaments?status=cancelled`, and asserts `userRefund.amount === ENTRY_FEE`, `userRefund.currency` matches the tournament currency, and `userRefund.reason === 'cancelled'`. Deleted tournaments are gone from the DB so listing endpoints can't expose `userRefund` for them — that path is intentionally covered by the wallet history surface.

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

- 2026-04-24 — **Real recorded-style ringtone replaces synth tones (Task #46):**
  - Generated a 2.4s musical chime WAV (G5+B5 → E5+G5, sine + 2nd/3rd harmonics, ADSR envelope, normalized to 0.95 peak, zero-crossing seam for click-free `loop = true`) at `client/public/sounds/notification.wav` (~207KB). Asset is fully synthesised in-repo via `scripts/generate-ringtone.ts` so it is owned/royalty-free.
  - `client/src/lib/call-ringtone.ts`: `startWebRingtone` now prefers an `<audio>` element backed by `/sounds/notification.wav` (looped) and only falls back to the existing Web-Audio synth pattern when the audio element fails to construct or `play()` is rejected (autoplay block / load error). The synth oscillator path remains as the resilient fallback. iOS hardware mute switch now silences the ringer naturally (HTMLAudioElement default category) — matches WhatsApp.
  - Capacitor LocalNotifications channel and `capacitor.config.ts` already point to `notification.wav`, so backgrounded mobile rings now have a real bundled asset to play instead of the OS default tone (effective once the android/iOS native projects are generated; mirroring into `android/app/src/main/res/raw/` is tracked as a follow-up alongside Task #45).
  - New `scripts/smoke-ringtone-asset.ts` (`quality:smoke:ringtone-asset`) — 7 checks: WAV presence, RIFF/WAVE/fmt/data structure, ≥50KB real-data size, asset path wired in `call-ringtone.ts`, synth fallback still defined, `ensureNativeChannel` still references `notification.wav`, and `capacitor.config.ts` still declares it under LocalNotifications. Left out of `quality:gate:phase-e` for now (matches the team pattern of opt-in `quality:smoke:call-experience`).

- 2026-04-24 — **Native lock-screen call UI via custom Capacitor plugin (Task #45):**
  - New local Capacitor plugin under `native-plugins/capacitor-native-call-ui/` (vendored — no npm publish). Wraps **CallKit** (`CXProvider`/`CXCallController` in `ios/Sources/.../CallKitProvider.swift`) on iOS and a self-managed **ConnectionService** (`android/.../VexConnectionService.kt` + `VexConnection.kt`, `PhoneAccount` with `CAPABILITY_SELF_MANAGED`) on Android. Manifest declares `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_PHONE_CALL`. Pre-built `dist/` (esm + cjs) + TS sources shipped so install doesn't require a TS build.
  - JS wrapper `client/src/lib/native-call-ui.ts` exposes `presentIncomingCall`, `reportOutgoingCall`, `updateNativeCallState`, `endNativeCall`, `isNativeCallUIAvailable[Sync]`, `subscribeNativeMuteEvents`. Plugin emits `callAnswered` / `callEnded` / `callMutedChanged` and the wrapper bridges them into the existing `dispatchCallAction` registry (answered → accept, ended → decline-then-hangup fallback). `CallAction` extended with `"hangup"`.
  - Lifecycle hooks added in `client/src/hooks/use-call-session.tsx` and `client/src/components/chat/private-call-layer.tsx`: ringing-in → `presentIncomingCall`, ringing-out → `reportOutgoingCall`, connecting/connected → `updateNativeCallState`, ended/failed/idle/remote-ended → `endNativeCall`. Both action handlers now also claim `"hangup"` for active calls.
  - `client/src/lib/call-ringtone.ts` skips its `LocalNotifications` ringer when `isNativeCallUIAvailable()` resolves true so CallKit/ConnectionService is the sole ringer (no double-ring).
  - `capacitor.config.ts` registers a `NativeCallUI` plugin block (`providerName: 'VEX'`, `supportsVideo: true`, `includesCallsInRecents: true`, `ringtoneSound: 'notification.wav'`). `package.json` adds `"capacitor-native-call-ui": "file:./native-plugins/capacitor-native-call-ui"`.
  - **Required after `npm install` (real-device only — container can't host iOS/Android SDKs):** run `npx cap add android` and `npx cap add ios`, then on iOS add a **PushKit/VoIP** push certificate and wire `PKPushRegistry` in `AppDelegate.swift` to call `CallKitProvider.shared.reportIncomingCall(...)` so the system surfaces the call from background. On Android no extra push wiring is needed beyond the existing FCM data-message handler dispatching `dispatchCallAction({action:"accept"|"decline"|"hangup"})`. Android Telecom requires the user to grant the runtime "phone account" permission on first call.
  - Why it's not e2e tested: Telecom + CallKit are device-only OS surfaces — no emulator path covers the lock-screen experience. Type-check (`npm run check:types`) passes; the pure-JS wrapper falls back to a no-op on web so the rest of the app is unaffected.

- 2026-04-24 — **VoIP push wakes for closed/backgrounded devices (Task #54):**
  - New `device_push_tokens` table (`shared/schema.ts`): `(userId, platform ios|android, kind voip|apns|fcm, token, bundleId, appVersion, isActive, lastUsedAt)` with a unique `(token, kind)` index. Synced via `npm run db:push --force`.
  - New `server/lib/voip-push.ts` — pure Node 20 (`node:http2` + `node:crypto` + global `fetch`) APNs HTTP/2 + FCM HTTP v1 client. APNs uses ES256 JWT auth (`alg=ES256`, `kid`/`iss`, `dsaEncoding: "ieee-p1363"` because Apple rejects DER) cached for 50 min, sent with `apns-topic=<bundle>.voip`, `apns-push-type=voip`, `apns-priority=10`, `apns-expiration=0`. FCM uses RS256 service-account OAuth → bearer for v1 sends, message body is **data-only** with `android.priority=HIGH` and `ttl=60s` so the killed-app FirebaseMessagingService still runs. APNs 410 `Unregistered` and FCM 404 `UNREGISTERED` auto-deactivate the dead token; transient 5xx are retried once. When env vars are missing the module logs once and returns `{ sent: 0 }` so the rest of the call experience is unaffected.
  - New `server/storage/notifications.ts` helpers: `registerDevicePushToken` (upsert on `(token, kind)`, owner re-bind allowed), `getActiveDevicePushTokens(userId)`, **`deactivateDevicePushTokenForUser(userId, token, kind)`** (user-scoped — used by the logout route), `deactivateDevicePushToken(token, kind)` (global — reserved for gateway-driven dead-token paths only; doc-commented), `touchDevicePushToken`. The user-scoped split prevents an account-switch race where a delayed logout from User A on a shared device could otherwise disable the same physical token after User B has just registered it.
  - New `server/routes/devices/voip-tokens.ts` — `POST /api/devices/voip-token` (auth-gated, zod-validated) + `DELETE /api/devices/voip-token` (uses the **user-scoped** helper) for sign-out. Wired in `server/routes/index.ts`.
  - `server/routes/chat-features/calls.ts` invite path now publishes a VoIP push (`sendCallVoipPush`) immediately after the existing socket invite + `notifyUsers` alert, so the lock-screen ringer fires even when the receiver's app is killed.
  - **Native plugin sources added at the paths Package.swift / package.json declare** (previous task only listed them):
    - iOS: `ios/Sources/NativeCallUIPlugin/{NativeCallUIPlugin,CallKitProvider,PushKitDelegate}.swift`. `CallKitProvider.shared` now exposes `reportIncomingCall(callId:handle:isVideo:conversationId:completion:)` and `PushKitDelegate.shared.bootstrap()` registers a `PKPushRegistry` whose `didReceiveIncomingPushWith` dispatches straight into the provider so the call rings before iOS even hands the app a runloop.
    - Android: `android/src/main/java/click/vixo/nativecallui/{NativeCallUIPlugin,IncomingCallForegroundService,CallConnectionService,CallFcmService}.kt` + `android/build.gradle` (firebase-messaging dep). `CallFcmService` filters on `data.type == "call"` and `startForegroundService(IncomingCallForegroundService)`; the foreground service calls `startForeground` in `onCreate` to satisfy Android 12+ background-start limits within Telecom's 5-second budget.
  - New `examples/AndroidManifest-snippet.xml` and `examples/AppDelegate-snippet.swift` document the host-app wiring (capabilities, manifest entries, PushKit token upload to `/api/devices/voip-token`).
  - New `scripts/smoke-voip-push.ts` (`quality:smoke:voip-push`) — 20 checks: APNs payload shape (`content-available:1`, no `alert`/`sound`, `type:"call"` + ids), FCM message shape (data-only, `android.priority=HIGH`, 60s TTL), APNs JWT round-trip (header alg/kid/typ, payload iss/iat, **64-byte raw r||s signature actually verifies via `createVerify`**), JWT cache reuse, stable hash, calls.ts wiring, route registration, schema presence, plugin source files exist at the package-declared paths, manifest snippet declares Telecom + FCM + `MANAGE_OWN_CALLS`, AppDelegate snippet bootstraps PushKit, voip-push.ts uses the right APNs headers and deactivates dead tokens, podspec links CallKit + PushKit. 20/20 PASS. Left out of `quality:gate:phase-e` (matches the team's opt-in smoke pattern).
  - **Out of scope (ops-side):** generating the Apple `.p8` key + Firebase service-account JSON, populating the env vars on the production VPS, and editing the host app's real `AppDelegate.swift` / `AndroidManifest.xml` (requires `npx cap add ios|android` on a real device — container can't host the SDKs). The README in `native-plugins/capacitor-native-call-ui` documents every step.

- 2026-04-24 — **Domino layout snapshots gated by release check (Task #60):**
  - `quality:smoke:domino-layout-snapshots` (existing script, deterministic visual-regression coverage of board layouts across multiple scenarios incl. an absurd-mobile-stress fallback) is now part of `quality:gate:phase-e`. Slotted between `quality:smoke:domino-playthrough-bounds` and `quality:smoke:domino-tile-orientation` so the snapshot family runs together.
  - **Pre-existing crashes unblocked while validating end-to-end:** `scripts/smoke-challenge-gameplay-regression.ts` and `scripts/smoke-domino-load-latency.ts` both call `createErrorHelpers("SmokeError" | "PerfError")` — that factory only sets the error *name* string, it does not export a class. Both files then construct `new SmokeError(...)` / `new PerfError(...)` in their websocket error paths, crashing on `ReferenceError` the first time the WS path errored. Fixed by importing `SmokeScriptError` from `scripts/lib/smoke-helpers.ts` and defining a tiny **local subclass** in each script (`class SmokeError extends SmokeScriptError { constructor(message, details?) { super("SmokeError", message, details); } }` and the analogous `PerfError`). The subclass approach (vs. a bare `as` rename) preserves `SmokeScriptError`'s real `(errorName, message, details?)` constructor shape so existing call sites that already pass `(message, details)` still produce correctly-shaped errors with `name === "SmokeError"` / `"PerfError"` and the message in the right slot. Without these fixes, the gate could never reach the newly-wired layout step. After both fixes, the full chain progresses cleanly through every step up to `quality:perf:domino`, which surfaces a real load-test threshold failure (no longer a `ReferenceError`) — captured as a follow-up. Three other scripts (`smoke-challenge-reconnect-sla.ts`, `smoke-sam9-solo-e2e.ts`, `smoke-domino-challenge-adapter-contract.ts`) carry the same dormant bug; not in the phase-e gate, also captured as a follow-up.

- 2026-04-24 — **Cross-manager call-action bridge gated by smoke (Task #56):**
  - New `scripts/smoke-call-actions.ts` (`quality:smoke:call-actions`) — 28 checks split into two layers:
    - **14 behavioural checks** drive the *real* `client/src/lib/call-actions.ts` registry (`registerCallActionHandler` / `dispatchCallAction` / `__resetCallActionRegistry`) using synthetic mirrors of the two real handler shapes. Asserts: deregister closure works, empty registry returns false, sessionId-mismatch handlers fall through (so the next manager gets a chance), decline routes to the manager whose **incoming** sessionId matches, hangup routes to the manager whose **active** sessionId matches, hangup with no active session anywhere returns false (avoids racing in-flight cleanup), a manager with only an incoming invite refuses hangup (the well-known regression that previously double-fired), handlers run in registration order and stop at the first claim, a throwing handler doesn't break the chain, async handlers are awaited, no-callId actions route to the only manager with an incoming invite, and a 3-tap end-to-end run (accept → decline → hangup) all route to the same DM manager.
    - **14 source-pattern guards** (positive + negative) scan the live files so the synthetic mirrors stay honest. Positive: `call-actions.ts` wraps each handler in try/catch and returns the deregister closure; `use-call-session.tsx` guards `accept`/`decline` on `incoming.sessionId` and only fires hangup when `ctx.callId` matches `activeSessionId`; `private-call-layer.tsx` guards `accept`/`decline` on `invite.sessionId` and hangup on `active.sessionId`; `CallSessionProvider.tsx` is the **only** entry point that forwards SW notification clicks via `dispatchCallAction`; `native-call-ui.ts` forwards CallKit/Telecom answer & hangup events through `dispatchCallAction`. **Negative**: the `if (incoming) {…}` block in `use-call-session.tsx` and the `if (invite) {…}` block in `private-call-layer.tsx` never claim hangup (closes the false-claim regression class where an incoming-only manager would absorb a hangup that should have gone to the active-call manager — a string-aware brace matcher slices each branch so the assertion is scoped). `CallSessionProvider.tsx` preserves the `rawAction === "decline" ? "decline" : "accept"` SW action mapping (so lock-screen Decline isn't silently rewritten to Accept). `native-call-ui.ts` `callEnded` listener dispatches `decline` **first** (`const handled = await dispatchCallAction({ action: "decline", … })` + `if (handled) return`) and only falls through to `hangup` when unclaimed — verified by literal-token ordering rather than wildcard regex spans, since both managers correctly refuse to claim hangup from an invite-only state.
  - Wired into `quality:gate:chat` (now: `check:types && dm-notifications && room-notifications && call-actions`) and runs in parallel inside `verify:fast` alongside the typecheck, DM smoke, and room smoke. Left out of `quality:gate:phase-e` (matches the team's pattern of opt-in call-experience smokes). 28/28 PASS.

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
