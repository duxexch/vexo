# Team Agent Execution Protocol

This protocol enforces coordinated agent execution and regression safety.

## Six-Role Team (Flow, i18n/RTL, Mobile, Backend, Frontend, Database)

Use the dedicated agent runner when a batch affects gameplay or cross-surface UX:

- Full team:
  - `npm run team:agents:all`
  - `npm run team:agents:all:strictdb` (requires live PostgreSQL)
- Route/flow agent:
  - `npm run team:agents:flow`
- i18n and RTL agent:
  - `npm run team:agents:i18n`
- Mobile/app readiness agent:
  - `npm run team:agents:mobile`
- Backend agent:
  - `npm run team:agents:backend`
- Frontend agent:
  - `npm run team:agents:frontend`
- Database agent:
  - `npm run team:agents:database`

The full-team command executes all six checks in sequence and fails fast.

Database agent policy:

- Default (`team:agents:all`) uses `--db-policy=auto`.
  - If PostgreSQL is reachable: runs settlement idempotency smoke.
  - If PostgreSQL is offline: runs static schema/type contracts instead of failing.
- Strict mode (`team:agents:all:strictdb`) fails immediately when PostgreSQL is offline.

## Agent Coordination (Before Any Implementation)

1. Explore agent gathers implementation surface and impacted files.
2. Gameplay QA agent returns smoke matrix for touched areas.
3. Security agent returns abuse and integrity checks for touched areas.
4. Implementation starts only after consolidating the three outputs.

## Mandatory Gates Per Batch

Run the selected gate before commit and push:

- General batch:
  - `npm run team:gate:general`
- Challenge/game/ws batch:
  - `npm run team:gate:challenge`
- Auth batch:
  - `npm run team:gate:auth`
- Finance/payout batch:
  - `npm run team:gate:finance`
- Large cross-domain batch:
  - `npm run team:gate:full`

## Gate Behavior

The gate script runs in fail-fast mode:

1. TypeScript gate (`npm run check:types`)
2. Runtime health gate (`GET http://localhost:3001/` must be 200)
3. WebSocket heartbeat gate (`npm run security:smoke:ws-heartbeat`, auto-retry once on transient failure)
4. Scope-specific smokes for auth/challenge/finance

For challenge or finance scopes, PostgreSQL readiness on `localhost:5432` is required.

## Stop Rules

Stop implementation immediately when any gate fails.

- Fix the failure.
- Re-run the same gate.
- Proceed only after full pass.

## No-Regression Rule

Every new batch must preserve previous passing checks.

If a batch introduces a failure in a previously passing gate, that batch is not complete.
