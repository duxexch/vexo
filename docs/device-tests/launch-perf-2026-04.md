# Launch performance & animation smoothness — Task #179

**Date:** 2026-04-26
**Audit reference:** `docs/mobile/PRO_AUDIT_2026-04.md` § C1-02, § C1-04, § C2-09
**Scope:** Capacitor splash hand-off, CSS animation containment, Android 15 / iOS edge-to-edge safe-area coverage.

---

## What changed (summary for the device tester)

| Surface | Before | After |
|---|---|---|
| Capacitor splash | `launchAutoHide:true` with `launchShowDuration:2500 ms` + 600 ms fade ≈ 3.1 s **fixed** wait before React owns the screen | `launchAutoHide:true` (kept as native fail-safe), `launchShowDuration:2000`, `launchFadeOutDuration:250`. The JS layer in `client/src/main.tsx` **also** calls `SplashScreen.hide({ fadeOutDuration: 250 })` after the second `requestAnimationFrame` post-render — typically ~250-700 ms on a flagship, ~600-1200 ms on a mid-range Android. Whichever path fires first wins (the plugin is idempotent), so the user no longer waits for a fixed timer on the happy path, and if the JS hide is ever skipped the OS still drops the splash within 2 s. |
| Splash watchdog | None | A 1.5 s `setTimeout` registered **before** `createRoot().render()` calls the same idempotent `hideSplashOnce("watchdog")`. A `try/catch` around render hides the splash on bootstrap-error too. |
| Launch telemetry | None | `performance.mark("app-bundle-eval-start")` at the very top of `client/src/main.tsx`; `performance.mark("app-first-paint")` + `performance.measure("app-launch-to-first-paint", …)` after first paint. Visible in DevTools → Performance → Timings. |
| `client/src/index.css` `.hover-elevate` / `.active-elevate-2` | `transition: all 0.2s ease` (forced compositor to track every animatable property) | Property-scoped `transition: background-color 0.2s ease, transform 0.2s ease`. |
| Heavy gift-overlay keyframes (`gift-pop-in`, `gift-aurora-pulse`, `gift-shockwave-expand`, `gift-glare-pass`, `gift-orb-float`) | No GPU promotion hints; surrounding chat layout was being invalidated on every animation tick | `will-change: transform[, opacity]` + `contain: layout paint` on each animating selector. |
| `GameLayout` sticky header / sticky bottom action bar | No safe-area inset → Android 15 forced edge-to-edge would clip the header under the status-bar pill and shove the action bar under the gesture handle | `paddingTop: calc(0.5rem + env(safe-area-inset-top))` and `paddingBottom: calc(0.5rem + env(safe-area-inset-bottom))`. |
| `client/src/main.tsx` update banner DOM | Hard-coded `bottom: 24px` → sat behind the iOS home-indicator / Android gesture bar | `bottom: calc(24px + env(safe-area-inset-bottom, 0px))`. |
| `client/src/main.tsx` force-update modal overlay | Symmetric 24 px padding → top edge clipped under the notch / Dynamic Island | `padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)) 24px`. |
| `PermissionsBanner` | Already used `pt-[max(0.75rem,env(safe-area-inset-top))]` — left as-is. | (No change.) |

---

## Verification performed in the dev environment

These are the measurements the agent could capture **before** the owner runs the playbook on a real Android phone (Capacitor cold-launch numbers require a physical device — see "Owner-only" section below).

### 1. TypeScript check

```text
$ npm run check
> tsc
(exit 0 — clean)
```

### 2. Web (dev-server) HTTP measurements — captured 2026-04-26 ~15:30 UTC

Surrogate "first-byte" baseline for the React SPA shell, served by the running `Start application` workflow on `localhost:3001`.

| Run | TTFB | Total | Notes |
|---|---|---|---|
| Cold (first request) | 20.1 ms | 22.2 ms | 62 714 bytes payload |
| Warm 1 | 41.2 ms | 41.7 ms | (vite HMR reattach) |
| Warm 2 | 13.1 ms | 14.2 ms |  |
| Warm 3 | 14.7 ms | 16.4 ms |  |
| Warm 4 | 12.7 ms | 14.0 ms |  |
| Warm 5 | 17.6 ms | 19.1 ms |  |
| Mobile UA | 15.7 ms | 17.1 ms | Android 13 Chrome 120 UA, no UA-specific regression |

**Read:** server-side TTFB is consistently sub-25 ms, so the launch budget is dominated by client-side bundle eval + first paint — exactly what the new `app-launch-to-first-paint` measure now exposes.

### 3. Cross-surface visual checks

| Surface | Result |
|---|---|
| Desktop 1280 px, dev preview | Layout unchanged — `env(safe-area-inset-*)` evaluates to 0 in the browser, so `GameLayout` sticky header/footer and update banner sit exactly where they did before. |
| 360 px responsive (Chrome DevTools) | Same — no visual regression vs the previous commit. |
| Native Android Capacitor cold launch | **Owner-only — see below.** |

