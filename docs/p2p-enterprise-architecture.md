# P2P Enterprise Architecture Refactor
Date: 2026-05-03

## 1) Architecture diagram

```text
Client UI
  ├─ Marketplace Page
  ├─ Offer Creation Wizard
  ├─ Trade Room
  ├─ Dispute Center
  └─ Admin Reconciliation Dashboard
        │
        ▼
API Layer
  ├─ /api/p2p/offers
  ├─ /api/p2p/negotiations
  ├─ /api/p2p/trades
  ├─ /api/p2p/escrow
  ├─ /api/p2p/ledger
  └─ /api/p2p/disputes
        │
        ▼
Domain Services
  ├─ Offer Service
  ├─ Negotiation Service
  ├─ Trade Lifecycle Service
  ├─ Escrow Service
  ├─ Ledger Service
  ├─ Dispute Service
  ├─ Reconciliation Service
  └─ Risk Engine
        │
        ▼
Persistence
  ├─ p2p_offers
  ├─ p2p_offer_versions
  ├─ p2p_negotiations
  ├─ p2p_trades
  ├─ p2p_trade_state_events
  ├─ p2p_ledger_entries
  ├─ p2p_ledger_balances
  ├─ p2p_escrow_accounts
  ├─ p2p_disputes
  ├─ p2p_dispute_evidence
  ├─ p2p_reconciliation_runs
  ├─ p2p_risk_scores
  └─ p2p_audit_log
        │
        ▼
Shared Platform Systems
  ├─ user wallets / balances
  ├─ notifications
  ├─ websocket event fanout
  ├─ admin audit logging
  └─ cron scheduler
```

### Design principles
- All money movements go through the ledger.
- Business state, operational state, and accounting state are separate.
- Every mutation is idempotent and audit logged.
- UI never mutates money directly.
- Disputes always end in a financial outcome.

---

## 2) Database schema

### 2.1 Offers

```sql
p2p_offers (
  id                    uuid primary key,
  creator_user_id       uuid not null,
  type                  text not null, -- buy | sell
  offer_kind            text not null, -- standard | digital
  digital_trade_type    text null,     -- account_sale | asset_exchange | service_trade | hybrid_trade
  asset_code            text not null,
  fiat_currency         text not null,
  price_type            text not null, -- fixed | floating
  price                 numeric(18,8) not null,
  available_amount      numeric(18,8) not null,
  min_order_amount      numeric(18,8) not null,
  max_order_amount      numeric(18,8) not null,
  payment_methods       jsonb not null,
  terms                 text null,
  status                text not null, -- draft | active | paused | rejected | expired | closed
  visibility            text not null, -- public | private | friend_only
  target_user_id        uuid null,
  created_at            timestamptz not null,
  updated_at            timestamptz not null,
  version               int not null default 1,
  idempotency_key       text null,
  audit_ref             text not null
)
```

### 2.2 Negotiations

```sql
p2p_negotiations (
  id                    uuid primary key,
  offer_id              uuid not null references p2p_offers(id),
  trade_id              uuid null references p2p_trades(id),
  proposer_user_id      uuid not null,
  responder_user_id     uuid not null,
  round_number          int not null,
  proposed_terms        jsonb not null,
  status                text not null, -- pending | accepted | rejected | expired | withdrawn
  created_at            timestamptz not null,
  updated_at            timestamptz not null,
  idempotency_key       text null,
  audit_ref             text not null
)
```

### 2.3 Trades

