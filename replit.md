# VEX Platform

## Overview

VEX is a full-stack TypeScript platform designed to offer a comprehensive digital experience combining competitive gaming, social interaction, and robust financial services. It features competitive games, a real-time social chat system, a multi-currency wallet, a peer-to-peer (P2P) marketplace, and an administrative console for managing the platform. The platform is accessible via web browsers and as a native Android application through Capacitor. Key priorities include financial integrity, database safety, mobile-first user experience, RTL/i18n correctness, SEO, and production reliability.

The business vision is to create a leading platform for online gaming and digital asset exchange, targeting a global audience with a focus on emerging markets. The multi-currency wallet and P2P marketplace aim to provide flexible financial interactions, while competitive games and social features drive user engagement and community building.

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

VEX is built on a modern, distributed architecture designed for scalability and reliability.

**Technology Stack:**
- **Frontend:** React with Vite, Tailwind CSS, and shadcn/ui for a mobile-first, internationalized (i18n with RTL support) single-page application.
- **Backend:** Node.js 20 with Express.js and WebSockets for real-time communication, featuring a cluster setup for sticky WebSocket sessions.
- **Database:** PostgreSQL 15 managed with Drizzle ORM. Schema definitions are shared, and migrations are applied automatically at container startup.
- **Cache/Pub-Sub:** Redis 7 for high-performance caching and inter-service communication.
- **Object Storage:** MinIO (S3-compatible) for handling file uploads and static assets.
- **Internal AI Service:** A separate Node.js/Express microservice for AI-driven features.
- **Mobile Integration:** Capacitor for delivering a native Android application experience.
- **Reverse Proxy (Production):** Traefik v3 with Let's Encrypt for SSL termination and secure routing.

**Core Architectural Decisions:**

