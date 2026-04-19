# Game Icon and Background Route Matrix (2026-04-19)

## Purpose

This inventory lists all user/admin routes that render game icons and/or per-game background visuals, and the data source they depend on.

It is designed so Admin updates (icon or background) propagate immediately after cache invalidation.

## Canonical Data Sources

- Multiplayer game media: `/api/multiplayer-games`
  - icon: `iconName` or `iconUrl`
  - background: `thumbnailUrl`
- External game media: `/api/external-games`
  - icon: `iconUrl`
  - background: `thumbnailUrl`

## Route Inventory

| Route | Page | Icon | Background | Source |
|---|---|---|---|---|
| `/games` | `client/src/pages/games-catalog.tsx` | Yes | Yes | `/api/multiplayer-games`, `/api/external-games` |
| `/arcade` | `client/src/pages/games-catalog.tsx` | Yes | Yes | `/api/multiplayer-games`, `/api/external-games` |
| `/lobby` | `client/src/pages/game-lobby.tsx` | Yes | Yes | `/api/multiplayer-games` |
| `/challenges` | `client/src/pages/challenges.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/challenge/:id/play` | `client/src/pages/challenge-game.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/challenge/:id/watch` | `client/src/pages/challenge-watch.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/tournaments` | `client/src/pages/tournaments.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/tournaments/:id` | `client/src/pages/tournaments.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/games/history` | `client/src/pages/game-history.tsx` | Yes | No (icon image only) | `/api/multiplayer-games` |
| `/leaderboard` | `client/src/pages/leaderboard.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/profile` | `client/src/pages/player-profile.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/player/:userId` | `client/src/pages/player-profile.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/multiplayer` | `client/src/pages/multiplayer.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |
| `/admin/games` | `client/src/pages/admin/admin-unified-games.tsx` | Yes | Yes | `/api/admin/multiplayer-games`, `/api/admin/games` |
| `/admin/external-games` | `client/src/pages/admin/admin-external-games.tsx` | Yes | Yes | `/api/admin/external-games` |
| `/admin/tournaments` | `client/src/pages/admin/admin-tournaments.tsx` | Yes | No (icon surface only) | `/api/multiplayer-games` |

## Real-Time Sync Contract

When icon/background is changed from Admin:

1. Admin mutation updates database.
2. Client invalidates admin caches and public caches.
3. All mounted pages using these query keys refetch immediately.
4. Navigated pages refetch because query is stale.

### Required invalidation keys

- `/api/multiplayer-games`
- `/api/config-version/multiplayer_games_version`
- `/api/external-games`
- plus admin keys (`/api/admin/multiplayer-games`, `/api/admin/games`, `/api/admin/external-games`)
