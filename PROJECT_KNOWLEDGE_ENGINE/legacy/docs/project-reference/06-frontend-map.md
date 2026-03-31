# 06 - Frontend Map

## Frontend entry and composition

- Entry: `client/src/main.tsx`
- App shell and routing: `client/src/App.tsx`

Main app providers assembled in app shell:

1. Query client provider
2. Auth provider
3. i18n provider
4. settings provider
5. theme provider
6. notifications providers

## Route-level structure

Folder: `client/src/pages/`

User-facing route groups include:

- auth and dashboard
- games and game-player views
- challenges and challenge game/watch views
- chat/support/social pages
- wallet/transactions/p2p pages
- profile, leaderboards, tournaments, rewards

Admin route pages are under:

- `client/src/pages/admin/*`

## Frontend service modules (`client/src/lib/`)

- `auth.tsx`: authentication state and session bootstrapping.
- `queryClient.ts`: fetch wrapper, auth headers, react-query defaults.
- `i18n.tsx`: localization state and helpers.
- `settings.tsx`: runtime app settings.
- `theme.tsx`: theme runtime model.
- media/audio and game config helper libs.

## Hooks (`client/src/hooks/`)

Domain hooks include:

- websocket/game hooks
- chat and chat feature hooks
- notifications hooks
- mobile/install hooks
- pagination and balance helpers

## Component organization (`client/src/components/`)

- `ui/`: reusable low-level components.
- feature components for notification, support chat, game widgets.
- admin-specific reusable widgets in `components/admin/`.

## Data flow model

1. page/component calls hook or query.
2. query function uses `queryClient.ts` fetch helpers.
3. headers include user/admin token according to route type.
4. backend response normalizes into component state.
5. realtime updates augment local query cache and UI events.

## Frontend debugging hotspots

- routing issues: `App.tsx`
- auth/session mismatch: `lib/auth.tsx`, `lib/queryClient.ts`
- stale settings: `lib/settings.tsx`
- ws/game desync: `hooks/useGameWebSocket.ts` and challenge pages
- notification anomalies: provider components and hooks
