# P2P Service Isolation — Feasibility Analysis & Plan

**Date:** 2026-04-29  
**Author:** Architecture review  
**Status:** Proposal (not yet approved)

## TL;DR

Isolating the P2P subsystem into a standalone container — mirroring the
`vex-agents-service` pattern — is **feasible but materially harder** than
the agents extraction was, primarily because P2P is roughly **6–8× larger**
in code, **deeply coupled to the wallet/ledger atomic flows**, and depends
on **realtime (WebSocket) + MinIO + cron schedulers** that the agents
service does not.

We recommend a **two-phase strangler-fig extraction** rather than a
big-bang move.

---

## 1. Reference: what we already did for agents

| Aspect | Agents service implementation |
|---|---|
| Container name | `vex-agents-service` |
| Image | Built from `services/agents-service/Dockerfile` (multi-stage, alpine) |
| Internal port | `3002` (not exposed publicly) |
| Auth | HMAC-style header `x-internal-service-token` (32+ char shared secret) |
| Identity passing | Main app validates JWT, then forwards `x-admin-id`, `x-admin-role`, `x-admin-username` |
| DB | Shares the same Postgres (`DATABASE_URL`) |
| Schema sharing | `shared/` is **copied into `/app/shared`** in the Docker image; `tsconfig.json` is patched at build time |
| Proxy | `server/middleware/agents-proxy.ts` (~185 LOC) routes `/api/admin/agents/**` and `/api/agents/**` |
| Healthcheck | `curl -f http://localhost:3002/health` every 20s |
| Privileges | Runs as non-root `agentsusr:agentsgrp` |
| Signal handling | `tini` as PID 1 |

## 2. Lessons learned from the agents extraction (must avoid for P2P)

These are extracted from git history (commits `e997ef7`, `bd34e5f`,
`e620b5e`, `dd4fa96`, `ff69cbb`, `0171da9`) and Dockerfile comments:

| # | What broke | Root cause | Mitigation we'll reuse |
|---|---|---|---|
| 1 | `MODULE_NOT_FOUND: drizzle-orm` at runtime | `shared/` was copied to `/shared`, outside the service's `node_modules` tree | Always copy `shared/` **into** `/app/shared` and patch `@shared/*` path alias inside the image |
| 2 | Build succeeded, runtime failed silently | No build-time sanity check that critical deps were installed | Add `node -e "require('drizzle-orm');require('drizzle-zod')"` step in Dockerfile |
| 3 | App crashed because the new service started before DB was ready | Missing `depends_on: condition: service_healthy` and no start_period grace | Use `depends_on: { db: { condition: service_healthy } }` + `start_period: 15s` |
| 4 | Agent users were stored incorrectly in the DB | Insert path differed between main-app and service writes | Single source of truth in `server/storage/<feature>` — do **not** duplicate write paths in both processes |
| 5 | Auth token leaked or unset → service refused to boot or proxy degraded silently | Service must `process.exit(1)` if `INTERNAL_SERVICE_TOKEN` missing in production; main app must fall back to in-process routes if proxy URL missing | Same pattern for P2P |
| 6 | Lockfile drift between root and service | `npm ci` failed, fallback added | Keep service `package.json` minimal and pin only what the service uses |

## 3. P2P inventory (what we'd be moving)

### 3.1 Server-side (~7,300 LOC)

| Path | Purpose |
|---|---|
| `server/routes/p2p-trading/offers.ts` | CRUD + admin review of buy/sell offers |
| `server/routes/p2p-trading/trades.ts` | Trade listing/metadata |
| `server/routes/p2p-trading/trade-lifecycle.ts` | State transitions: create / pay / confirm / cancel / dispute |
| `server/routes/p2p-trading/trade-payment.ts` | Payment proof upload + validation |
| `server/routes/p2p-trading/rate-messages.ts` | In-trade peer chat + system messages |
| `server/routes/p2p-disputes/{create,listing,resolve}.ts` | Dispute lifecycle |
| `server/admin-routes/admin-p2p/**` | Admin analytics, dispute actions, freeze program |
| `server/storage/p2p/crud.ts` | Basic DB ops |
| `server/storage/p2p/trade-create-atomic.ts` | **Atomic** trade init + escrow lock (touches wallets) |
| `server/storage/p2p/trade-settle-atomic.ts` | **Atomic** escrow release + balance update |
| `server/storage/p2p/atomic-project-*.ts` | Digital-deal negotiation atomics |
| `server/lib/p2p-currency-controls.ts` | Allowed currencies validation |
| `server/lib/p2p-freeze-program.ts` | VIP freeze benefit |

### 3.2 DB tables (in `shared/schema.ts`)

`p2p_offers`, `p2p_trades`, `p2p_offer_negotiations`, `p2p_disputes`,
`p2p_dispute_evidence`, `p2p_trade_messages`, `p2p_trader_profiles`,
`p2p_settings`, `country_payment_methods`.

Plus **shared-but-touched-by-P2P** tables: `users`, `wallets`,
`wallet_transactions`, `notifications`, `id_verification_*`. These are
the highest-risk surface — both the new service and the main app will
write to them.

### 3.3 Client-side (~11,200 LOC)

`client/src/pages/p2p.tsx` (6,250 LOC monolith), `p2p-profile.tsx`,
`p2p-settings.tsx`, `admin/admin-p2p.tsx`, `admin/admin-disputes.tsx`,
`client/src/lib/p2p-status.tsx`. **Client moves are not blocked by
backend extraction** — they continue to call `/api/p2p/*` regardless of
whether the request hits the main app or a proxied service.

