# VEX Platform

## Overview

VEX is a comprehensive TypeScript platform integrating competitive gaming, social interaction, and financial services. It features competitive games, real-time chat, a multi-currency wallet, a P2P marketplace, and an administrative console. The platform is accessible via web browsers and a native Android application. Key priorities include financial integrity, database safety, mobile-first UX, RTL/i18n correctness, SEO, and production reliability.

The business vision is to establish VEX as a leading platform for online gaming and digital asset exchange, targeting a global audience, especially in emerging markets. The platform aims to foster user engagement and community through diverse features, enabling flexible financial interactions.

## User Preferences

The user is the owner of vixo.click and runs the production VPS personally. The following preferences are **standing instructions** — every agent (Replit main, planning, isolated task agent, design, code-review, or external) must apply them on every task without re-asking.

**Communication**
- Reply to the user in **Arabic** (Modern Standard / Egyptian register, matching their tone). Internal docs (`replit.md`, `AGENTS.md`, audit files, plan files, code comments) stay in English so the codebase is readable by every agent and contributor.
- Never name internal tools, function names, plugin SDKs, or platform internals in user-facing replies — describe the **action** ("سأحدّث الإعدادات", "سأشغّل المتصفح للتجربة") rather than the mechanism.
- Be concise; show diffs/file paths only when they actually help the user verify the change.

**Engineering bias**
- **Audit-first.** For any cross-cutting work, sweep the surface end-to-end before proposing fixes (see `docs/mobile/PRO_AUDIT_2026-04.md` for the canonical pattern). Convert findings into individual follow-up tasks, one plan file per follow-up under `.local/tasks/`.
- **Performance-first ordering.** When sequencing follow-ups, perceived perf (cold start, first paint, animation smoothness, keyboard jank) outranks polish — except when a security finding is in play, in which case secret rotation / history scrub jumps to P0.
- **Cross-surface rule (PERMANENT).** Every feature/change/fix must work on browser + mobile + every screen size. Mirror this rule **verbatim** in both `replit.md` and `AGENTS.md`; if you change the wording in one place, change it in the other in the same task. Canonical text lives below in the **Cross-Surface Rule** section.

