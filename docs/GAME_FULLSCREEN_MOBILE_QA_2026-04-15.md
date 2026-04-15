# Game Fullscreen Mobile QA - 2026-04-15

## Scope

- Standalone game pages:
  - Chess
  - Domino
  - Backgammon
  - Tarneeb
  - Baloot

- Shared fullscreen primitives:
  - `use-game-fullscreen` hook
  - `GameFullscreenActionDock`
  - fullscreen shell and dock CSS

## Quick Mobile UX Matrix

- Phone viewport baseline targets:
  - 360x640 (small Android)
  - 390x844 (modern phone)
  - 412x915 (large phone)

- Core expectations per game:
  - Enter fullscreen control exists and remains >= 44x44 touch target.
  - Header hides in fullscreen to prioritize board lane.
  - Bottom action dock remains reachable with safe-area spacing.
  - Explicit exit action remains fixed and always reachable.
  - Essential role-safe actions only (no spectator escalation).

## Automated Mobile UX Smoke (Executed)

1. `npm run quality:mobile:domino`
   - Result: PASS

2. `npm run quality:mobile:fullscreen`
   - Result: PASS
   - Verifies per-game fullscreen essentials, safe-area shell behavior, dock overflow handling, and fallback exit behavior.

3. `npm run quality:mobile:fullscreen:android-back`
   - Result: PASS
   - Verifies Android-style back-button fullscreen guard path on challenge + standalone surfaces.

## Runtime and Type Safety (Executed)

1. `npx tsc --noEmit`
   - Result: PASS (no type errors)

2. Server boot (`npx tsx server/index.ts`) with local env vars
   - Result: Booted

3. Root health check (`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/`)
   - Result: 200

## UX Hardening Added in This Pass

- Dock touch targets upgraded to 44x44 (`h-11 w-11`) for all fullscreen actions.
- Dock now supports horizontal overflow handling on narrow phones (`overflow-x-auto` + width cap).
- Fullscreen shell now adds bottom safe-area reserve and scroll padding to prevent dock overlap on small devices.
- Added fallback `Escape` exit handling for immersive fullscreen mode.
- Added history guard handling so Android back exits fullscreen first before leaving gameplay route.

## Remaining Optional Manual Device Sweep

- Optional real-device tap pass on Android APK/AAB shell:
  - Verify gesture comfort with one-handed reach.
  - Verify no action overlap with native bottom gesture area.
  - Verify visible board lane while dock is present.
