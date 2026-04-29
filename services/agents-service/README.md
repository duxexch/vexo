# VEX Agents Service

Standalone microservice for the **commercial agents subsystem** (cashier /
financial agents): admin agent CRUD, balance adjustments, agent ledger,
agent payment methods. Split out of the main `server/` for deployment
isolation while still sharing the same Postgres database.

## Architecture

- **Port**: 3002 (configurable via `PORT`)
- **DB**: shares the main `DATABASE_URL` — separate connection pool (default max 20)
- **Auth**: trusts `X-Internal-Service-Token` (HMAC-style shared secret with
  the main server) plus `X-Admin-Id` / `X-Admin-Role` / `X-Admin-Username`
  headers. The main server validates the admin's session, then proxies the
  request with these headers attached. The service never sees the raw admin
  cookie/JWT.
- **Schema**: imports `@shared/schema` (path alias to repo root `shared/`).
  In Docker, `shared/` is copied to `/shared` and the path alias is patched
  during the image build.

## Routes

All routes require `X-Internal-Service-Token` (rejected with 401 if missing
or wrong).

| Method | Path                                     | Source            |
|--------|------------------------------------------|-------------------|
| GET    | `/health`                                | health probe      |
| GET    | `/api/admin/agents`                      | admin list        |
| GET    | `/api/admin/agents/:id`                  | admin detail      |
| GET    | `/api/admin/agents/:id/ledger`           | admin ledger      |
| POST   | `/api/admin/agents`                      | admin create      |
| PATCH  | `/api/admin/agents/:id`                  | admin update      |
| POST   | `/api/admin/agents/:id/toggle-active`    | admin toggle      |
| POST   | `/api/admin/agents/:id/adjust-balance`   | admin balance adj |
| GET    | `/api/agents`                            | payments list     |
| POST   | `/api/agents`                            | payments create   |
| GET    | `/api/agents/:id`                        | payments detail   |
| PATCH  | `/api/agents/:id`                        | payments update   |
| GET    | `/api/agents/:id/payment-methods`        | payment methods   |
| POST   | `/api/agents/:id/payment-methods`        | create method     |

## Local development

```bash
cd services/agents-service
npm install
DATABASE_URL=postgres://... \
INTERNAL_SERVICE_TOKEN=dev-internal-token \
PORT=3002 \
npm run dev
```

Then in the main server's environment, set:

```bash
AGENTS_SERVICE_URL=http://localhost:3002
INTERNAL_SERVICE_TOKEN=dev-internal-token   # must match
```

The main server's proxy middleware will route `/api/admin/agents/*` and
`/api/agents/*` to this service. If `AGENTS_SERVICE_URL` is **not** set,
the main server falls back to its in-process implementation (no behaviour
change for plain `npm run dev`).

## Production (docker-compose)

The `agents-service` container is wired in `docker-compose.yml` alongside
`db`, `redis`, `ai-agent`, and `app`. The `app` container receives
`AGENTS_SERVICE_URL=http://agents-service:3002` so its proxy activates
automatically.
