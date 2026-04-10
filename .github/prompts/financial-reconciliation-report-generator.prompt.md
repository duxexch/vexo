---
description: "Generate a production-grade financial reconciliation report for VEX wallets, ledgers, and multi-currency settlement integrity."
name: "VEX Financial Reconciliation Report Generator"
argument-hint: "حدد الفترة الزمنية + النطاق (wallet/deposit/withdrawal/p2p/gifts/free-rewards) + مستوى العمق."
agent: "VEX Wallet Finance Architect"
---
Create a strict reconciliation report for the provided scope using the argument as the exact input baseline.

Requirements:
1. Do NOT implement code unless explicitly requested; report and action plan first.
2. Validate financial integrity across:
   - wallet balances
   - ledger sums/signs
   - idempotency markers
   - conversion consistency for multi-currency flows
3. Identify and classify discrepancies:
   - critical (loss/fraud risk)
   - high (double-credit/debit risk)
   - medium (precision/rounding drift)
   - low (operational/reporting mismatch)
4. Include a deterministic reconciliation formula section for each impacted flow.
5. Produce file-level touch recommendations (exact backend/frontend/schema files to inspect/fix).
6. Provide a rollback-safe remediation sequence.
7. End with validation commands and pass/fail checklist.

Use these repository references when applicable:
- [Wallet storage](../../server/storage/project-currency/wallets.ts)
- [Payment routes](../../server/routes/payments/project-currency-routes.ts)
- [Admin currency controls](../../server/admin-routes/admin-currency/project-currency.ts)
- [Wallet page](../../client/src/pages/wallet.tsx)
- [Admin currency page](../../client/src/pages/admin/admin-currency.tsx)
- [Schema](../../shared/schema.ts)

Output format:
- Scope
- Reconciliation Equations
- Findings By Severity
- Root-Cause Hypotheses
- Remediation Plan (ordered)
- Validation Matrix
- Residual Risk
