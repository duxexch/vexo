# VEX Mobile / Cross-Surface Pro Audit — Tasks #175 / #177

**Date:** 2026-04-26
**Scope:** Full sweep of the existing Capacitor + web app for security, performance, native-parity, adaptive-layout, permission UX, offline resilience, and build/signing integrity issues that block the "professional mobile app" goal. **No fixes implemented in this task** — every finding is converted into a follow-up proposal at the bottom (one task plan file per follow-up under `.local/tasks/`).
**Method:** Static read of `client/`, `capacitor.config.ts`, `scripts/mobile-android-build.mjs`, `package.json`, `.gitignore`, locale files; targeted ripgrep sweeps for native-API usage, secret literals, animation hot-paths, storage primitives, permission call-sites, network/offline branches, and `Capacitor.isNativePlatform()` guards.

---

## 0. Executive summary

The app already has solid foundations (custom CallKit/ConnectionService plugin, ChatBubbles plugin, native permission rationale modal, `useKeyboardInset` for the chat composer, env-driven gradle signing wired in this task). The blockers to a *professional* mobile experience cluster in five areas:

1. **Secret hygiene (CRITICAL)** — release-keystore passwords + LiveKit + TURN credentials sat in plain text inside `.env.example` and an `attached_assets/` paste, both tracked by git. Working-tree copies are now redacted (this task); git **history** still contains them. Rotation + history scrub is required.
2. **Cold-start & perceived smoothness** — splash budget is 3.1 s before the WebView is even allowed to take over, animations are property-soup (`transition-all` everywhere), and `framer-motion` is eagerly imported by every game board.
3. **Web-API where Capacitor plugin should win** — `navigator.share`, `navigator.vibrate`, `navigator.clipboard`, `localStorage` for auth tokens and wallet PIN. Each one works "ok" on web but feels off-brand or actively unsafe inside the Android WebView.
4. **Adaptive-layout debt** — no documented xxs (≤ 360 px) pass; `Keyboard.resize` is wired to `'body'` while the keyboard-inset hook was designed against `'none'`; safe-area / display-cutout / Android-13 edge-to-edge is not handled in CSS.
5. **Permission UX is partially-instrumented** — pre-prompt rationale exists for camera/mic via `CallPermissionPrompt`, but other permission triggers (notifications, contacts, location) lack consistent pre-prompt copy, denial recovery paths, or "open settings" deep-links when the OS marks a permission as permanently denied.

Priority order, perf-first per the user's preference:
**P0 secret rotation → P1 boot perf → P1 keyboard-config reconciliation → P2 native-plugin parity → P2 secure storage → P3 framer-motion code-split.**

---

## 1. Findings

Each finding is tagged `[SEV:Cn]` (C0 critical, C1 high, C2 medium, C3 low) and carries a follow-up id (`F-n`) that maps to § 2.

### C0-01 — Plain-text secrets in `.env.example` and `attached_assets/` (git-tracked)

- `.env.example:332-335` previously held the live VEX release-keystore passwords (`KEYSTORE_PASSWORD` and `KEY_PASSWORD`) in plain text — the literal 32-char secrets are intentionally NOT reproduced here. Working-tree copies have been replaced with the placeholder `__REDACTED_USE_REPLIT_SECRETS__` and the keys renamed to `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD`.
- The same two passwords were pasted verbatim into `attached_assets/Pasted---1777211079902_1777211079903.txt:5-6`, also git-tracked. That file is now a `[REDACTED]` notice.
- The same `.env.example` block also contained `LIVEKIT_KEYS` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (lines 341-349) and `TURN_PASSWORD` + `PUBLIC_RTC_TURN_CREDENTIAL` (lines 359, 364) in plain text — every clone of this repo had them. **All five are now redacted to `__REDACTED_USE_REPLIT_SECRETS__` in the working tree as part of this task.**
- The **same shared password literal** (intentionally not reproduced here — see the closed-door rotation playbook at `docs/security/SECRET_ROTATION_2026-04.md` for the inventory) was *also* reused for `ADMIN_RESET_PASSWORD` (line 88), `SMTP_PASS` (line 130), `ADMIN_SMOKE_PASSWORD` and `SMOKE_PASSWORD` (lines 272-273). All four were redacted in this task as well — credential reuse means a single leak compromises 7 distinct surfaces (TURN, RTC, admin reset, SMTP, two smoke users, plus Replit Secrets). F-1 must rotate the underlying value across **every** surface, not just TURN.
- **Git history** still holds the originals for all of the above.
- **Why C0:** the keystore passwords are the single most sensitive material in the project — anyone who clones the repo can sign builds that update existing user installs. LiveKit + TURN secrets enable free egress against the user's paid quotas.
- **Follow-up:** **F-1** (rotate everything + scrub history with explicit user approval) — `.local/tasks/task-178.md`.