### 3.4 Cross-cutting dependencies (the hard parts)

| Dependency | Why it complicates extraction | Proposed solution |
|---|---|---|
| **WebSocket / Socket.IO** (peer chat, system notifications, admin alerts) | The existing realtime layer lives on the main app. Forking it into the new service splits brain. | Keep WS server on main app. New service publishes events to Redis pub/sub channel `p2p:events`; main app's WS layer subscribes and fans out to clients. |
| **Wallet / ledger atomics** (`trade-create-atomic`, `trade-settle-atomic`) | Mutating `wallets` + `wallet_transactions` atomically with `p2p_trades` requires a single DB transaction across tables both apps care about. | Use Postgres-level `SELECT ... FOR UPDATE` (already used) + advisory locks. **Never** split a single transaction across two services. The P2P service will own the write path; main app reads the resulting balances. |
| **MinIO** (payment proofs, dispute evidence) | Must be reachable from the new container's network. | Add MinIO endpoint env vars to the new service; share the same bucket + credentials. |
| **Schedulers** (expired trade processor, dispute escalator) | Cron must run in **exactly one** process or trades will be cancelled twice / disputes escalated twice. | Run schedulers **only** in the P2P service; remove their registration from `server/setup/schedulers.ts` when the service is enabled (env-gated: `P2P_SCHEDULERS_HOST=service\|main`). |
| **Admin notifications** (`emitSystemAlert`) | Same WS issue. | Same Redis pub/sub bridge. |
| **i18n / branding / shared UI utilities** | None — backend only. | N/A |

## 4. Recommended approach: strangler-fig in two phases

### Phase 1 — Read-only + chat (LOW RISK, ~3-5 days of work)

Extract:
- All `GET` routes from `server/routes/p2p-trading/{offers,trades}.ts`
  (browse offers, list trades, fetch trade details, fetch profile).
- `rate-messages.ts` (chat) — writes are append-only and don't touch wallets.
- `p2p-status.tsx` consumed unchanged on the client.

Wire up:
- `services/p2p-service/` mirrors `services/agents-service/` structure.
- `server/middleware/p2p-proxy.ts` proxies the listed paths only.
- Redis pub/sub bridge for chat events.

This proves the pattern end-to-end **without** touching the wallet
critical path. If anything goes wrong, we flip an env var and traffic
silently falls back to the in-process routes.

### Phase 2 — Trade lifecycle + admin + schedulers (HIGH RISK, ~7-10 days)

Move:
- `trade-lifecycle.ts`, `trade-payment.ts`, all `*-atomic.ts` storage.
- `admin-p2p/**` admin routes (proxied with admin identity headers, same
  pattern as agents).
- Schedulers (with the env-gated single-host guarantee).

Hard requirements before Phase 2:
- Phase 1 stable in production for at least one week.
- Wallet write boundary is explicit and documented.
- Backout plan: a single env var `P2P_SERVICE_URL=` (empty) that makes
  the proxy fall back to in-process handlers.

## 5. Container blueprint (mirrors agents)

```yaml
p2p-service:
  build:
    context: .
    dockerfile: services/p2p-service/Dockerfile
  container_name: vex-p2p-service
  restart: unless-stopped
  depends_on:
    db: { condition: service_healthy }
    redis: { condition: service_healthy }
    minio: { condition: service_healthy }
  environment:
    NODE_ENV: production
    PORT: 3003
    DATABASE_URL: postgresql://...@vex-db:5432/${POSTGRES_DB}
    REDIS_URL: redis://vex-redis:6379
    MINIO_ENDPOINT: vex-minio:9000
    MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
    MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
    MINIO_BUCKET: ${MINIO_BUCKET}
    INTERNAL_SERVICE_TOKEN: ${INTERNAL_SERVICE_TOKEN}
    P2P_SCHEDULERS_HOST: service           # only this container runs cron
    DB_POOL_MAX: ${P2P_DB_POOL_MAX:-15}
    TZ: UTC
  networks: [vex-network]
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
    interval: 20s
    timeout: 5s
    retries: 3
    start_period: 20s
```

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double-writes to `wallets` from both services | Medium | Critical (real money) | Single owner per write path; Postgres advisory locks; idempotency keys on every write |
| Schedulers run in both processes | Medium | High (double cancellations) | Env-gated single-host flag; assert at boot |
| WS chat messages get duplicated or dropped during cutover | Medium | Medium | Redis pub/sub bridge; client retry on missing message id |
| MinIO credentials leak into a second image | Low | High | Use Docker secrets or shared `.env` only |
| `shared/schema.ts` drift between services | Low (we own both) | Medium | CI check that both images build from the same git SHA |
| Internal token mishandled | Low | Critical (auth bypass) | Reject boot if `< 32 chars`; rotate independently from agents token |

## 7. Decision asked of you

Two options:

**Option A — Proceed with Phase 1 only now.** Low risk, proves the
pattern, ~3-5 days, no impact on wallet flow. If it goes well, schedule
Phase 2 separately.

**Option B — Defer.** P2P is the most revenue-critical subsystem. If
there's no current operational pain (deploy bottleneck, scaling
ceiling, isolation requirement), the existing in-process implementation
is already correct and battle-tested.

**Recommendation:** Option A, only if there is a concrete operational
driver (independent scaling, isolated deploy cadence, blast radius
reduction). Otherwise Option B and revisit when a driver appears.