```sql
p2p_trades (
  id                      uuid primary key,
  offer_id                uuid not null references p2p_offers(id),
  buyer_user_id           uuid not null,
  seller_user_id          uuid not null,
  business_state          text not null, -- draft | active | negotiated | accepted | expired
  operational_state       text not null, -- awaiting_payment | payment_sent | awaiting_confirmation | completed | cancelled | disputed
  accounting_state        text not null, -- no_funds | funds_reserved | funds_locked_in_escrow | funds_released | funds_refunded
  asset_code              text not null,
  fiat_currency           text not null,
  fiat_amount             numeric(18,8) not null,
  crypto_amount           numeric(18,8) not null,
  escrow_amount           numeric(18,8) not null,
  platform_fee            numeric(18,8) not null,
  escrow_account_id       uuid not null,
  payment_deadline_at     timestamptz null,
  confirmation_deadline_at timestamptz null,
  completed_at            timestamptz null,
  cancelled_at            timestamptz null,
  disputed_at             timestamptz null,
  closed_at               timestamptz null,
  idempotency_key         text null,
  audit_ref               text not null,
  created_at              timestamptz not null,
  updated_at              timestamptz not null
)
```

### 2.4 Ledger

```sql
p2p_ledger_entries (
  entry_id              uuid primary key,
  user_id               uuid not null,
  trade_id              uuid null references p2p_trades(id),
  offer_id              uuid null references p2p_offers(id),
  type                  text not null, -- debit | credit
  amount                numeric(18,8) not null,
  currency              text not null,
  fee                   numeric(18,8) not null default 0,
  balance_before        numeric(18,8) not null,
  balance_after         numeric(18,8) not null,
  reference_type        text not null, -- trade | dispute | refund | fee
  reference_id          uuid not null,
  ledger_account_type   text not null, -- user_wallet | escrow | fee_account | system_account
  timestamp             timestamptz not null,
  idempotency_key       text not null,
  audit_ref             text not null
)
```

Recommended companion tables:
- `p2p_ledger_accounts`
- `p2p_ledger_balances`
- `p2p_ledger_posting_batches`

### 2.5 Escrow

```sql
p2p_escrow_accounts (
  id                    uuid primary key,
  trade_id              uuid not null references p2p_trades(id),
  owner_user_id         uuid not null,
  beneficiary_user_id   uuid not null,
  amount                numeric(18,8) not null,
  currency              text not null,
  status                text not null, -- reserved | locked | released | refunded | frozen | partially_released
  lock_reason           text not null,
  release_condition      jsonb not null,
  timeout_at            timestamptz null,
  frozen_at             timestamptz null,
  created_at            timestamptz not null,
  updated_at            timestamptz not null
)
```

### 2.6 Disputes

```sql
p2p_disputes (
  id                    uuid primary key,
  trade_id              uuid not null references p2p_trades(id),
  opener_user_id        uuid not null,
  respondent_user_id    uuid not null,
  state                 text not null, -- open | evidence_collection | under_review | escalated | resolved | closed
  reason                text not null,
  resolution_type       text null, -- full_refund | full_release | partial_settlement
  resolution_amount     numeric(18,8) null,
  admin_user_id         uuid null,
  final_audit_ref       text null,
  created_at            timestamptz not null,
  updated_at            timestamptz not null
)

p2p_dispute_evidence (
  id                    uuid primary key,
  dispute_id            uuid not null references p2p_disputes(id),
  uploader_user_id      uuid not null,
  evidence_type         text not null, -- file | chat_log | screenshot | link | note
  file_url              text null,
  message_ref           text null,
  metadata              jsonb not null,
  created_at            timestamptz not null
)
```

### 2.7 Reconciliation

```sql
p2p_reconciliation_runs (
  id                    uuid primary key,
  business_date         date not null unique,
  total_offers_created  int not null,
  total_trades_opened   int not null,
  total_escrow_locked   numeric(18,8) not null,
  completed_trades      int not null,
  cancelled_trades      int not null,
  disputed_trades       int not null,
  total_fees_collected  numeric(18,8) not null,
  wallet_balance_total  numeric(18,8) not null,
  ledger_balance_total  numeric(18,8) not null,
  mismatch_count        int not null,
  status                text not null, -- ok | warning | failed
  generated_at          timestamptz not null,
  audit_ref             text not null
)
```

### 2.8 Risk