### C1-02 — Splash auto-hide budget is 3.1 s — perceived launch is slow

- `capacitor.config.ts` plugin block:
  - `SplashScreen.launchShowDuration: 2500`
  - `SplashScreen.launchFadeOutDuration: 600`
  - `SplashScreen.launchAutoHide: true`
- Combined with cold WebView init, users see ~3 s of the splash even on flagship devices, before the SPA's first paint.
- The SPA already triggers `scheduleReleaseMonitoring()` after `requestIdleCallback` and registers its SW asynchronously, so it can survive a much shorter splash.
- **Follow-up:** **F-2** (`.local/tasks/task-179.md`) — switch to `launchAutoHide: false`, hide manually from `client/src/main.tsx` after first React paint, add `performance.mark('first-react-paint')` for a measurable budget.

### C1-03 — `Keyboard.resize: 'body'` contradicts the `useKeyboardInset` design

- `capacitor.config.ts:50` sets `Keyboard.resize: 'body'`.
- The chat-composer fix tracked in Task #43 / Task #82 / Task #117 (chat composer hook in `client/src/hooks/use-keyboard-inset.ts`) explicitly assumes `resize: 'none'` so the JS-side inset can drive the layout via `visualViewport` events — otherwise the WebView resizes the body **and** the JS hook adds an inset, double-counting and pushing the composer above the visible region.
- **Why this matters for "smoothness":** every keyboard show/hide currently triggers a full body reflow (Android `windowSoftInputMode=adjustResize` cascade) **plus** the JS hook's transform animation — visible jank on mid-range Android.
- **Follow-up:** **F-3** (`.local/tasks/task-180.md`) — reconcile to one mode, ideally `'none'` to align with the existing hook + Task #43 invariants, and add a unit test that asserts the value so it can't drift again.

### C1-04 — `transition-all` and broad `transform`/`will-change`-less animations

- `client/src/index.css` uses `transition-all` and unscoped `transform: translate*` rules in ≥ 8 places (gift panel, button states, card lifts).
- `transition-all` forces the compositor to consider every property change — costly on the WebView, especially when nested inside scrollable lists.
- No `will-change` hints + no `contain: layout` boundaries on the heavy animations (`gift-pop-in`, `gift-aurora-pulse`, `gift-shockwave-expand` at `index.css:422-449`).
- **Follow-up:** rolled into **F-2** (boot/animation perf sweep).

### C2-05 — `framer-motion` eagerly imported by every game board + the gift panel

- Detected in `client/src/components/games/{DominoBoard, ChessBoard, DominoChallengeContainer, FullScreenGiftPanel, ChessBoard}.tsx`.
- `framer-motion@11` weighs ~50 KB gzipped on the initial chunk if any of those modules are referenced from the lobby.
- **Follow-up:** **F-6** (`.local/tasks/task-182.md`) — lazy-split: dynamic-import each board so the lobby and chat surfaces don't pay the framer-motion cost.

### C2-06 — `navigator.share` / `navigator.clipboard` fallback misses Capacitor parity

- `client/src/pages/tournaments.tsx:414-419, 992-997` does:
  ```
  if (typeof navigator.share === 'function') { await navigator.share(...); }
  else { await navigator.clipboard.writeText(url); }
  ```
- Inside Capacitor Android the WebView's `navigator.share` may resolve without showing the system sheet on some OEMs; on iOS WKWebView it's blocked outside user gestures triggered from a plain link.
- **No `@capacitor/share` or `@capacitor/clipboard`** is installed today (only `@capacitor/{android, app, browser, cli, core, haptics, keyboard, local-notifications, network, push-notifications, splash-screen, status-bar}` plus the in-repo plugins).
- **Follow-up:** **F-4** (`.local/tasks/task-181.md`) — install + branch on `Capacitor.isNativePlatform()` for Share + Clipboard, keep web behaviour intact.

### C2-07 — `navigator.vibrate(...)` instead of `@capacitor/haptics`

