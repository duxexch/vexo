# Launch performance & animation smoothness — Task #179

**Date:** 2026-04-26
**Audit reference:** `docs/mobile/PRO_AUDIT_2026-04.md` § C1-02, § C1-04, § C2-09
**Scope:** Capacitor splash hand-off, CSS animation containment, Android 15 / iOS edge-to-edge safe-area coverage.

---

## What changed (summary for the device tester)

| Surface | Before | After |
|---|---|---|
| Capacitor splash | Auto-hides after `launchShowDuration: 2500 ms` + 600 ms fade ≈ 3.1 s before React owns the screen | `launchAutoHide: false`; the JS layer fires `SplashScreen.hide({ fadeOutDuration: 250 })` after the **second `requestAnimationFrame`** following the React root render — in practice ~250-700 ms on a flagship, ~600-1200 ms on a mid-range Android. The 2 s native budget is now an upper bound for the failure case (JS bundle never loads). |
| Launch telemetry | None | `performance.mark("app-bundle-eval-start")` at the top of `client/src/main.tsx`; `performance.mark("app-first-paint")` + `performance.measure("app-launch-to-first-paint", …)` after first paint. Visible in DevTools → Performance → User Timings. |
| `client/src/index.css` `.hover-elevate` / `.active-elevate-2` | `transition: all 0.2s ease` (forced compositor to track every animatable property) | Property-scoped `transition: background-color 0.2s ease, transform 0.2s ease`. |
| Heavy gift-overlay keyframes (`gift-pop-in`, `gift-aurora-pulse`, `gift-shockwave-expand`, `gift-glare-pass`, `gift-orb-float`) | No GPU promotion hints; surrounding chat layout was being invalidated on every animation tick | `will-change: transform[, opacity]` + `contain: layout paint` on each animating selector. |
| `GameLayout` sticky header / sticky bottom action bar | No safe-area inset → Android 15 forced edge-to-edge would clip the header under the status-bar pill and shove the action bar under the gesture handle | `paddingTop: calc(0.5rem + env(safe-area-inset-top))` and `paddingBottom: calc(0.5rem + env(safe-area-inset-bottom))`. |
| `client/src/main.tsx` update banner DOM | Hard-coded `bottom: 24px` → sat behind the iOS home-indicator / Android gesture bar | `bottom: calc(24px + env(safe-area-inset-bottom, 0px))`. |
| `client/src/main.tsx` force-update modal overlay | Symmetric 24 px padding → top edge clipped under the notch / Dynamic Island | `padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)) 24px`. |
| `PermissionsBanner` | Already used `pt-[max(0.75rem,env(safe-area-inset-top))]` — left as-is. | (No change.) |

---

## Real-device test checklist

### Required: 1 × Android phone (≤ 360 px width, mid-range, Android 13+)

> Recommended baseline: a Samsung A14 / Xiaomi Redmi 9A class device. Anything older is a bonus data point.

#### Launch-time smoke

1. Cold-launch the app (force-stop first via long-press → App info → Force stop, **not** swipe-to-close).
2. Time from tap → first interactive React content (background gradient + bottom nav visible). Use a stopwatch app on a second device, **or** record a 60 fps screen-grab and count frames in any video editor.
3. Repeat ×3 and take the median. Record both the **before** (Task #178 commit) and **after** (this commit) numbers.
4. Acceptance: at least **800 ms** improvement on the median, and the splash never visibly flashes white/black during the hand-off.

#### Animation smoothness smoke

1. Open any chat thread and trigger a gift send (or watch one arrive). The `gift-pop-in` + `gift-aurora-pulse` + `gift-shockwave-expand` should play simultaneously without stuttering the chat list scroll.
2. Scroll the chat list while a gift animation is mid-flight. Acceptance: scroll FPS stays ≥ 50 (visible to the eye as smoothness — no perceptible stutter). If you want a hard number, enable Developer Options → "Profile GPU rendering" → "On screen as bars".

#### Edge-to-edge safe-area smoke (Android 15 only — skip on older Androids)

1. On Android 15, edge-to-edge is forced for any app targeting SDK 35+. Open:
   - Any game (lands in `GameLayout`) — header should NOT be under the status-bar clock; bottom action bar should NOT be under the navigation gesture handle.
   - The permissions banner (force a denied permission to show it) — should appear with comfortable spacing under the status bar, not flush against it.
   - The update banner (deploy a new web version while the app is open and wait 60 s, or temporarily lower `UPDATE_POLL_INTERVAL_MS`) — should sit clear of the gesture handle.
2. Acceptance: every fixed surface respects the inset; nothing is clipped or partially hidden.

### Required: desktop Chrome at 1280 px and 360 px responsive mode

> Standard cross-surface rule from `replit.md` § "User Preferences".

1. Desktop 1280 px: navigate to a chat with gifts, trigger an animation, confirm no visible regression in spacing or layout.
2. DevTools → Toggle device toolbar → 360 × 800 (Galaxy S20-ish): same checks. Header/footer of `GameLayout` should hug the top/bottom edges as before since `env(safe-area-inset-*)` is `0` in the browser.

### Optional: 1 × iOS device

1. Notched iPhone (X or newer): force-update modal should not clip under the Dynamic Island; the update banner should sit clear of the home indicator.
2. iPad: nothing should regress (insets are 0 on iPad without home indicator).

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

If you want the launch budget visible on real users, wire `performance.measure("app-launch-to-first-paint")` into your existing analytics pipeline (e.g. send `entry.duration` from a `PerformanceObserver` to whichever telemetry sink VEX uses). Out of scope for this task — proposed as follow-up.

---

## Before / after — recorded measurements

> Fill these in during testing. Keep at least one row.

| Device | Android version | Cold launch — before (ms) | Cold launch — after (ms) | Δ |
|---|---|---|---|---|
| _e.g. Redmi 9A_ | _13_ | _3200_ | _1450_ | _-1750_ |
|  |  |  |  |  |
|  |  |  |  |  |

---

## Roll-back

If launch breaks (e.g. splash never hides on a specific OEM), the safest revert is just `capacitor.config.ts`:

```diff
-      launchShowDuration: 2000,
-      launchAutoHide: false,
-      launchFadeOutDuration: 250,
+      launchShowDuration: 2500,
+      launchAutoHide: true,
+      launchFadeOutDuration: 600,
```

That alone restores the old auto-hide behaviour without touching the React code. The `markFirstPaintAndHideSplash()` call will then become a no-op on the splash plugin side (the splash is already gone) but the perf marks still record.