```sql
p2p_risk_scores (
  id                    uuid primary key,
  user_id               uuid not null,
  trade_id              uuid null references p2p_trades(id),
  score                 int not null,
  trust_tier            text not null, -- low | medium | high | verified | restricted
  signals               jsonb not null,
  action_recommendation text not null, -- allow | review | hold | block
  created_at            timestamptz not null
)
```

---

## 3) State machine diagram

### A. Business State
```text
draft -> active -> negotiated -> accepted -> expired
draft -> expired
active -> expired
negotiated -> accepted
negotiated -> expired
accepted -> expired
```

### B. Operational State
```text
awaiting_payment -> payment_sent -> awaiting_confirmation -> completed
awaiting_payment -> cancelled
payment_sent -> disputed
awaiting_confirmation -> disputed
awaiting_confirmation -> completed
any_open_state -> cancelled
any_open_state -> disputed
disputed -> completed
disputed -> cancelled
```

### C. Accounting State
```text
no_funds -> funds_reserved -> funds_locked_in_escrow -> funds_released
funds_reserved -> funds_refunded
funds_locked_in_escrow -> funds_released
funds_locked_in_escrow -> funds_refunded
funds_locked_in_escrow -> funds_locked_in_escrow   (idempotent reapply)
funds_released -> funds_released                  (idempotent reapply)
funds_refunded -> funds_refunded                  (idempotent reapply)
```

### Transition rules
- Every transition writes a `p2p_trade_state_events` row.
- Transition requests must include an idempotency key.
- Invalid transitions return a 409 or 422.
- Repeated valid requests must return the existing result.

### Transition logging payload
```ts
type TradeStateEvent = {
  eventId: string;
  tradeId: string;
  fromBusinessState: string;
  toBusinessState: string;
  fromOperationalState: string;
  toOperationalState: string;
  fromAccountingState: string;
  toAccountingState: string;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
  timestamp: string;
};
```

---

## 4) API structure

## /api/p2p/offers
### Responsibilities
- Create offer
- Update offer draft
- Activate / pause / expire offer
- List offers
- Fetch offer detail

### Rules
- Idempotent create/update
- Strict permission checks
- Digital offers must pass classification validation
- Audit every mutation

---

## /api/p2p/negotiations
### Responsibilities
- Create negotiation round
- Accept / reject / withdraw negotiation
- List negotiation history

### Rules
- One active round per side per offer at a time
- Acceptance must reference a specific round
- Negotiation cannot directly move money

---

## /api/p2p/trades
### Responsibilities
- Open trade
- Change business/operational/accounting state
- Confirm payment
- Confirm receipt
- Cancel trade
- Fetch trade timeline

### Rules
- Trade opening performs escrow reservation
- Every trade transition is idempotent
- No UI side effects without a successful backend state change

---

## /api/p2p/escrow
### Responsibilities
- Reserve funds
- Lock funds
- Release funds
- Refund funds
- Partial release for approved cases

### Rules
- Escrow operations always post ledger entries
- Timeout jobs may auto-release or auto-refund based on policy
- Dispute freeze blocks all release paths except admin override

---

## /api/p2p/ledger
### Responsibilities
- Post double-entry records
- Query user ledger
- Query trade ledger
- Query fee ledger
- Balance verification

### Rules
- Immutable write-once entries
- Debits and credits must reconcile
- Every posting batch must balance to zero
- Admin override requires separate audit record

---

## /api/p2p/disputes
### Responsibilities
- Open dispute
- Upload evidence
- Review dispute
- Resolve dispute
- Close dispute
- Fetch dispute timeline

### Rules
- Dispute resolution must generate ledger entries
- Resolution is irreversible except admin override
- Evidence upload is append-only
- Final resolution must update trade accounting state

---

## 5) Key code examples

