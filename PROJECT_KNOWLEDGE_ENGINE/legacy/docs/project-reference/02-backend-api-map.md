# 02 - Backend API Map

This file maps public API domains to their route modules. Exact endpoint paths can evolve; use this map to find ownership quickly.

## Public route composition

Route registry: `server/routes/index.ts`

Registered modules:

1. `health`
2. `users`
3. `games`
4. `transaction-user`
5. `transaction-agent`
6. `auth`
7. `social-auth`
8. `p2p-trading`
9. `p2p-disputes`
10. `challenges`
11. `spectator`
12. `tournaments`
13. `daily-rewards`
14. `chat-features`
15. `payments`
16. `notifications`
17. `stats`
18. `profile`
19. `security`
20. `p2p-profile`
21. `gifts`
22. `social`
23. `chat`
24. `matchmaking`
25. `game-config`
26. `support-chat`
27. `external-games`

## Domain ownership map

| Domain | Typical Prefix | Main Files |
| --- | --- | --- |
| Health | `/api/health` | `server/routes/health.ts` |
| Auth | `/api/auth/*` | `server/routes/auth/*` |
| OAuth/Social Auth | `/api/auth/*`, `/api/social/*` | `server/routes/social-auth/*`, `server/routes/social/*` |
| Users/Profile | `/api/users/*`, `/api/profile/*` | `server/routes/users.ts`, `server/routes/profile/*` |
| Games Catalog | `/api/games/*`, `/api/external-games/*` | `server/routes/games.ts`, `server/routes/external-games.ts` |
| Multiplayer Config | `/api/game-config/*` | `server/routes/game-config/*` |
| Challenges | `/api/challenges/*` | `server/routes/challenges/*` |
| Spectator features | `/api/challenges/:id/odds`, `/api/challenges/:id/supports`, `/api/challenges/:id/support`, `/api/supports/*`, `/api/my-supports` | `server/routes/spectator/*` |
| Matchmaking | `/api/matchmaking/*` | `server/routes/matchmaking/*` |
| Chat and chat features | `/api/chat/*` | `server/routes/chat/*`, `server/routes/chat-features/*` |
| Support chat | `/api/support-chat/*` | `server/routes/support-chat/*` |
| P2P trading | `/api/p2p/*` | `server/routes/p2p-trading/*`, `server/routes/p2p-disputes/*`, `server/routes/p2p-profile.ts` |
| Wallet/Transactions | `/api/transactions/*`, `/api/payments/*` | `server/routes/transaction-user.ts`, `server/routes/transaction-agent.ts`, `server/routes/payments/*` |
| Notifications/Stats | `/api/notifications/*`, `/api/stats/*` | `server/routes/notifications.ts`, `server/routes/stats/*` |
| Rewards/Tournaments | `/api/daily-rewards/*`, `/api/tournaments/*` | `server/routes/daily-rewards.ts`, `server/routes/tournaments/*` |
| Gifts and social graph | `/api/gifts/*`, `/api/social/*` | `server/routes/gifts/*`, `server/routes/social/*` |
| Security | `/api/security/*` | `server/routes/security.ts` |

## Challenge critical endpoints

Use this quick list when triaging challenge create/join/play/watch issues:

1. `POST /api/challenges`
   owner: `server/routes/challenges/create.ts`
2. `POST /api/challenges/:id/join`
   owner: `server/routes/challenges/join.ts`
3. `GET /api/challenges/:id`
   owner: `server/routes/challenges/details.ts`
4. `GET /api/challenges/public`
   owner: `server/routes/challenges/listing.ts`
5. `GET /api/challenges/:id/odds`
   owner: `server/routes/spectator/support-odds.ts`
6. `POST /api/challenges/:id/support`
   owner: `server/routes/spectator/support-actions.ts`
7. WS play/spectate for challenge pages (`/ws`)
   owner: `server/websocket/challenge-games/*`

## Where to patch first (triage)

If a bug report mentions:

- Login/session/token: start in `server/routes/auth/*` and `server/routes/middleware.ts`.
- Challenge/game room state: start in `server/routes/challenges/*`, `server/websocket/challenge-games/*`, and `server/game-websocket/*`.
- P2P trading/disputes: start in `server/routes/p2p-trading/*` and `server/routes/p2p-disputes/*`.
- Admin behavior leaking to user API: confirm separation between `server/routes/*` and `server/admin-routes/*`.

## Notes

- Single-player play route is intentionally removed and returns 410 in `server/routes.ts`.
- Route registration order matters for middleware and broad prefixes.
