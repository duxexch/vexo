# VEX Platform

## Overview

VEX is a comprehensive TypeScript platform that integrates competitive gaming, social interaction, and financial services. It offers competitive games, real-time chat, a multi-currency wallet, a P2P marketplace, and an administrative console, accessible via web browsers and a native Android application. The project prioritizes financial integrity, database safety, a mobile-first user experience, internationalization (RTL/i18n) support, SEO, and production reliability.

The business vision is to establish VEX as a leading global platform for online gaming and digital asset exchange, particularly targeting emerging markets. It aims to foster user engagement and community through diverse features, enabling flexible financial interactions.

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

## System Architecture

VEX employs a modern, distributed architecture for scalability and reliability.

**Technology Stack:**
- **Frontend:** React with Vite, Tailwind CSS, and shadcn/ui for a mobile-first, internationalized (i18n with RTL support) single-page application.
- **Backend:** Node.js 20 with Express.js and WebSockets for real-time communication.
- **Database:** PostgreSQL 15 managed with Drizzle ORM.
- **Cache/Pub-Sub:** Redis 7.
- **Object Storage:** MinIO (S3-compatible).
- **Internal AI Service:** Dedicated Node.js/Express microservice.
- **Mobile Integration:** Capacitor for native Android application.
- **Reverse Proxy (Production):** Traefik v3 with Let's Encrypt.

**Core Architectural Decisions:**
- **Microservices:** AI features and commercial agent subsystems are decoupled into separate microservices for independent scaling, sharing the same Postgres DB.
- **Shared Codebase:** A `shared/` directory centralizes types and Drizzle schema definitions.
- **Containerization:** Docker and Docker Compose for consistent environments.
- **Real-time Communication:** WebSockets for interactive features, supported by sticky sessions.
- **Multi-currency Wallet System:** Supports primary and sub-wallets, managed via dedicated financial modules.
- **Unified Game Visuals:** A `game-config` system ensures consistent visual identity for games across the UI.
- **Pro-grade Calling Experience:** Leverages Web Audio, Capacitor LocalNotifications, and custom native Capacitor plugins for robust incoming call functionality including lock-screen UI.
- **WebRTC ICE Credentials:** All WebRTC consumers fetch ICE servers from `/api/rtc/ice-servers` using HMAC-SHA1-signed time-limited credentials.
- **VoIP Push Notifications:** APNs (iOS) and FCM (Android) are implemented for reliable VoIP push notifications.
- **Chat System:** Features real-time direct messages and room-based chat with spectator counts and a "friends-free / stranger unlock" pricing model.
- **Game Management:** Administrative tools for visual identity and asset management for games.
- **Leaderboards:** Supports period- and region-filtered leaderboards.
- **Matchmaking:** Skill-based matchmaking system with adaptive tolerance and queue expiration.
- **Operational Log Hygiene:** Implements deduplication and throttling for repeating WARN/ERROR lines from watchdogs and Redis client to prevent log flooding.
- **UI/UX Decisions:**
    - **Mobile-first Design:** Prioritizes responsiveness and optimal mobile experience.
    - **Internationalization (i18n) and RTL Support:** Ensures accessibility for diverse language speakers.
    - **Consistent Visuals:** Tailwind CSS and shadcn/ui for a cohesive design language.
    - **Accessibility:** `data-testid` attributes for improved testability.
    - **Player Home Page (Stadium):** The `/` route features a 1xbet-inspired layout with a 3D-tilted hero carousel, owner stat bar, horizontal rails, and an activity timeline.
    - **Stadium Design Tokens:** Uses specific fonts, accent gradients, surface backgrounds, and a radial gradient hero backdrop for visual consistency.
    - **Mini-Games Library:** Includes 24 standalone HTML5 mini-games (13 solo, 11 pass-and-play multiplayer) with a unified "VEX 3D KIT" visual identity. Games are bilingual (ar/en) and communicate with the platform via `vex-sdk.js` or function standalone.
    - **Arcade Sessions Backend:** A dedicated pipeline for the newest games, including plausibility checks for scores, personal best tracking, leaderboards, and Sam9's AI-driven banter.

## External Dependencies

-   **PostgreSQL 15:** Primary database.
-   **Redis 7:** Caching and pub-sub.
-   **MinIO:** S3-compatible object storage.
-   **Traefik v3:** Production reverse proxy and load balancer with Let's Encrypt.
-   **Capacitor:** Cross-platform native runtime for Android.
-   **APNs (Apple Push Notification service):** VoIP push notifications for iOS.
-   **FCM (Firebase Cloud Messaging):** VoIP push notifications for Android.
-   **CallKit (iOS):** Native framework for iOS call UI integration.
-   **ConnectionService (Android):** Native framework for Android call UI integration.