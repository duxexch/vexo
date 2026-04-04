---
description: "Use when editing game UI in challenge/watch flows for VEX. Applies shared standards for gameplay surfaces, spectator UX, timers, role-based visibility, mobile-first behavior, and i18n-safe game interactions."
name: "VEX Game UI Standards"
applyTo:
  - client/src/components/games/**/*.tsx
  - client/src/pages/challenge-game.tsx
  - client/src/pages/challenge-watch.tsx
---
# VEX Shared Game UI Standards

## Core UX Rules
- Maintain one unified watch/challenge design path; do not keep legacy parallel widgets in touched areas.
- Keep game board lane visually coherent and wide enough for board-heavy games.
- Ensure fixed action controls (gift/support) stay fixed to viewport in watch pages.
- Keep spectator panel behavior consistent with shared product expectations.

## Role-Based Rendering
- Drive gameplay actions by server-assigned role, not local assumptions.
- Spectator mode must be read-only for moves and player-only actions.
- Never expose player-only controls to spectators due to UI fallback states.

## Timer and Turn Integrity
- Timer display must reflect authoritative server state and active turn rules.
- Avoid dual conflicting timer logic paths in the same surface.
- Keep turn indicators consistent between challenge and watch contexts.

## Chat, Gifts, and Support
- Preserve integrated spectator interactions (chat/gifts/support) where the product expects them.
- Keep aggregate counters accurate and separate from transient animation states.
- Avoid blocking gameplay rendering because of side-panel interaction failures.

## Mobile-First Requirements
- Validate narrow phone layouts first, then scale to tablet/desktop.
- Avoid horizontal overflow for core gameplay lanes unless intentional and tested.
- Ensure touch targets remain accessible and stable during animations.

## i18n and Content Rules
- Do not hardcode user-facing strings in components; use translation keys.
- Ensure any added labels/messages are localizable and consistent with existing game terms.

## Code Hygiene in Touched Areas
- Remove dead branches, stale props, and unused imports in edited sections.
- Prefer minimal deterministic diffs that preserve existing architecture.

## References
- [Unified watch UX playbook](../../docs/GAME_WATCH_UNIFIED_UX_PLAYBOOK.md)
- [Challenge/game permissions audit baseline](../../docs/CHALLENGE_PERMISSIONS_AUDIT_2026-03-30.md)