- `client/src/components/NotificationProvider.tsx:297-304, 543` calls `navigator.vibrate([...])` for incoming-message buzz.
- `@capacitor/haptics@8` IS installed but unused for these notification cues.
- The web Vibration API is **not exposed** at all in iOS Safari / WKWebView, and on Android-13+ it requires the `VIBRATE` permission to be foreground-active — `@capacitor/haptics` handles both correctly via the platform haptic engine.
- **Follow-up:** **F-4** (`.local/tasks/task-181.md`) — same task, native-parity sweep.

### C2-08 — Auth tokens / wallet PIN in `localStorage`

- Multiple call-sites read/write auth state from `window.localStorage` (sweep via `rg "localStorage" client/src` returns hits in `permission-catalogue`, `pwa-detect`, `notifications`, etc — and the wallet PIN flow uses it too).
- Android's WebView clears `localStorage` under low-storage conditions and on "Clear data" → silent logout & PIN reset.
- iOS WKWebView eviction policy is even more aggressive (after 7 days of inactivity for non-installed PWAs).
- **No `@capacitor/preferences`** installed today.
- **Follow-up:** **F-5** (folded into `.local/tasks/task-181.md` § "Phase 2") — install `@capacitor/preferences`, route auth token + wallet PIN through it on native, fall back to `localStorage` on web.

### C2-09 — No edge-to-edge / display-cutout handling in CSS

- `index.css` has zero `env(safe-area-inset-*)` references (sweep returned 0).
- `capacitor.config.ts` sets `StatusBar.overlaysWebView: false` which paints a 24-dp letterbox under the status bar on Android — fine for now, but on Android 15 (released 2024) the OS will *force* edge-to-edge regardless and the app will collide with the time/notification icons unless we add safe-area padding to the top of every fixed surface (sticky header, bottom nav, modal headers).
- **Follow-up:** **F-2** (`.local/tasks/task-179.md`) also covers an edge-to-edge mini-pass; if it grows larger, it can split off.

### C2-10 — xxs (≤ 360 px) breakpoint not exercised

- Tournament cards, leaderboard rows, and wallet balance breakdown rely on Tailwind's `sm` (640 px) as the smallest "phone-ish" breakpoint.
- Devices in the `xxs` bucket (Galaxy A03 Core, old Redmi 9A) are common in MENA — VEX's primary market.
- No Playwright fixture currently runs at 360 px width.
- **Follow-up:** rolled into **F-2** (`.local/tasks/task-179.md`) or future per-page tasks.

### C3-11 — Update-banner DOM bypasses i18n direction + theming

- `client/src/main.tsx:150-203` builds the update banner via raw `document.createElement` instead of going through React.
- The hard-coded `dir="auto"` and inline-styled "تحديث / Update" text works but ignores the live theme + the user's chosen locale ordering.
- Low priority — visible only when an update lands. Logged for completeness; no immediate follow-up unless paired with a broader refactor.

### C3-12 — In-app browser fallback for SW periodic sync

- `client/src/main.tsx:63-75` registers `periodicSync` with two intervals — Chromium-only API. Safari + iOS PWAs silently miss the cache refresh, which over time means stale assets on iOS users.
- Low priority — deferred until iOS Capacitor build is on the roadmap. No follow-up proposed now.

---

## 1A. Per-callsite permission UX matrix

For each native permission the app requests, this table records: **trigger** (what user action fires the request), **pre-prompt** (does the user see why before the OS dialog?), **denial path** (what happens on first decline), **re-ask gating** (is a "permanently denied" state handled with a deep-link to system settings?), and **callsite**.