- **Microservices-oriented for AI:** The AI service is decoupled into a separate container, allowing independent scaling and development.
- **Shared Codebase:** A `shared/` directory centralizes types and Drizzle schema, ensuring consistency between frontend and backend. **Client pages must derive their row types from `shared/schema.ts` (via `typeof <table>.$inferSelect` or a thin `Pick`/`Omit`) instead of hand-rewriting them locally** — the previous duplicate `P2POffer` / `UserType` interfaces in `client/src/pages/p2p.tsx`, `client/src/pages/admin/admin-p2p.tsx`, and `client/src/pages/admin/admin-users.tsx` silently drifted whenever the server schema gained or renamed a column (Task #98 patched the symptom; Task #123 removed the duplication). Where the wire payload renames a column or joins extra fields, anchor the override to the schema column (e.g. `currency: P2POfferRow["cryptoCurrency"]`) so the build still breaks if the underlying column name changes.
- **Containerization:** Docker is used for consistent development and production environments, orchestrated with Docker Compose.
- **Real-time Communication:** WebSockets are fundamental for interactive features like chat and game updates, with sticky sessions managed by the backend cluster.
- **Multi-currency Wallet System:** Supports multiple currencies with a primary wallet and lazily created sub-wallets, managed through dedicated financial modules and administrative controls.
- **Unified Game Visuals:** A centralized `game-config` system ensures consistent display of game icons, gradients, and thumbnails across all UI surfaces, with admin-manageable visual identities.
- **Pro-grade Calling Experience:** Leverages Web Audio, Capacitor LocalNotifications, and custom native Capacitor plugins (CallKit for iOS, ConnectionService for Android) for a robust incoming call experience, including lock-screen UI.
- **WebRTC ICE Credentials (Task #240):** All WebRTC consumers (in-game `VoiceChat.tsx` and `private-call-layer.tsx`) fetch ICE servers from `/api/rtc/ice-servers` via the shared `useIceServers()` hook. The bundled coturn (`deploy/coturn/turnserver.conf.template`) runs in `use-auth-secret` mode and ONLY accepts HMAC-SHA1-signed time-limited credentials issued by `server/lib/turn-credentials.ts`; the legacy static-credential path (`PUBLIC_RTC_TURN_USERNAME` / `PUBLIC_RTC_TURN_CREDENTIAL`) is kept for backward compat only and is unused in production. `server/index.ts` calls `validateTurnCredentialsAtBoot()` to log a loud, structured warning if `TURN_HOST` / `TURN_STATIC_SECRET` are missing or still at the `.env.example` placeholder.
- **VoIP Push Notifications:** Implements APNs (iOS) and FCM (Android) for reliable VoIP push notifications to wake devices for incoming calls, even when the app is killed.
- **Chat System:** Features a real-time chat with direct messages and room-based chat, including spectator counts and a "friends-free / stranger unlock" pricing model for DMs.
- **Game Management:** Administrative tools include visual identity management for games with asset uploaders, color pickers, and live previews.
- **Leaderboards:** Supports period- and region-filtered leaderboards.
- **Matchmaking:** Skill-based matchmaking system with adaptive tolerance and queue expiration.

**UI/UX Decisions:**
- **Mobile-first Design:** All frontend development prioritizes responsiveness and optimal experience on mobile devices.
- **Internationalization (i18n) and RTL Support:** Ensures the platform is accessible and user-friendly for diverse language speakers.
- **Consistent Visuals:** Utilizes Tailwind CSS and shadcn/ui for a cohesive and modern design language. Shared components like `GameCardBackground.tsx` and `GameLayout.tsx` promote visual uniformity.
- **Accessibility:** Implementation of `data-testid` attributes for improved testability and potentially accessibility.

**Player home page (Stadium):**
- The non-admin landing route (`/`) is rendered by `client/src/components/home/stadium-home.tsx` (1xbet-inspired stadium layout: 3D-tilted live-tournament hero carousel, owner stat bar, horizontal rails for live tournaments / team games / solo games / active challenges, and a continuously-loading activity timeline). Source images live under `client/public/images/home-stadium/`.
- `StadiumHome` accepts an `owner` prop only; real user data (avatar, nickname, VIP, wallet from `formatWalletAmountFromUsd`, wins/losses/streak from `/api/me/stats`) is wired from `PlayerDashboard` in `client/src/pages/dashboard.tsx`. The deposit and challenge buttons navigate to `/wallet` and `/challenges`.
- All rails are now backed by real APIs via `useQuery`: `/api/tournaments` (HeroCarousel + tournaments rail), `/api/games` (split into team-games and solo-games rails by `gameType === 'multiplayer'`), and `/api/challenges/public` (live-challenges rail). Loading shows skeletons; empty results show a `RailEmpty` component so no fake data is ever rendered. `/api/challenges/public` was switched to `optionalAuthMiddleware` so guests (when applicable) and logged-in viewers both receive data.
- The decorative-only sections (ActivityTimeline, ticker, "Player of Week" / "Daily Challenges" / "Announcement" sidebar cards) were intentionally removed because there is no API to back them. They will return when admin-managed sections are introduced (planned next phase).
- The original three exploration variants (Stadium / Holographic / LiveFeed) remain in `artifacts/mockup-sandbox/src/components/mockups/vex-home/` for future reference.

## External Dependencies

- **PostgreSQL 15:** Primary database for persistent data storage.
- **Redis 7:** Used for caching and pub-sub mechanisms.
- **MinIO:** S3-compatible object storage for file uploads.
- **Traefik v3:** Production reverse proxy and load balancer, integrated with Let's Encrypt for SSL.
- **Capacitor:** Cross-platform native runtime for building Android applications from the web codebase.
- **APNs (Apple Push Notification service):** For sending VoIP push notifications to iOS devices.
- **FCM (Firebase Cloud Messaging):** For sending VoIP push notifications to Android devices.
- **CallKit (iOS):** Native framework for integrating with the iOS system's call UI.
- **ConnectionService (Android):** Native framework for integrating with the Android system's call UI.

## Quality Gates

Aggregate `npm run` scripts that bundle the smokes a future agent must run when
touching a particular subsystem. Each gate runs `check:types` first, then the
relevant smokes in series. Use these instead of remembering individual scripts.

- **`quality:gate:tournaments`** — tournament wallet display, insufficient-balance
  text, and the real-browser register-disabled e2e (Task #119).
- **`quality:gate:domino`** (Task #121) — every functional domino smoke that
  guards the layout solver and board renderer in
  `client/src/components/games/DominoBoard.tsx`: layout snapshots,
  tile-orientation snapshots, playthrough bounds, playthrough pips, and
  elbow-mirror parity (`scripts/smoke-domino-elbow-mirror.ts`, added in Task
  #95) plus the 28-tile fit smoke (Task #214). Wired to CI in Task #163 via
  `.github/workflows/domino-quality-gate.yml`, which runs the gate on every
  PR (and push to `main`) that touches the board, the layout solver, the
  challenge container, the table-style picker, the smokes themselves, or
  their fixtures — failures block merge.
- **`quality:gate:chat`** — DM/room realtime notifications, call-action
  smokes (incl. the React-tree call-actions test), and the mobile-web
  keyboard-inset Playwright smoke (Task #117 — see "Mobile Verification"
  below).
- **`quality:gate:game-visuals`** — game-icon purity and game-config
  resolution.
- **`quality:gate:i18n-global`** — types + i18n string-key gate.

### Post-deploy header pin (Task #157)

`prod-auto.sh`'s `verify_post_deploy_stack()` now runs
`scripts/smoke-permissions-policy-header.mjs` inside `vex-app` against
`https://<APP_URL-domain>/` as the final gate. It asserts the live
`Permissions-Policy` header still contains every required `=(self)`
directive (microphone, camera, fullscreen, clipboard-write — same list
the source-level guard at `tests/permissions-policy-header.test.ts`
pins) and rejects the pre-Task-#143 forms `camera=()` and `camera=*`.

Failure modes that block rollout: header missing on the wire, header
rewritten by an upstream proxy (Cloudflare / Hostinger panel / nginx
include), or the live URL is unreachable after retries. Operators can
re-run the same check on demand against any URL with
`npm run security:smoke:permissions-policy-header -- --url=https://...`.

## Mobile Verification

- **Task #82 — Android Capacitor composer over keyboard:** Manual real-device verification of the Task #43 fix (`Keyboard.resize: 'none'` + `useKeyboardInset` driven by `visualViewport`/Capacitor Keyboard events) is captured as a step-by-step Arabic checklist at `docs/device-tests/android-keyboard-composer-2026-04.md`. Pass/fail outcome to be recorded inline in that file once executed on a physical Android (and ideally iOS) device.
- **Task #117 — Mobile-web keyboard-inset Playwright smoke:** `tests/playwright/chat-keyboard-inset.spec.mjs` (npm script `quality:smoke:chat-keyboard-inset`, wired into `quality:gate:chat`) opens the chat page on iPhone 14 + Pixel 7 emulated viewports, programmatically shrinks `window.visualViewport.height` to simulate the on-screen keyboard, and asserts the composer's bounding-box bottom now sits inside the visible viewport. It locks the user-visible outcome of the Task #43 fix (`useKeyboardInset` + the chat wrapper's `pb-[max(..., var(--keyboard-inset-bottom,0px))]`) on every CI build, complementing the Task #81 unit tests (which lock the hook's listener attach/detach mechanics) and leaving Task #82 to cover only the genuinely native Capacitor bits.
- **Task #180 — Capacitor `Keyboard.resize` config-drift fix (2026-04-26):** `capacitor.config.ts` was reset from the drifted `Keyboard.resize: 'body'` back to `'none'` so the JS layer (`useKeyboardInset` → `--keyboard-inset-bottom`) is the only thing animating the chat composer. A new pinned spec `client/src/hooks/__tests__/keyboard-config-contract.test.ts` (3 tests, vitest jsdom) reads `capacitor.config.ts` as text and fails CI immediately if `Keyboard.resize` is ever set to anything other than `'none'`, and also asserts the hook's synthetic-`visualViewport` math (open: vv 800→480 yields 320px on the CSS variable; close returns to 0px; `vv.offsetTop` is subtracted, not double-counted). Cross-surface evidence captured this commit: vitest 9/9 green; `quality:smoke:chat-keyboard-inset` 18/18 green at iPhone 14 (390×844, vv shrink 844→460 → CSS var 384px, composer rose 312px) AND Pixel 7 (412×915, vv shrink 915→520 → CSS var 395px, composer rose 323px) — Pixel 7 is the closest emulated bucket to the `xs` 414 px representative. The `xxs` (≤360 px) and Capacitor Android (signed APK on physical device) passes are recorded inline in `docs/device-tests/android-keyboard-composer-2026-04.md` and remain owner-only because the agent cannot sign or install an APK on a physical phone.

## Cross-Surface Rule (PERMANENT, Task #177)

> **TL;DR (canonical, exact wording from Task #177):** every feature/change/fix must work on browser + mobile + every screen size.

> **Expanded form:** Every feature, fix, redesign, or polish item in VEX must work — and look right — on the desktop browser, on Android (Capacitor WebView), on iOS (when present), AND across every supported screen size, before it can be considered done.

This is a hard rule for ALL agents (main agent, planning agents, design agents, task agents, code-review agents). It applies to:

- New features and refactors.
- Bug fixes (both regression-fix and bug-fix tasks must be verified on every surface).
- Design changes (animations, gestures, transitions, spacing, colour, typography).
- Permission flows and any native plugin work.

**Supported screen-size buckets** (use these breakpoints when planning, designing, and testing):

| Bucket | Width range | Representative devices |
|---|---|---|
| `xxs` | ≤ 360 px | Old/budget Android phones (Galaxy S8 mini, etc) |
| `xs`  | 361 – 414 px | Modern phones in portrait (iPhone 12-15, Pixel 6-8, S22-24) |
| `sm`  | 415 – 599 px | Phablets / phones in large-text mode |
| `md`  | 600 – 767 px | Small tablets, foldables half-open |
| `lg`+ | ≥ 768 px | Tablets, foldables open, desktop browser |

**Required surfaces for "done":**

1. **Desktop browser** — Chrome/Edge/Firefox at ≥ 1280 px, plus a 360 px responsive-mode pass.
2. **Mobile web (Safari iOS + Chrome Android)** — at least one phone-bucket width.
3. **Capacitor Android (WebView)** — verified through the existing release-build pipeline (see § "Android Release Signing"). At minimum the touched screens are loaded once on a real Android device or emulator.
4. **iOS (Capacitor)** — verified when the change touches iOS-specific code paths (CallKit, push, deep links, status-bar/safe-area, haptics).

A Playwright smoke at one viewport does **not** satisfy the rule on its own. Add a desktop check + a mobile check at minimum, and document any surface that is intentionally out of scope (with reason) inside the task plan.

This rule is mirrored verbatim in `AGENTS.md` so non-Replit agents see it too.

## Android Release Signing (Task #177)

The VEX Android release build is signed with **the user's official VEX release keystore**. Treat the keystore file and its passwords as the single most sensitive material in the project — losing them means losing the ability to ship updates to existing installs and to publish new builds on Google Play.

**Storage policy:**

- The `.jks` keystore file lives **only** at `android/keystore/vex-release-official.jks` on the user's local build machine. The whole `android/` tree is gitignored (and `*.jks`, `*.keystore` are gitignored as belt-and-braces). The file is **never** copied into the Replit container, the dist bundle, or any committed asset.
- The two passwords (`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`) live in **Replit Secrets** in this workspace (so the build script can validate they exist) and in the user's local shell environment on the actual build machine. They are **never** written to any file — not to `signing.properties`, not to `gradle.properties`, not to `capacitor.config.ts`, not to a gradle command line.
- **Gradle is the source of truth.** `android/app/build.gradle` reads the four `ANDROID_*` env vars directly via `System.getenv("ANDROID_…")` inside its `signingConfigs.release` block, and fails the release `buildType` loudly if any are missing. The canonical gradle snippet (the one to paste into `build.gradle` after `npx cap add android`) lives at [`docs/mobile/android-signing-gradle-snippet.md`](docs/mobile/android-signing-gradle-snippet.md).
- `scripts/mobile-android-build.mjs` is a thin wrapper that (a) refuses to run if any of the four env vars are missing, (b) verifies the keystore file exists, (c) greps `android/app/build.gradle` for `ANDROID_KEYSTORE_PASSWORD` to confirm the snippet has been applied, then (d) spawns `./gradlew` with the env passed through. **No password value ever touches disk.**
- Capacitor's own `android.buildOptions.keystorePassword` field is intentionally NOT used (it would materialise the password into a properties file). The corresponding fields are absent from `capacitor.config.ts` and must stay absent.

**Required environment variables** (all four):

| Key | Where it lives | Notes |
|---|---|---|
| `ANDROID_KEYSTORE_PATH` | Replit Secrets + local shell | Path to the `.jks`. Default is `android/keystore/vex-release-official.jks`. Non-secret. |
| `ANDROID_KEY_ALIAS` | Replit Secrets + local shell | `vex_release_official`. Non-secret. |
| `ANDROID_KEYSTORE_PASSWORD` | Replit Secrets + local shell | **Secret.** Never commit. |
| `ANDROID_KEY_PASSWORD` | Replit Secrets + local shell | **Secret.** Never commit. |

`scripts/mobile-android-build.mjs` refuses to run `assembleRelease` / `bundleRelease` if any of the four are missing.

**Keystore metadata (non-secret — safe to share for fingerprint pinning, Play App Signing uploads, OAuth provider configuration, etc):**

| Field | Value |
|---|---|
| Path (gitignored) | `android/keystore/vex-release-official.jks` |
| Alias | `vex_release_official` |
| SHA-1 fingerprint | `7F:8D:A0:CB:12:42:1A:7F:90:6D:43:2E:6C:C2:96:1A:DD:AE:C8:B8` |
| SHA-256 fingerprint | `46:67:5A:1E:EA:17:A4:76:B9:1F:B3:11:3F:13:6F:85:3E:8B:65:BC:48:24:6C:91:BB:0E:BD:25:E7:EA:A5:CB` |
| Owner / Issuer DN | `CN=VEX Platform, OU=Mobile, O=VEX, L=Riyadh, ST=Riyadh, C=SA` |
| Algorithm | SHA384withRSA, 4096-bit RSA |
| Valid from | 2026-04-07 |
| Valid until | 2053-08-23 |

**If you suspect either password has leaked** (e.g. it was pasted into chat, a tracked file, or shared screen): stop, do not roll a release with the same keystore, and open a follow-up task to (a) rotate the passwords on the existing keystore via `keytool -storepasswd` / `keytool -keypasswd`, and (b) scrub the leaked values from git history with explicit user approval (destructive git ops are never run autonomously).

**Manual CI release pipelines (workflow_dispatch only):** Two GitHub Actions workflows exist for signed Android builds — both are triggered manually from the Actions tab, never on push.

- [`.github/workflows/android-build.yml`](.github/workflows/android-build.yml) — sole manual build pipeline with target `apk | aab | both`. Decodes the keystore from `ANDROID_KEYSTORE_BASE64` (safe `printf '%s' | base64 -d` form), pre-flights it with `keytool` (alias match + key-password decrypt) so config errors fail in <1s instead of after a 3-minute Gradle build, patches `android/app/build.gradle` via [`scripts/ci/patch-android-signing.mjs`](scripts/ci/patch-android-signing.mjs), patches the Kotlin Gradle plugin classpath via [`scripts/ci/patch-android-kotlin.mjs`](scripts/ci/patch-android-kotlin.mjs), runs gradle `assembleRelease` / `bundleRelease` on **Java 21 + compileSdk/targetSdk 36 + build-tools 36.0.0** (Node 22). Signed outputs are staged under `dist/android-release/VEX-official-release.{apk,aab}` (workflow scratch only — never committed) and uploaded to **two** GitHub Release tags simultaneously: a versioned, immutable `v<pkg-version>-build<run>` (kept forever for history) and a moving `latest-android` pointer (always the newest build, giving stable direct-download URLs `https://github.com/duxexch/vexo/releases/download/latest-android/VEX-official-release.{apk,aab}`). Workflow artifacts mirror the same files for 14 days. **Binaries are deliberately NOT committed back to git** — earlier attempts at that strategy hit Git LFS pointer corruption (133-byte text shipped in place of 13 MB binaries) and binary-merge conflicts on every rebase. Instead the Hostinger VPS pulls the binaries straight from the Release CDN via [`scripts/server/refresh-android-binaries.sh`](scripts/server/refresh-android-binaries.sh), which downloads each asset to a temp file, validates HTTP 200 + size ≥ 1 MB + ZIP magic bytes (`PK` checked via `od -An -tx1`, never via command substitution to avoid bash NUL-byte warnings) + non-HTML / non-LFS-pointer content, then atomically `mv`s it into `client/public/downloads/app.{apk,aab}` (the canonical names that the public download page links to and that the admin AAB endpoint resolves first). The `vex-app` container picks the binaries up live through a read-only bind mount declared in `docker-compose.prod.yml`: `./client/public/downloads:/app/dist/public/downloads:ro`. **Without that mount the container can only ever serve whatever was baked into the image at build time, which is empty for APK/AAB now that they no longer travel through git** — so a one-time `prod-update.sh` is required after pulling this commit on the VPS, then any future `refresh-android-binaries.sh` run is reflected immediately with no container restart. The previous `release-android.yml` was deleted in 2026-04 — this single workflow now owns the entire path.

Setup procedure (one-time secrets, password rotation, deploy-back-to-Hostinger): [`docs/mobile/github-actions-release-setup.md`](docs/mobile/github-actions-release-setup.md).

## Active Security Advisories

- **2026-04 — Mass secret leak in `.env.example` (C0).** Working tree is clean as of Task #178: `.env.example` and the corresponding paste in `attached_assets/` no longer hold any plaintext secrets (all 19 assignments redacted to `__REDACTED_USE_REPLIT_SECRETS__`, including infrastructure-layer secrets `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_*`, `SESSION_SECRET`, `JWT_*`, `ADMIN_*`, `SECRETS_ENCRYPTION_KEY`, `AI_AGENT_*`, `VAPID_*`, `WEB_PUSH_VAPID_*`). **Git history still holds the originals** until the owner runs the scrub. Full inventory + per-secret rotation procedures + git-history scrub recipe: [`docs/security/SECRET_ROTATION_2026-04.md`](docs/security/SECRET_ROTATION_2026-04.md). Until rotation completes, treat every value listed there as compromised.