### 5.1 Ledger posting service
```ts
export type LedgerPostingInput = {
  userId: string;
  tradeId?: string;
  offerId?: string;
  amount: string;
  currency: string;
  fee?: string;
  referenceType: "trade" | "dispute" | "refund" | "fee";
  referenceId: string;
  type: "debit" | "credit";
  idempotencyKey: string;
};

export async function postLedgerEntry(input: LedgerPostingInput) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.p2pLedgerEntries.findFirst({
      where: and(
        eq(p2pLedgerEntries.idempotencyKey, input.idempotencyKey),
        eq(p2pLedgerEntries.userId, input.userId),
      ),
    });

    if (existing) return existing;

    const accountBalance = await getLedgerBalanceForUpdate(tx, input.userId, input.currency);
    const balanceBefore = accountBalance.balance;

    const delta = input.type === "credit"
      ? new Decimal(input.amount)
      : new Decimal(input.amount).negated();

    const balanceAfter = balanceBefore.add(delta);

    const [row] = await tx.insert(p2pLedgerEntries).values({
      entryId: randomUUID(),
      userId: input.userId,
      tradeId: input.tradeId ?? null,
      offerId: input.offerId ?? null,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      fee: input.fee ?? "0",
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      ledgerAccountType: "user_wallet",
      timestamp: new Date(),
      idempotencyKey: input.idempotencyKey,
      auditRef: createAuditRef(),
    }).returning();

    await upsertLedgerBalance(tx, input.userId, input.currency, balanceAfter.toString());
    return row;
  });
}
```

### 5.2 Strict transition guard
```ts
const validBusinessTransitions: Record<string, string[]> = {
  draft: ["active", "expired"],
  active: ["negotiated", "expired"],
  negotiated: ["accepted", "expired"],
  accepted: ["expired"],
  expired: [],
};

export function assertBusinessTransition(from: string, to: string) {
  const allowed = validBusinessTransitions[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid business transition: ${from} -> ${to}`);
  }
}
```

### 5.3 Escrow release
```ts
export async function releaseEscrow(tradeId: string, idempotencyKey: string) {
  return db.transaction(async (tx) => {
    const trade = await lockTradeForUpdate(tx, tradeId);

    if (trade.accountingState === "funds_released") {
      return trade;
    }

    if (trade.operationalState !== "completed" && trade.operationalState !== "resolved") {
      throw new Error("Escrow cannot be released before completion or dispute resolution");
    }

    await postLedgerEntry({
      userId: trade.sellerUserId,
      tradeId,
      amount: trade.escrowAmount,
      currency: trade.fiatCurrency,
      referenceType: "trade",
      referenceId: tradeId,
      type: "credit",
      idempotencyKey,
    });

    await tx.update(p2pTrades)
      .set({
        accountingState: "funds_released",
        updatedAt: new Date(),
      })
      .where(eq(p2pTrades.id, tradeId));

    return trade;
  });
}
```

### 5.4 Dispute resolution
```ts
type DisputeResolutionType = "full_refund" | "full_release" | "partial_settlement";