| Permission | Trigger | Pre-prompt | Denial path | Re-ask gating | Callsite | Gap |
|---|---|---|---|---|---|---|
| **Microphone** (in-call) | User taps "Accept call" or "Start voice" | ✅ `CallPermissionPrompt` modal with rationale (mic icon + "للتحدث في المكالمة") | Returns to call screen; toast warns the call will be muted | ❌ No "open settings" deep-link if `permanent` | `client/src/lib/native-call-permissions.ts:44-79`, `CallPermissionPrompt.tsx:31-110` | Need settings deep-link for `permanently denied` state — Capacitor's `App.openSettings` is not wired |
| **Camera** (video call / avatar) | User toggles video, or opens avatar editor | ✅ Same `CallPermissionPrompt` modal (camera icon variant) | Falls back to audio-only call; avatar editor disables capture buttons | ❌ Same gap as mic | `client/src/lib/native-call-permissions.ts:80-118` | Same: needs `App.openSettings` deep-link |
| **POST_NOTIFICATIONS** (Android 13+) | First app launch after install (eager) | ❌ **None** — request fires from `client/src/lib/startup-permissions.ts:12-44` before the user has seen the home screen | Nothing user-visible; push silently won't deliver | ❌ No retry, no re-ask UI | `startup-permissions.ts:12-44`, `client/src/lib/native-call-ui.ts:201` | **HIGH PRIORITY**: needs an in-app rationale screen on first run, deferred until after the first meaningful interaction |
| **Push registration** (FCM token) | Eager at startup, after notification permission | N/A (silent) | Logs to console; no UI feedback | N/A | `client/src/lib/push-registration.ts` (referenced from `main.tsx`) | Should retry with exponential backoff on token-fetch failure; today it gives up after 1 attempt |
| **Local Notifications** (incoming-call ringer) | First incoming call | ❌ Permission requested as side-effect of `LocalNotifications.schedule()` — fails silently if denied | Caller hears ringback, callee never sees the heads-up | ❌ No re-ask | `client/src/lib/native-call-ui.ts:160-220` | Should explicitly request + check permission *before* the first call, with rationale |
| **Contacts** | Not currently requested | N/A | N/A | N/A | — | The app has no contacts feature today; if added (e.g. for friend-suggest), needs the full pre-prompt → request → denial-handle → re-ask flow |
| **Location** | Not currently requested | N/A | N/A | N/A | — | Same — not present today; will need pre-prompt if a "tournaments near me" feature is ever built |
| **VIBRATE** (implicit, via `navigator.vibrate`) | Incoming-message buzz | N/A — declared in `AndroidManifest.xml` as install-time permission | N/A on Android, silent no-op on iOS | N/A | `NotificationProvider.tsx:297-304, 543` | Tracked under **C2-07** — switch to `@capacitor/haptics` so the underlying engine handles permission state |
| **READ_PHONE_STATE** (CallKit/ConnectionService) | First call | ❌ Requested implicitly by the in-repo `CallKit` plugin's native code | Plugin throws; JS catches and degrades to in-app ringer | ❌ No re-ask | `android/app/src/main/java/.../CallKitPlugin.kt` (in-repo) + JS bridge `client/src/lib/native-call-ui.ts` | Pre-prompt should explain "to make calls show up like a normal phone call" |

**Summary of gaps the F-2 / F-3 / F-4 follow-ups don't yet cover** — these collapse into a new dedicated follow-up **F-7** (`.local/tasks/task-183.md`):
- No global `App.openSettings` helper for "permanently denied" recovery.
- Eager `POST_NOTIFICATIONS` request at first launch — should be deferred + rationale-gated.
- No retry/back-off on FCM token registration.
- `LocalNotifications` permission requested implicitly inside `schedule()` instead of explicitly.

---

## 1B. Offline / network-resilience matrix

For each major surface, this table records what the user sees with: **(a)** no network at app start, **(b)** network drop mid-session, **(c)** flaky/lossy network. Sources: `rg "navigator.onLine|@capacitor/network|Network\\.addListener|websocket|reconnect" client/src`.