**Repo hygiene**
- `.local/` is **tracked by git** in this repo (intentional — task plans, audit pointers, and session notes are part of the project record). Never assume `.local/` is throwaway scratch.
- Never write secrets to disk inside the repo. Replit Secrets is the only home for `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, LiveKit, TURN, SMTP, and admin credentials. Gradle and the Node build script read them from `process.env` at build time only — see the **Android Release Signing** section below.
- Destructive git operations (`filter-repo`, `filter-branch`, force-push, history rewrites) require **explicit user approval** and a dedicated task — never autonomous.

---

**ملاحظة بالعربية للمستخدم:** هذه التفضيلات دائمة. أي وكيل يعمل على المشروع ملزم بها — الردود بالعربية، التدقيق قبل البناء، الأداء أولاً، والقاعدة العابرة للأسطح (متصفح + موبايل + كل المقاسات) في كل تغيير. الأسرار تُحفظ فقط في Replit Secrets ولا تُكتب على القرص.

## System Architecture

VEX employs a modern, distributed architecture for scalability and reliability.

**Technology Stack:**
- **Frontend:** React with Vite, Tailwind CSS, and shadcn/ui for a mobile-first, internationalized (i18n with RTL support) single-page application.
- **Backend:** Node.js 20 with Express.js and WebSockets for real-time communication, utilizing a cluster setup.
- **Database:** PostgreSQL 15 managed with Drizzle ORM, with shared schema definitions and automatic migrations.
- **Cache/Pub-Sub:** Redis 7 for high-performance caching and inter-service communication.
- **Object Storage:** MinIO (S3-compatible) for file uploads and static assets.
- **Internal AI Service:** A dedicated Node.js/Express microservice for AI features.
- **Mobile Integration:** Capacitor for native Android application delivery.
- **Reverse Proxy (Production):** Traefik v3 with Let's Encrypt for SSL termination and secure routing.

**Core Architectural Decisions:**

- **Microservices for AI:** The AI service is a decoupled container for independent scaling.
- **Microservice for Commercial Agents (cashier subsystem):** The agents subsystem (admin agent CRUD, ledger, balance adjustments, payment methods — `/api/admin/agents/*`, `/api/agents/*`) lives in `services/agents-service/` as a standalone container on port 3002, sharing the same Postgres DB. The main server's `server/middleware/agents-proxy.ts` validates the admin session locally, then forwards the request to the service with `X-Internal-Service-Token` + `X-Admin-{Id,Role,Username}` headers. **Activation:** controlled by `AGENTS_SERVICE_URL` — when unset (Replit dev), the proxy is a no-op and the legacy in-process routes still serve the same endpoints (zero-disruption fallback). In docker-compose, the `app` container receives `AGENTS_SERVICE_URL=http://vex-agents-service:3002` so the proxy activates automatically. Both processes share the secret via `INTERNAL_SERVICE_TOKEN`.
- **Shared Codebase:** A `shared/` directory centralizes types and Drizzle schema for consistency between frontend and backend.
- **Containerization:** Docker and Docker Compose are used for consistent environments.
- **Real-time Communication:** WebSockets are central to interactive features, supported by sticky sessions.
- **Multi-currency Wallet System:** Supports multiple currencies with primary and lazily created sub-wallets, managed via dedicated financial modules.
- **Unified Game Visuals:** A `game-config` system ensures consistent display of game icons, gradients, and thumbnails across all UI surfaces, with admin-manageable identities.
- **Pro-grade Calling Experience:** Leverages Web Audio, Capacitor LocalNotifications, and custom native Capacitor plugins (CallKit for iOS, ConnectionService for Android) for robust incoming call functionality including lock-screen UI.
- **WebRTC ICE Credentials:** All WebRTC consumers fetch ICE servers from `/api/rtc/ice-servers` via `useIceServers()`. The bundled coturn runs in `use-auth-secret` mode with HMAC-SHA1-signed time-limited credentials.
- **VoIP Push Notifications:** APNs (iOS) and FCM (Android) are implemented for reliable VoIP push notifications.
- **Chat System:** Features real-time direct messages and room-based chat with spectator counts and a "friends-free / stranger unlock" pricing model.
- **Game Management:** Administrative tools include visual identity management for games with asset uploaders and color pickers.
- **Leaderboards:** Supports period- and region-filtered leaderboards.
- **Matchmaking:** Skill-based matchmaking system with adaptive tolerance and queue expiration.
- **Operational Log Hygiene (Apr 2026):** The 4 turn-timeout watchdogs (Domino/Tarneeb/Baloot/Language Duel) and the Redis client (`server/lib/redis.ts`) deduplicate repeating WARN/ERROR lines so a single stuck challenge or a missing local Redis no longer floods the log file. Watchdog skips for the same `(challengeId, reason)` are logged at most once per hour via a bounded in-memory cache (`shouldLogWatchdogSkip` in `server/setup/schedulers.ts`). Redis "Error" and "Closed" events are throttled per (client, message) to once per minute with a `(suppressed N similar … in the last 60s)` suffix. In development, `maxRetriesPerRequest` is `null` and `retryStrategy` retries forever (5s ceiling) so a missing local Redis no longer emits FATAL "Unhandled Rejection: MaxRetriesPerRequestError" / "Connection is closed" loops; production keeps fail-fast (3 retries, give-up after 10 reconnect attempts).

**UI/UX Decisions:**
- **Mobile-first Design:** Frontend development prioritizes responsiveness and optimal mobile experience.
- **Internationalization (i18n) and RTL Support:** Ensures accessibility for diverse language speakers.
- **Consistent Visuals:** Tailwind CSS and shadcn/ui provide a cohesive design language. Shared components promote visual uniformity.
- **Accessibility:** Implementation of `data-testid` attributes for improved testability.
- **Player Home Page (Stadium):** The `/` route renders `stadium-home.tsx` with a 1xbet-inspired layout, including a 3D-tilted hero carousel, owner stat bar, horizontal rails for games/tournaments/challenges, and an activity timeline. All data is backed by real APIs.
- **Stadium Design Tokens:** Uses Bebas Neue font, specific accent gradients (blue, gold, danger) with matching shadows, defined surface backgrounds, and a radial gradient hero backdrop. These tokens are being propagated to other pages, starting with `/leaderboard`.
- **Mini-Games Library (Solo + Pass-and-Play):** Twenty-four standalone HTML5 mini-games are bundled under `client/public/games/[slug]/`. **Solo (13):** `2048`, `sudoku`, `memory-flip`, `reaction-time`, `color-match`, `tap-speed`, `number-merge`, `tile-slider`, `pattern-recall`, `endless-runner`, `snake` (canvas grid, swipe/keyboard, growing tail), `stack-tower` (rhythm-tap stacking with shrinking blocks), `aim-trainer` (60-second click-the-target with miss penalty). **Pass-and-play multiplayer (11):** `tic-tac-toe` (vs full-minimax AI or 2P), `connect-4` (vs depth-3 alpha-beta minimax with center pref + immediate win/block, or 2P), `ludo` (2-4 players, classic 15×15 cross board, dice with 6=extra-roll, capture mechanic, safe star squares, exact-roll-to-finish, AI heuristic), `memory-battle` (4×4 grid, alternating turns, match=score+go-again), `reaction-duel` (2P split-screen, random delay → gold flash, false-start penalty, best-of-5), `pong` (2P split paddles or vs AI, first-to-7), `air-hockey` (2P or vs AI on a vertical rink, first-to-7 with goal posts), `typing-duel` (2P shuffled letter buttons, first-to-3 rounds, ar/en word pool), `bomb-pass` (2-4 players, random 6-22s fuse, last-alive wins), `quiz-rush` (2-4 players with 4-buzzer 2x2 layout — top buzzers rotated 180°, 12-question bilingual bank, +10/−5), and `dice-battle` (2-4 players, 5 rounds, 3 dice with pip rendering, pair=+5/triple=+20). All games share `_shared/vex-game.css` and `_shared/vex-game.js` for the Stadium look (Bebas Neue title, dark surfaces, gold/blue accents) plus helpers for toasts, score-pop animations, confetti, and per-slug `localStorage` best-score tracking. **3D Visual Identity (Apr 2026):** The 9 newest games (snake, stack-tower, aim-trainer, pong, air-hockey, typing-duel, bomb-pass, quiz-rush, dice-battle) share a "VEX 3D KIT" defined at the bottom of `_shared/vex-game.css` — stadium-grid arena floors, sweeping spotlight beams (single-property `transform`/`opacity` animations, no per-frame `filter`), bevel-shadow 3D buttons/cards/keys/dice, gold/blue/orange/red color variants, and `prefers-reduced-motion` overrides. Canvas-rendered games (snake, stack-tower, pong, air-hockey) use **cached gradients** (created once at boot, not per-frame) plus position-trail buffers for motion blur (5–6 entries, opacity-only fades) so the new depth/lighting adds zero hot-path work. Each game ships bilingual (ar/en) `STRINGS` and switches direction at runtime. They communicate with the platform through `/games/vex-sdk.js` (postMessage) when embedded in `/play/:slug`, and fall back to a fully playable standalone mode when no trusted parent origin is present (no-op `endSession`, 1.5s parent-handshake timeout). The catalog is seeded by `server/seed/seed-solo-games.ts` (idempotent upsert by slug into `external_games`, with optional `minPlayers`/`maxPlayers` per entry), surfaced via `GET /api/external-games`, and rendered on the Stadium home `Solo Games` rail with proper loading/error/empty states. **Arcade Sessions Backend (Apr 2026):** The 9 newest games are wired end-to-end through a dedicated arcade pipeline: `shared/arcade-games.ts` exports `ARCADE_GAME_KEYS` + `gameKeyToSlug` (maps DB underscore keys ↔ folder hyphen slugs) + `isArcadeGameKey`; `client/src/pages/arcade-play.tsx` (route `/arcade/:gameKey`) hosts each game in a sandboxed same-origin iframe and bridges the VEX SDK postMessage protocol (`game_init`, `game_ping`, `game_session_end`) back to the platform; `server/routes/arcade-sessions.ts` exposes `POST /api/arcade/sessions` (Zod-validated, gated by per-game `MAX_SCORE_PER_SECOND` plausibility check + `MIN_RUN_MS` floor to drop tampered payloads, writes to `arcade_sessions` table, computes personal best, returns Sam9 banter), `GET /api/arcade/sessions/me` (player history + best/runs/wins), `GET /api/arcade/leaderboard?gameKey=…` (top scores joined with users), and `GET /api/arcade/games` (Sam9's allow-list); `server/lib/sam9-arcade-banter.ts` provides Arabic banter pools (personal_best/first_run/win/loss/draw) and the `sam9KnowsArcadeGame` allow-list so Sam9 reacts to results without needing a turn-based engine. `client/src/pages/games-catalog.tsx`'s `handlePlayNow` now routes via `isArcadeGameKey(gameKey) → /arcade/${gameKey}` instead of the old broken `/games/new-game.html` hardcoded path.

## External Dependencies

- **PostgreSQL 15:** Primary database.
- **Redis 7:** Caching and pub-sub.
- **MinIO:** S3-compatible object storage.
- **Traefik v3:** Production reverse proxy and load balancer with Let's Encrypt.
- **Capacitor:** Cross-platform native runtime for Android.
- **APNs (Apple Push Notification service):** VoIP push notifications for iOS.
- **FCM (Firebase Cloud Messaging):** VoIP push notifications for Android.
- **CallKit (iOS):** Native framework for iOS call UI integration.
- **ConnectionService (Android):** Native framework for Android call UI integration.