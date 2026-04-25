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

## Mobile Verification

- **Task #82 — Android Capacitor composer over keyboard:** Manual real-device verification of the Task #43 fix (`Keyboard.resize: 'none'` + `useKeyboardInset` driven by `visualViewport`/Capacitor Keyboard events) is captured as a step-by-step Arabic checklist at `docs/device-tests/android-keyboard-composer-2026-04.md`. Pass/fail outcome to be recorded inline in that file once executed on a physical Android (and ideally iOS) device.