| Surface | Cold start, no network | Mid-session drop | Flaky network | Reconnect strategy | Gap |
|---|---|---|---|---|---|
| **Home / lobby** | SW serves cached shell (precache via `vite-plugin-pwa`); empty tournaments grid with no banner | TanStack Query refetch silently fails; stale data stays on screen | Same — silent | Query-level retry only (TanStack default) | **No global offline indicator.** `@capacitor/network` IS installed but not bound to a top-level banner. |
| **Chat (1:1 + room)** | Composer is enabled, but send fails silently — no queueing | Socket.IO client auto-reconnects (default 5 attempts, exponential); messages typed during the gap are *lost* | Messages may arrive out-of-order; no client-side dedup keyed by `clientMsgId` | Socket.IO defaults; no UI for "sending..." vs "sent" vs "failed" | **No outbox / pending-message queue.** Need an indicator + retry button on each failed message bubble. |
| **Live game (Domino, Chess, etc.)** | Game board mounts but no `GAME_STATE_SYNC` event arrives → infinite spinner with no error message | Socket.IO reconnect succeeds; **but** there is no resync RPC to recover missed moves between disconnect and reconnect — game can desync | Move latency spikes manifest as "your turn" indicator flickering | Socket.IO defaults + per-game ad-hoc handling | **No deterministic resync.** Server should send a `GAME_RESYNC` snapshot on every socket reconnect; client should request one on `Network` change-to-online. |
| **Voice/video call (LiveKit)** | LiveKit room join fails with raw error code in console — no Arabic-friendly error UI | LiveKit's built-in ICE restart triggers; if TURN is also unreachable the call drops with a generic "Disconnected" toast | Audio choppy; no visible quality indicator | LiveKit handles ICE; TURN fail-over to `transport=tcp` is already in `PUBLIC_RTC_TURN_URLS` | **No call-quality HUD** (RTT, packet loss). Add a small indicator + a "Reconnecting…" banner specifically for the call surface. |
| **Wallet** | Cached balance shown if `react-query` hydration restored it; otherwise empty card | Mutations queue in TanStack Query but no UI feedback that "transfer is pending" | Same | TanStack Query optimistic updates, but no rollback UI on failure | Need a network-aware mutation banner in the wallet flow. |
| **Tournament join / register** | Button disabled visually only because the API call returns no response — confusing UX | Mutation throws after timeout; toast appears | Same | Single retry by TanStack default | Should disable the join button on `Network.addListener('networkStatusChange', { connected: false })`. |

**Cross-cutting gap:** `@capacitor/network` is installed but only consulted in two places (`client/src/lib/connection-monitor.ts` and the call-quality logger). It's not bound to:
- A global offline banner.
- The Socket.IO client's reconnect trigger.
- The chat outbox / live-game resync described above.

