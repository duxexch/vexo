# 03 - Admin API Map

Admin route registry: `server/admin-routes/index.ts`

All admin routes are mounted under `/api/admin/*` patterns across modular files.

## Registered admin modules

1. `admin-login`
2. `admin-password`
3. `admin-dashboard`
4. `admin-users`
5. `admin-settings`
6. `admin-support`
7. `admin-p2p`
8. `admin-content`
9. `admin-games`
10. `admin-alerts`
11. `admin-currency`
12. `admin-tournaments`
13. `admin-challenges`
14. `chat-media`
15. `chat-auto-delete`
16. `chat-pin`

## Admin module ownership details

| Module Group | Main Folder/File | Responsibility |
|---|---|---|
| Auth and credentials | `server/admin-routes/admin-login.ts`, `server/admin-routes/admin-password.ts` | Admin authentication, credential flow, optional 2FA gates |
| Dashboard and alerts | `server/admin-routes/admin-dashboard.ts`, `server/admin-routes/admin-alerts.ts` | Dashboard summaries, notifications, admin alert streams |
| User management | `server/admin-routes/admin-users/*` | CRUD, moderation, complaints, financial controls |
| Global settings | `server/admin-routes/admin-settings/*` | App settings, login/gameplay toggles, themes, feature flags |
| Support controls | `server/admin-routes/admin-support/*` | support contacts, auto replies, ticket and media governance |
| P2P governance | `server/admin-routes/admin-p2p/*` | dispute actions/listing, analytics, trading settings |
| Content management | `server/admin-routes/admin-content/*` | broadcast/admin content and chat management |
| Games management | `server/admin-routes/admin-games/*` | multiplayer config, external games, social platform settings |
| Currency/admin finance | `server/admin-routes/admin-currency/*` | project currency, free play controls and activity |
| Tournaments | `server/admin-routes/admin-tournaments/*` | tournament CRUD, lifecycle, matches |
| Challenge ops | `server/admin-routes/admin-challenges/*` | challenge listing, cancelation, challenge settings |
| Chat policy controls | `server/admin-routes/chat-media.ts`, `chat-auto-delete.ts`, `chat-pin.ts` | policy toggles for media, retention, and chat-pin controls |

## Security notes

- Admin APIs rely on admin auth middleware from `server/admin-routes/helpers.ts`.
- User token and admin token paths are intentionally separated in frontend query client logic.
- Sensitive admin actions should always be checked for rate limits and audit logging.

## Debug triage shortcuts

- Admin cannot login: start with `admin-login.ts` and `server/lib/auth-config.ts`.
- Admin page shows stale values: check the module under `admin-settings/*` plus cache-related headers.
- Admin can access but action fails: inspect `helpers.ts` middleware and DB permission assumptions in storage calls.
