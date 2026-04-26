# VEX Platform

## Overview

VEX is a full-stack TypeScript platform designed to offer a comprehensive digital experience combining competitive gaming, social interaction, and robust financial services. It features competitive games, a real-time social chat system, a multi-currency wallet, a peer-to-peer (P2P) marketplace, and an administrative console for managing the platform. The platform is accessible via web browsers and as a native Android application through Capacitor. Key priorities include financial integrity, database safety, mobile-first user experience, RTL/i18n correctness, SEO, and production reliability.

The business vision is to create a leading platform for online gaming and digital asset exchange, targeting a global audience with a focus on emerging markets. The multi-currency wallet and P2P marketplace aim to provide flexible financial interactions, while competitive games and social features drive user engagement and community building.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file.

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
- **Shared Codebase:** A `shared/` directory centralizes types and Drizzle schema, ensuring consistency between frontend and backend.
- **Containerization:** Docker is used for consistent development and production environments, orchestrated with Docker Compose.
- **Real-time Communication:** WebSockets are fundamental for interactive features like chat and game updates, with sticky sessions managed by the backend cluster.
- **Multi-currency Wallet System:** Supports multiple currencies with a primary wallet and lazily created sub-wallets, managed through dedicated financial modules and administrative controls.
- **Unified Game Visuals:** A centralized `game-config` system ensures consistent display of game icons, gradients, and thumbnails across all UI surfaces, with admin-manageable visual identities.
- **Pro-grade Calling Experience:** Leverages Web Audio, Capacitor LocalNotifications, and custom native Capacitor plugins (CallKit for iOS, ConnectionService for Android) for a robust incoming call experience, including lock-screen UI.
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
  #95). Run it on any PR that touches the board or its solver before merging.
- **`quality:gate:chat`** — DM/room realtime notifications and call-action
  smokes (incl. the React-tree call-actions test).
- **`quality:gate:game-visuals`** — game-icon purity and game-config
  resolution.
- **`quality:gate:i18n-global`** — types + i18n string-key gate.

## Mobile Verification

- **Task #82 — Android Capacitor composer over keyboard:** Manual real-device verification of the Task #43 fix (`Keyboard.resize: 'none'` + `useKeyboardInset` driven by `visualViewport`/Capacitor Keyboard events) is captured as a step-by-step Arabic checklist at `docs/device-tests/android-keyboard-composer-2026-04.md`. Pass/fail outcome to be recorded inline in that file once executed on a physical Android (and ideally iOS) device.

## Cross-Surface Rule (PERMANENT, Task #177)

> **Every feature, fix, redesign, or polish item in VEX must work — and look right — on the desktop browser, on Android (Capacitor WebView), on iOS (when present), AND across every supported screen size, before it can be considered done.**

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

- The `.jks` keystore file lives **only** at `android/keystore/vex-release-official.jks` on the user's local build machine. The whole `android/` tree is gitignored (and `*.jks`, `*.keystore`, `android/app/signing.properties` are gitignored as belt-and-braces). The file is **never** copied into the Replit container, the dist bundle, or any committed asset.
- The two passwords (`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`) live in **Replit Secrets** in this workspace (so the build script can validate they exist) and in the user's local shell environment on the actual build machine. They are never written to any tracked file.
- `android/app/signing.properties` is generated **on demand** by `scripts/mobile-android-build.mjs` from those env vars, right before invoking gradle, then sits in the gitignored `android/` tree. No hand-edited copy is required.

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