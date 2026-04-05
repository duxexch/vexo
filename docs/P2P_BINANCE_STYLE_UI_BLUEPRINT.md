# P2P Binance-Style UI Blueprint (Design-Only)

## Goal

Build a P2P marketplace UI that is visually close to Binance P2P patterns while keeping VEX branding and implementation flexibility.

## Design Principles

- Dense information layout with fast scanning.
- Trust-first ad cards (merchant identity, completion, trade count, payment window).
- Action-forward CTA area (Buy/Sell button always visible).
- Mobile-first structure with desktop table mode.
- Keep all interactions one or two taps away.

## Visual System

- Background: deep navy surfaces with layered panels.
- Accent 1: exchange yellow for active tabs, highlights, and key chips.
- Accent 2: green CTA for Buy/Sell actions.
- Text hierarchy:
  - Primary: merchant + price.
  - Secondary: limits, amount, payment rails.
  - Tertiary: metadata chips and helper labels.
- Dividers: thin low-contrast separators between ad rows.

## Mobile Layout (Reference Pattern)

1. Top bar: back icon, page title (P2P), fiat/currency selector pill.
2. Trade side tabs: Buy | Sell.
3. Asset tabs row: USDT, BTC, BNB, etc.
4. Quick filters row: amount, payment method, price sort.
5. Utility controls: Pro toggle + Filter button.
6. Ad row body: merchant info + trust stats + price block + limits + payment rails.
7. Right action area: Buy/Sell button or Restricted state.

## Desktop Layout (Reference Pattern)

- Header area:
  - Buy/Sell segmented tabs.
  - Asset tabs.
  - Filter/sort toolbar (payment method, fiat currency, amount range, sort).
- Main listing table columns:
  - Merchant.
  - Price.
  - Available amount.
  - Order limits.
  - Payment method(s).
  - Action button.
- Sticky top filter bar when scrolling long lists.

## Core Screens (Design Scope)

- P2P marketplace list (mobile + desktop).
- Order creation bottom sheet/dialog.
- Trade room screen (status + timer + chat + action timeline).
- My Orders list with status chips.
- My Ads list with quick actions (pause/edit/delete).
- Create Ad wizard (Buy Ad and Sell Ad variants).
- Merchant profile summary (completion, total trades, verification marks).

## Buyer Flow (taking a Sell ad)

1. Choose Buy tab and asset.
2. Set fiat currency and filters.
3. Select an ad based on trust + payment method.
4. Enter amount in order sheet and confirm.
5. Trade room opens with countdown timer and instructions.
6. Buyer sends external payment and clicks Mark as Paid.
7. Seller confirms receipt and releases crypto.
8. Order completes with success state and optional rating.

## Seller Flow (taking a Buy ad)

1. Choose Sell tab and asset.
2. Filter by payment channels and limits.
3. Select matching Buy ad.
4. Enter crypto/fiat amount and confirm order.
5. Wait for buyer payment confirmation in trade room.
6. Verify receipt externally.
7. Click Release Crypto.
8. Order completes and appears in history.

## Ad Creator Flow (Sell Ad)

1. Open Create Ad -> Sell.
2. Set asset, price model (fixed/floating), total quantity.
3. Set min/max order limits and payment window.
4. Select payment methods and write terms/auto-reply.
5. Publish ad.
6. Manage ad state (active/paused), edit limits/price, archive when needed.

## Ad Creator Flow (Buy Ad)

1. Open Create Ad -> Buy.
2. Set target asset and pricing rule.
3. Define budget limits and accepted payment methods.
4. Define order constraints and instructions.
5. Publish ad.
6. Process incoming seller orders from trade room workflow.

## Required Ad Row Elements

- Merchant avatar + name.
- Verification/trust badges.
- Trade count.
- Completion percentage.
- Payment window (e.g., 15 min).
- Main price line.
- Available crypto amount.
- Min/Max order limits.
- Payment rail tags (truncate with full-name reveal).
- Action button state (Buy/Sell/Restricted).

## Order States (UI)

- Pending payment.
- Buyer marked paid.
- Seller confirmed/released.
- Completed.
- Cancelled.
- Disputed.

## Design-Only Notes

- No business-rule implementation in this phase.
- Keep components ready for later API wiring.
- Preserve i18n architecture by binding all labels to translation keys at implementation phase.

## Suggested Future Feature

Trust Heat Score:

- A compact per-ad composite score based on completion, dispute ratio, payment-method reliability, and recency.
- Shown as a small colored chip next to merchant name.
- Helps users decide faster in high-density lists.