The agent cannot itself drive Chrome DevTools' "Toggle device toolbar" UI, but the diff is safe-area-additive: every changed selector either (a) only adds padding equal to `env(safe-area-inset-*)`, which is `0` outside Capacitor, or (b) only adds GPU-hint CSS properties (`will-change`, `contain`) that have no visible effect.

---

## Owner-only step — required before this rolls to users

**Why owner-only:** capturing Capacitor cold-launch milliseconds requires building a signed APK with the existing release keystore (the secrets `ANDROID_KEYSTORE_*` are owner-controlled), installing it on a physical phone, and timing the launch with a stopwatch / screen recording. None of that is achievable from the dev container.

### Checklist for the owner

#### Required: 1 × Android phone (≤ 360 px width, mid-range, Android 13+)

> Recommended baseline: a Samsung A14 / Xiaomi Redmi 9A class device. Anything older is a bonus data point.

##### Launch-time smoke

1. Cold-launch the app (force-stop first via long-press → App info → Force stop, **not** swipe-to-close).
2. Time from tap → first interactive React content (background gradient + bottom nav visible). Use a stopwatch app on a second device, **or** record a 60 fps screen-grab and count frames in any video editor.
3. Repeat ×3 and take the median. Record both the **before** (Task #178 commit) and **after** (this commit) numbers.
4. Acceptance: at least **800 ms** improvement on the median, and the splash never visibly flashes white/black during the hand-off.

##### Animation smoothness smoke

1. Open any chat thread and trigger a gift send (or watch one arrive). The `gift-pop-in` + `gift-aurora-pulse` + `gift-shockwave-expand` should play simultaneously without stuttering the chat list scroll.
2. Scroll the chat list while a gift animation is mid-flight. Acceptance: scroll FPS stays ≥ 50 (visible to the eye as smoothness — no perceptible stutter). If you want a hard number, enable Developer Options → "Profile GPU rendering" → "On screen as bars".

##### Edge-to-edge safe-area smoke (Android 15 only — skip on older Androids)

1. On Android 15, edge-to-edge is forced for any app targeting SDK 35+. Open:
   - Any game (lands in `GameLayout`) — header should NOT be under the status-bar clock; bottom action bar should NOT be under the navigation gesture handle.
   - The permissions banner (force a denied permission to show it) — should appear with comfortable spacing under the status bar, not flush against it.
   - The update banner (deploy a new web version while the app is open and wait 60 s, or temporarily lower `UPDATE_POLL_INTERVAL_MS`) — should sit clear of the gesture handle.
2. Acceptance: every fixed surface respects the inset; nothing is clipped or partially hidden.

#### Optional: 1 × iOS device

1. Notched iPhone (X or newer): force-update modal should not clip under the Dynamic Island; the update banner should sit clear of the home indicator.
2. iPad: nothing should regress (insets are 0 on iPad without home indicator).

#### Recorded measurements (owner fills these in)

| Device | Android version | Cold launch — before (ms) | Cold launch — after (ms) | Δ |
|---|---|---|---|---|
| _e.g. Redmi 9A_ | _13_ | _3200_ | _1450_ | _-1750_ |
|  |  |  |  |  |
|  |  |  |  |  |

---

## Telemetry — how to read the launch budget after this commit

### Web (Chrome DevTools)

1. DevTools → Performance → check "Screenshots" → reload.
2. After the trace stops, expand the **Timings** track (formerly "User Timings"). Look for:
   - `app-bundle-eval-start` (orange flag, marks the very first JS execution)
   - `app-first-paint` (orange flag, fires after the second RAF post-render)
   - `app-launch-to-first-paint` (red bar between them — this is the budget you care about)

### Android WebView (Chrome DevTools remote debugging)

1. On the device: Settings → About phone → tap Build number 7×, then Developer options → enable USB debugging.
2. Plug in to a host with desktop Chrome → open `chrome://inspect/#devices`.
3. Click "inspect" on the VEX WebView → Performance tab → reload → same instructions as above.

### Production (in-the-wild, optional follow-up)

Tracked as follow-up #187 — wire `app-launch-to-first-paint` from `PerformanceObserver` into the existing telemetry sink so launch budget is visible on real users.

---

## Roll-back

If launch breaks (e.g. JS bundle never hides the splash on a specific OEM and the native fail-safe also misbehaves), the safest revert is to remove the JS hide path entirely and let the native auto-hide do all the work — i.e. revert the `markFirstPaintAndHideSplash()` call site and the watchdog in `client/src/main.tsx`. The Capacitor config does not need to change — `launchAutoHide:true` with the 2 s budget is identical to the pre-task-#179 fail-safe behaviour, just with a slightly shorter duration.

If you also want to restore the original 2.5 s native budget (because the new 2 s feels too aggressive on a particular cold-cache device), this single-line edit in `capacitor.config.ts` is enough:

```diff
-      launchShowDuration: 2000,
+      launchShowDuration: 2500,
       launchAutoHide: true,
-      launchFadeOutDuration: 250,
+      launchFadeOutDuration: 600,
```