export async function resolveDispute(
  disputeId: string,
  resolutionType: DisputeResolutionType,
  adminUserId: string,
  idempotencyKey: string,
) {
  return db.transaction(async (tx) => {
    const dispute = await lockDisputeForUpdate(tx, disputeId);

    if (dispute.state === "resolved" || dispute.state === "closed") {
      return dispute;
    }

    const trade = await lockTradeForUpdate(tx, dispute.tradeId);

    if (resolutionType === "full_refund") {
      await refundEscrow(tx, trade, idempotencyKey);
    } else if (resolutionType === "full_release") {
      await releaseEscrow(tx, trade, idempotencyKey);
    } else {
      await partialSettlement(tx, trade, dispute, idempotencyKey);
    }

    await tx.update(p2pDisputes).set({
      state: "resolved",
      resolutionType,
      adminUserId,
      updatedAt: new Date(),
    }).where(eq(p2pDisputes.id, disputeId));

    await auditDisputeResolution(tx, disputeId, adminUserId, resolutionType, idempotencyKey);
  });
}
```

### 5.5 Reconciliation job
```ts
export async function runDailyP2PReconciliation(businessDate: string) {
  const summary = await buildDailyP2PSummary(businessDate);
  const walletTotal = await getWalletBalanceSnapshot();
  const ledgerTotal = await getLedgerBalanceSnapshot();

  const mismatches = [];
  if (walletTotal !== ledgerTotal) {
    mismatches.push({
      type: "balance_mismatch",
      walletTotal,
      ledgerTotal,
    });
  }

  const result = {
    ...summary,
    walletBalanceTotal: walletTotal,
    ledgerBalanceTotal: ledgerTotal,
    mismatchCount: mismatches.length,
    status: mismatches.length ? "warning" : "ok",
  };

  await saveReconciliationRun(result);
  if (mismatches.length) await raiseAdminAlert(result, mismatches);

  return result;
}
```

---

## 6) Digital offer classification

### account_sale
Required fields:
- target_username or account_identifier
- access_transfer_steps
- ownership_claim
- verification_steps

Validation rules:
- user must pass enhanced verification
- platform policy must permit account transfer
- proof of ownership required

Delivery expectations:
- credential transfer or ownership handoff
- confirmation of access handover

Dispute criteria:
- account not delivered
- account inaccessible
- ownership mismatch

Legal implications:
- highest risk category
- may be prohibited in some jurisdictions
- may require explicit user acknowledgements

### asset_exchange
Required fields:
- asset_description
- source_of_asset
- transfer_method
- exchange_ratio

Validation rules:
- asset must be uniquely identifiable
- transferability must be supported
- no prohibited asset classes

Delivery expectations:
- asset transfer, token transfer, or documented assignment

Dispute criteria:
- asset not transferred
- asset differs from description
- transfer failed

Legal implications:
- policy- and asset-specific
- may require proof of title or control

### service_trade
Required fields:
- service_scope
- delivery_milestones
- completion_evidence
- estimated_delivery_date

Validation rules:
- clear scope and acceptance criteria
- timing must be defined
- deliverables must be measurable

Delivery expectations:
- work product, completion report, or service confirmation

Dispute criteria:
- incomplete service
- quality below agreed scope
- missed deadlines

Legal implications:
- requires service terms
- may involve consumer or contractor law considerations

### hybrid_trade
Required fields:
- combined asset/service description
- component breakdown
- settlement split
- delivery plan

Validation rules:
- each component must be valid independently
- combined risk must not exceed policy thresholds

Delivery expectations:
- multiple fulfillment steps

Dispute criteria:
- one component delivered, another not
- partial performance disagreement

Legal implications:
- treat as composite agreement
- may require segmented resolution

---

## 7) Escrow system design

### Core behavior
- Funds are reserved when the trade opens.
- Funds move to locked escrow when payment is expected.
- Funds release only after confirmed conditions.
- Frozen escrow blocks all normal release paths.

### Timeout rules
- Payment timeout: buyer must mark paid within N minutes.
- Confirmation timeout: seller must confirm within M hours.
- Expiry timeout: unresolved trades auto-cancel or auto-fallback.

### Partial release
Allowed only when:
- policy explicitly enables it
- admin approves it
- settlement is documented at line-item level

### Dispute freeze
- On dispute open, escrow status becomes `frozen`.
- All release/refund actions require dispute resolution or admin override.
- Freeze is itself audit logged.

---

## 8) Dispute engine

### Evidence collection
- uploaded files
- screenshots
- chat logs
- external links
- structured notes

### Dispute states
- open
- evidence_collection
- under_review
- escalated
- resolved
- closed

### Admin workflow
1. open dispute
2. collect evidence
3. assign reviewer
4. review facts
5. choose resolution
6. post ledger entries
7. close dispute

### Resolution types
- full refund
- full release
- partial settlement

### Irreversibility rule
Once resolved:
- ledger postings are immutable
- trade accounting state is locked
- only admin override can append reversal entries

---

## 9) Legal + policy layer

### Digital asset policy
- define which digital assets are allowed
- define prohibited asset classes
- require clear ownership or control proof
- require disclosure of transfer limitations

### Account trading policy
- explicitly allowed only if jurisdiction and platform policy permit it
- require enhanced verification
- require user acknowledgement of transfer risk
- prohibit stolen, rented, or deceptive account sales

### Prohibited activities
- stolen credentials
- sanctioned goods/services
- fraud-linked assets
- illegal content or prohibited commerce
- attempts to bypass platform controls

### User responsibilities
- provide accurate listing details
- complete delivery as described
- keep evidence
- respect dispute and admin decisions
- avoid external settlement manipulation

### Definition of “delivery”
Delivery means the agreed item, right, access, asset, or service was transferred in the form specified in the offer and accepted by the counterparty or by final dispute ruling.

### Definition of “breach”
Breach means a material failure to deliver, a misrepresentation, a refusal to comply with the agreed trade process, or a violation of platform policy.

---

## 10) Frontend refactor plan

### Split `p2p.tsx` into:
- `MarketplacePage`
- `OfferCreationWizard`
- `TradeRoom`
- `DisputeCenter`
- shared hooks/services

### UI principles
- Use real-time updates via WebSocket.
- Show a clear trade timeline.
- Make status layers visually distinct.
- Separate financial indicators from chat and action controls.
- Keep mobile and desktop layouts intentionally different.

### Suggested file split
```text
client/src/pages/p2p/
  MarketplacePage.tsx
  OfferCreationWizard.tsx
  TradeRoom.tsx
  DisputeCenter.tsx
  p2p-hooks.ts
  p2p-services.ts
  p2p-types.ts
  p2p-timeline.tsx
