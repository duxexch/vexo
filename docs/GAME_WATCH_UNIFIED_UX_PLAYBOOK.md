# Game Watch Unified UX Playbook

## Purpose

Use one consistent spectator experience across all games (current and future) with no legacy UI forks.

## Non-Negotiable Rules

1. One design path only: remove old/parallel watch layouts when introducing new UX.
2. Mobile-first behavior: all watch surfaces must work on narrow phones first, then scale up.
3. Spectator parity rule: watch mode must consume normalized read-only live view data, not ad-hoc raw state.
4. No dead code in touched areas: remove unused props, stale toggles, and obsolete rendering branches.

## Layout Standards (Applied to Domino, Reusable for New Games)

1. Main game area

- Board zone should use wide horizontal space on watch pages (avoid narrow card-only layout for board-heavy games).
- Player strips above and below board stay aligned to the same visual lane as the board.

1. Fixed action controls

- Gift and Support actions are floating circular buttons.
- Buttons are fixed to viewport (must not move with page scroll).
- Use soft pulse animation only (subtle, not aggressive).
- Keep disabled visual state for unavailable actions.

1. Spectator side panel

- Must include:
  - Viewer count
  - Support count
  - Support total value
  - Gift count
  - Gift total value
  - Challenge chat feed between players
- Chat feed should be scrollable independently inside panel.

1. Gift flow

- Full-screen gift panel must be one-screen UX:
  - Header fixed
  - Footer/actions fixed
  - Only gift list area scrolls

## Data Contract Guidelines

1. Watch chat

- Keep bounded in memory (cap recent messages).
- Prefer participant-filtered messages for "players chat" section.

1. Gift aggregates

- Track cumulative gift count and cumulative value from live gift events.
- Keep transient gift animation data separate from aggregate counters.

1. Support aggregates

- Derive support count and total value from challenge supports feed/query.

## Integration Checklist For Any New Game

1. Normalize server view to a read-only spectator model.
2. Render game board in the unified watch lane (wide where gameplay needs it).
3. Wire floating circular Gift/Support controls.
4. Feed SpectatorPanel with chat + support/gift aggregates.
5. Ensure gift modal follows one-screen fixed-header/footer behavior.
6. Remove any legacy watch widgets replaced by the new system.

## Verification Checklist (Before Merge/Release)

1. `npx tsc --noEmit` passes.
2. Docker rebuild/recreate succeeds.
3. `GET /api/health` returns 200.
4. Watch route returns 200.
5. Root route returns 200.
6. Visual check:

- Board fills horizontal lane (especially on mobile).
- Floating circular buttons remain fixed while scrolling.
- Spectator panel shows chat + all requested aggregate counters.

## Regression Guardrails

1. If old HUD/status strips reappear, check for stale props and stale bundles.
2. If watcher UI diverges by game, align to this playbook before adding game-specific polish.
3. Keep this document as the baseline for all future game onboarding and watch-mode refactors.