**Follow-up:** **F-7** (`.local/tasks/task-183.md`) absorbs the offline-resilience UX gaps; the deeper "Socket.IO resync protocol" + "LiveKit call-quality HUD" are sized as their own future follow-ups (noted in § 2 but not yet split out, to keep #178-#183 reviewable).

---

## 1C. Build & signing integrity verification

This task wired the Android release-signing pipeline to environment-only secrets. The verification trail below documents *what was checked* and *what to check on the next release*, since `android/` is gitignored (so the signing block isn't in the visible diff for this task — that's intentional).

### What was verified in this task

1. **`scripts/mobile-android-build.mjs`** — rewritten to:
   - Refuse to start a release build unless all four `ANDROID_*` env vars are populated (fails fast with a friendly error before any gradle invocation).
   - **Grep `android/app/build.gradle` for the literal string `ANDROID_KEYSTORE_PASSWORD`** to confirm the gradle file pulls from `System.getenv(...)`. If the grep fails, the script aborts with: *"build.gradle does not reference ANDROID_KEYSTORE_PASSWORD — see docs/mobile/android-signing-gradle-snippet.md"*.
   - Passes the four secrets as **process env to gradle only** — no temp file, no `signing.properties`, no `local.properties` write.
2. **`capacitor.config.ts`** — every `password` / `keystorePassword` / `signingPassword` field has been removed from `android.buildOptions` (the Capacitor CLI would have materialized those into `signing.properties` on disk during `cap sync`).
3. **`docs/mobile/android-signing-gradle-snippet.md`** — canonical `signingConfigs.release { storeFile … storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD") … }` block, kept in-repo so any contributor regenerating `android/` from `cap add android` knows exactly what to paste back in.
4. **`.gitignore`** — verified the keystore directory pattern (`android/keystore/`) and the four classic leak vectors (`*.jks`, `*.keystore`, `signing.properties`, `local.properties`) are all ignored.
5. **`.env.example`** — the four `ANDROID_*` keys + `LIVEKIT_*` + `TURN_PASSWORD` + `PUBLIC_RTC_TURN_CREDENTIAL` are now `__REDACTED_USE_REPLIT_SECRETS__` placeholders.
6. **Replit Secrets** — confirmed the four `ANDROID_*` secrets are present in the workspace's secret store (no values inspected, only existence).

### What the next release run must verify (acceptance checks for F-1)

The `android/` directory is gitignored on this repo, so the gradle signing block is **not** in this task's diff. The next time anyone runs `cap add android` (or pulls down a freshly-generated native shell), they MUST:

- **(B-1)** Paste the snippet from `docs/mobile/android-signing-gradle-snippet.md` into `android/app/build.gradle` under `android { signingConfigs { release { … } } }`.
- **(B-2)** Run `node scripts/mobile-android-build.mjs --check` (the script's grep step) and confirm it exits 0.
- **(B-3)** Run `./gradlew :app:bundleRelease` with the four `ANDROID_*` env vars set; confirm the resulting `.aab` is signed with alias `vex_release_official` via `keytool -list -v -keystore android/keystore/vex-release-official.jks` and matching SHA-1 `7F:8D:A0:CB:12:42:1A:7F:90:6D:43:2E:6C:C2:96:1A:DD:AE:C8:B8`.
- **(B-4)** `git status` on `android/` — should be clean, no `signing.properties` or `local.properties` written.
- **(B-5)** Upload the `.aab` to the Play Console internal track; confirm the upload signature matches the existing app on Play Console (otherwise existing installs will refuse the update — the whole reason rotation in F-1 is dangerous and gated).

### Why these checks live here, not in the diff

`android/` is gitignored to avoid drifting native code that has to be regenerated by `cap add android` anyway. The signing block lives in `docs/mobile/android-signing-gradle-snippet.md` so it's tracked, reviewable, and re-pasteable. The build script's grep is the runtime backstop that keeps a future drifted shell from silently signing with hardcoded passwords.

---

## 2. Recommended follow-ups (proposed as separate tasks, one plan file each)

The list below has been converted into individual project-task plan files under `.local/tasks/`. Sequenced perf-first per the user's stated preference, with the security item promoted to P0 because it's the only finding that can't sit on the backlog.

| # | Title | Severity | Plan file | Touches |
|---|---|---|---|---|
| **F-1** | **Rotate Android keystore + LiveKit + TURN passwords + scrub leaked secrets from git history** | C0 | `.local/tasks/task-178.md` | Keystore (`keytool -storepasswd`/`-keypasswd`), LiveKit + TURN credentials, Replit Secrets, `git filter-repo` (with explicit user approval). |
| **F-2** | **Boot & smoothness sweep — splash hand-off, animation budget, edge-to-edge, xxs breakpoint** | C1 | `.local/tasks/task-179.md` | `capacitor.config.ts` (splash), `client/src/main.tsx` (manual hide + `performance.mark`), `index.css` (replace `transition-all`, add `will-change`, `env(safe-area-inset-*)`). |
| **F-3** | **Reconcile `Keyboard.resize` config with `useKeyboardInset` invariant** | C1 | `.local/tasks/task-180.md` | `capacitor.config.ts:50` (`'body'` → `'none'`), regression test, real-device note. |
| **F-4** | **Native-parity sweep — Share, Clipboard, Vibration, Preferences → Capacitor plugins** | C2 | `.local/tasks/task-181.md` | `npm i @capacitor/share @capacitor/clipboard @capacitor/preferences`, replace `navigator.share` / `navigator.clipboard` / `navigator.vibrate`, route auth token + wallet PIN through preferences. |
| **F-6** | **Lazy-split `framer-motion` per game board** | C2 | `.local/tasks/task-182.md` | Dynamic-import each game board so the lobby and chat surfaces don't pay the framer-motion cost. |
| **F-7** | **Permission UX hardening + offline-resilience indicators** | C1 | `.local/tasks/task-183.md` | Defer eager `POST_NOTIFICATIONS`, add `App.openSettings` deep-link, explicit `LocalNotifications` permission check, global offline banner bound to `@capacitor/network`. |

Note: F-5 (auth/PIN secure storage) was folded into F-4 Phase 2 because both share the `@capacitor/preferences` install + branching helper.

---

## 3. Things deliberately NOT in this audit

- The chat-composer-over-keyboard QA (Task #117 in flight + checklist at `docs/device-tests/android-keyboard-composer-2026-04.md`).
- The permissions-banner-over-modal overlap test (already proposed as a follow-up before this task).
- The native permission-prompt UX (already proposed as a follow-up before this task).
- The z-index hierarchy doc (already proposed as a follow-up before this task).
- The actual Android release-build pipeline (covered by Task #124).
- Deep Socket.IO resync protocol design + LiveKit call-quality HUD — flagged in § 1B as future follow-ups, not split out yet to keep the F-1..F-7 batch reviewable.

These are tracked elsewhere — flagging them here only so the next planner doesn't duplicate.
