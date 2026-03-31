# 04 - Security, Finance, Database Guardrails

This project is a real-money platform. Security and financial correctness are priority one.

## 1. Security Layers in Runtime

Primary implementation is in `server/index.ts` and route middleware modules:

- CORS allowlist handling
- security headers and CSP in production
- request size limits (default and upload-specific)
- prototype pollution sanitization for request bodies
- request tracing via request ID

Auth boundaries:

- user/admin token extraction and verification paths are separate
- middleware enforces user status and session checks
- protected APIs require explicit auth paths

## 2. Financial Integrity Rules

Always preserve these patterns:

- Use DB transactions for balance-changing flows.
- Use row locking (`SELECT ... FOR UPDATE`) where race conditions are possible.
- Keep credit/debit multi-step operations atomic.
- Never split fee and principal movements into independent transactions when they are one business action.
- Record status transitions and prevent replay/double processing.

Critical domains to inspect for money-impacting changes:

- `server/storage/financial.ts`
- `server/routes/payments/*`
- `server/routes/p2p-trading/*`
- `server/routes/p2p-disputes/*`
- challenge settlement paths in websocket + storage flows

## 3. Database Safety Rules

- Schema source of truth: `shared/schema.ts`.
- Connection and pool behavior: `server/db.ts`.
- Keep constraints/indexes intact unless migration strategy is explicit.
- Never run destructive changes without backups.
- Treat migration scripts and entrypoint migrations as production safety controls.

## 4. Known Security Context

Existing audit history indicates extensive hardening has already been applied (multi-phase fixes).
Do not assume "already fixed" means "safe forever". Any new feature touching auth, payout, or storage can re-introduce risk.

## 5. Required Validation for Risky Changes

For changes in auth/finance/db/realtime state:

- Type check passes.
- Server boots without startup exceptions.
- Affected route path behaves correctly.
- Negative-path checks performed (unauthorized access, invalid input, race-sensitive path).
- Documented in `06_CHANGE_PROTOCOL_AND_LOG.md`.

## 6. Security Regression Triggers

Treat as blockers:

- Using `Math.random()` in money-critical randomization.
- Accepting unverified user/admin token paths.
- Missing rate limits on sensitive endpoints.
- Missing auth checks on file upload or admin operations.
- Any balance update done outside transaction safety pattern.