```

### Data flow
- page loads summary data
- hooks subscribe to trade and dispute events
- services call idempotent API endpoints
- UI renders authoritative backend state only

---

## 11) API idempotency model

### Required idempotency behavior
Every financial endpoint must accept:
- `Idempotency-Key` header
- or explicit `idempotencyKey` body field

### Storage rule
Persist a request fingerprint:
- action type
- actor
- business entity
- request payload hash
- resulting entity id

### Response rule
If a duplicate request arrives:
- return the original response
- never re-post ledger entries
- never re-run escrow movement

---

## 12) Risk engine

### Fraud detection hooks
- repeated failed negotiation attempts
- suspicious IP/device changes
- repeated dispute losses
- abnormal payout patterns
- evidence tampering attempts

### Abnormal behavior detection
- high velocity trade creation
- unusual cancellation ratio
- excessive partial settlements
- sudden trust score drops
- wallet/ledger mismatch signals

### Velocity limits
- trades per hour
- escrow value per day
- dispute count per week
- negotiation rounds per offer
- payout frequency per period

### Trust scoring
Signals:
- completion rate
- dispute ratio
- payment reliability
- age of account
- identity verification level
- recent negative events

### Manual review triggers
- trust score below threshold
- digital asset sale flagged as sensitive
- repeated dispute escalation
- ledger mismatch
- evidence conflict

---

## 13) Migration plan from current system

### Phase 1 — introduce canonical domain model
- Add the new schema tables.
- Add state enums and transition guards.
- Keep current routes working.
- Mirror old trade states to new states.

### Phase 2 — ledger first
- Route every P2P money mutation through the ledger.
- Add idempotency keys to all write endpoints.
- Build reconciliation job and dashboard.
- Backfill historical P2P ledger data from existing trade records.

### Phase 3 — split service and state layers
- Refactor backend modules into:
  - offers
  - negotiations
  - trades
  - escrow
  - ledger
  - disputes
  - risk
  - reconciliation
- Extract UI into the new page/component structure.
- Keep old endpoints as compatibility shims if needed.

### Phase 4 — policy enforcement
- Enable digital trade classification validation.
- Enforce legal/policy checks at offer creation.
- Add admin override workflow and audit logging.

### Phase 5 — deprecate legacy coupling
- Remove mixed operational/financial logic from UI.
- Remove direct wallet mutations outside ledger service.
- Stop relying on status fields as the source of truth.
- Retire old monolithic `p2p.tsx` after parity is confirmed.

---

## 14) Implementation notes for the current codebase

### Backend integration points
- `server/routes/p2p-trading/*`
- `server/routes/p2p-disputes/*`
- `server/admin-routes/admin-p2p/*`
- `server/storage/p2p/*`
- `server/setup/schedulers.ts`

### Frontend integration points
- `client/src/pages/p2p.tsx`
- `client/src/pages/admin/admin-p2p.tsx`
- `client/src/pages/admin/p2p/p2p-trade-dispute-module.tsx`

### Immediate architectural correction
Do not let UI status labels define accounting truth.
The ledger and trade state machine must own that truth.

---

## 15) Phased implementation plan

### Phase 1 — foundation and safety rails
Goal: add the minimum shared primitives without touching live trade flows.
- Introduce the canonical ledger tables and types.
- Add idempotency key support to financial mutations.
- Add strict state transition helpers.
- Add audit hooks for trade and dispute state changes.
- Keep all existing P2P endpoints compatible.

Exit criteria:
- New schema and helpers compile.
- No existing P2P user flow is broken.
- Duplicate financial requests are safely detected.

### Phase 2 — ledger-first settlement
Goal: route every P2P money movement through the ledger.
- Implement ledger posting service.
- Wire escrow reserve/release/refund to ledger entries.
- Add balance-before / balance-after checks.
- Add admin fee accounting.
- Backfill historical trades into the ledger.

Exit criteria:
- Opening a trade produces ledger entries.
- Completing or cancelling a trade produces matching accounting rows.
- Balance mismatch detection is available.

### Phase 3 — reconciliation and observability
Goal: make finance operations inspectable and auditable.
- Add daily reconciliation job.
- Add mismatch alerts and admin dashboard surface.
- Add trade lifecycle summaries.
- Add dispute outcome summaries.
- Add fee collection reporting.

Exit criteria:
- Daily reconciliation can run end-to-end.
- Mismatches are visible to admins.
- Finance snapshots are reproducible from the ledger.

### Phase 4 — trade lifecycle hardening
Goal: formalize the 3-layer state machine.
- Enforce business / operational / accounting state separation.
- Reject invalid transitions.
- Log every transition event.
- Make trade completion and cancellation idempotent.
- Add timeout automation for stale trades.

Exit criteria:
- All transition paths are deterministic.
- No invalid state jumps are possible.
- Repeated requests are safe.

### Phase 5 — dispute and policy enforcement
Goal: make dispute resolution financially and legally consistent.
- Add structured dispute state flow.
- Require evidence attachment.
- Enforce resolution types.
- Generate ledger entries on final resolution.
- Add legal classification checks for digital offers.

Exit criteria:
- Every dispute ends with a financial outcome.
- Sensitive digital trades are classified.
- Admin override remains possible and auditable.

### Phase 6 — frontend modularization
Goal: reduce `p2p.tsx` risk by splitting the UI.
- Extract marketplace page.
- Extract offer wizard.
- Extract trade room.
- Extract dispute center.
- Extract shared hooks/services.

Exit criteria:
- `p2p.tsx` becomes a thin router/container.
- Each surface can be tested independently.
- Real-time updates still work.

### Phase 7 — optional service isolation
Goal: only if there is a real operational need.
- Keep extraction behind a feature flag.
- Start with read-only routes and chat.
- Move write paths only after stabilization.
- Keep a fallback to in-process handlers.

Exit criteria:
- The system can run in-process or isolated.
- No double-writes or scheduler duplication.
- Rollback is a single config change.

---

## 15) Final summary

This design turns P2P into a financially auditable system with:
- double-entry accounting
- strict state separation
- daily reconciliation
- policy-aware digital trade handling
- immutable dispute resolution
- risk scoring and manual review
- modular frontend and backend boundaries

The core rule is simple:
**every trade transition, every escrow movement, and every dispute outcome must be traceable, idempotent, and financially represented in the ledger.**
