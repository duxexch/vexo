---
description: "Use when editing wallet, ledger, project-currency, deposit/withdrawal, or multi-currency pricing code in VEX. Enforces financial integrity, deterministic conversions, admin-control safety, and reconciliation readiness."
name: "VEX Wallet Finance Standards"
applyTo:
  - server/storage/project-currency/**/*.ts
  - server/storage/p2p/**/*.ts
  - server/routes/payments/**/*.ts
  - server/routes/p2p-trading/**/*.ts
  - server/routes/p2p-disputes/**/*.ts
  - server/routes/gifts/**/*.ts
  - server/routes/challenges/gifts.ts
  - server/admin-routes/admin-currency/**/*.ts
  - server/admin-routes/admin-p2p/**/*.ts
  - server/lib/p2p-currency-controls.ts
  - client/src/pages/wallet.tsx
  - client/src/pages/admin/admin-currency.tsx
  - client/src/pages/admin/admin-free-play.tsx
  - shared/schema.ts
---
# VEX Wallet And Finance Standards

## Financial Integrity Rules
- Every balance mutation must be atomic and transaction-safe.
- Every mutation must write ledger entries with consistent debit/credit sign rules.
- Never trust client monetary totals, FX rates, or post-mutation balances.
- Prevent duplicate mutations using idempotency keys or deterministic reference guards.

## Multi-Currency Rules
- Keep a canonical conversion source for pricing/admin operations.
- Record source amount and settlement amount whenever conversion is applied.
- Persist conversion metadata: source currency, target currency, rate, rate time/source, rounding policy.
- Enforce precision/min/max by currency to avoid drift and hidden loss.

## Admin And Operations Rules
- Admin pricing and FX controls must remain permission-guarded.
- Any admin rate/policy update must be auditable.
- Do not silently mix presentation currency with settlement currency.
- Reconciliation visibility must remain possible after every change.

## Security And Abuse Rules
- Protect against replay/double-submit in payment callbacks and reward claims.
- Guard against race conditions on wallet rows (lock/update ordering).
- Do not bypass ledger writes even for internal/admin flows.

## Validation Rules
- Run `npx tsc --noEmit` after financial code changes.
- If backend changed: start server and verify health on port 3001.
- Run targeted smoke checks for impacted wallet/currency endpoints.
- Explicitly state validated and non-validated areas in your report.
