# Financial System Analysis Reference

Date: 2026-05-02  
Purpose: A persistent reference for future work on the platform's money, currency, gameplay economy, and admin controls.

## 1) Executive Summary

The platform uses a multi-layer financial model:

- **USD cash layer**
- **VEX / Project Currency layer**
- **Multi-currency wallet layer**
- **Game stake / win settlement layer**
- **Investment layer**
- **Affiliate / marketer commission layer**

Financial control is spread across multiple modules rather than a single unified admin screen. Game engines generally do not handle money directly; they handle gameplay logic, while settlement happens in backend finance routes/services.

---

## 2) Currency and Money Model

### A. USD
Used as the primary cash balance and for:
- Deposits
- Withdrawals
- Investment stock purchases
- Some challenge and tournament fees
- Legacy wallet flows

Key places:
- `users.balance`
- `transactions`
- `transaction-user.ts`
- `challenges.currencyType`
- `tournaments.currency`

### B. VEX / Project Currency
Used as the project-native currency, especially in:
- Arcade/HTML5 mini-games
- Some P2P and chat-adjacent monetized features
- Project currency conversion flows

Key places:
- `projectCurrencySettings`
- `projectCurrencyWallets`
- `projectCurrencyLedger`
- `arcade_sessions`
- `client/src/pages/coin.tsx`
- `client/src/pages/challenges.tsx`
- `client/src/pages/challenge-watch.tsx`

### C. Multi-Currency Wallets
Users may have multiple currency balances via:
- `user_currency_wallets`

The primary legacy balance still lives in:
- `users.balance`
- `users.balanceCurrency`

This supports:
- Primary currency + sub-wallets
- Currency-specific deposits and withdrawals
- Currency-specific game routing and P2P flows

---

## 3) Game Economy Model

### A. Core Game Pricing
The game catalog supports monetary settings such as:
- `minBet`
- `maxBet`
- `houseEdge`
- `houseFee`
- `playPrice`
- `priceVex`
- `freePlayLimit`
- `freePlayPeriod`

Important files:
- `shared/schema.ts`
- `shared/arcade-games.ts`
- `server/game-engines/index.ts`
- `client/src/pages/admin/admin-unified-games.tsx`

### B. Challenge and Tournament Fees
Challenges and tournaments use:
- `betAmount`
- `entryFee`
- `currencyType`
- `currency`

Relevant tables:
- `challenges`
- `tournaments`
- `tournamentParticipants`
- `tournamentMatches`
- `challengeSpectatorBets`
- `spectatorSupports`
- `matchedSupports`

### C. Gift / Emoji / Support Monetization
Inside live game and chat surfaces:
- `giftItems`
- `spectatorGifts`
- `gameplayEmojis`
- `gameplayMessages.emojiCost`
- `liveGameSessions.totalGiftsValue`

These create additional in-game spending flows beyond core match stakes.

---

## 4) Arcade Economy

Arcade HTML5 games have the clearest direct VEX economy.

Relevant route:
- `server/routes/arcade-sessions.ts`

Relevant table:
- `arcade_sessions`

Behavior:
- Reads user balance
- Checks if user can afford `ARCADE_ENTRY_COST_VEX`
- Calculates:
  - `rewardVex`
  - `netVex`
  - `balanceBefore`
  - `balanceAfter`
- If balance is insufficient:
  - switches to free-play mode
  - no debit
  - no reward

This makes VEX a real operational currency in the arcade layer, not just a label.

---

## 5) Wallet and Ledger Architecture

### A. Primary Cash Ledger
Main transactions:
- `transactions`

Tracks:
- deposits
- withdrawals
- stakes
- wins
- bonuses
- commissions
- refunds
- game refunds
- currency conversions

### B. Project Currency Wallets
- `projectCurrencyWallets`
- `projectCurrencyLedger`
- `projectCurrencyConversions`
- `projectCurrencySettings`

These are the core VEX/project currency data structures.

### C. Multi-Currency Wallets
- `user_currency_wallets`

Used for:
- currency-specific deposit flows
- currency-specific withdrawal flows
- wallet routing for users with multi-currency enabled

### D. Wallet Helpers / Services
Key helper/service files:
- `server/storage/project-currency/wallets.ts`
- `server/storage/project-currency/settings.ts`
- `server/storage/project-currency/operations.ts`
- `server/storage/users/settle-project.ts`
- `server/lib/wallet-balances`
- `server/lib/payout`

---

## 6) Admin Dashboard Coverage

### A. Games Administration
File:
- `client/src/pages/admin/admin-unified-games.tsx`

This is the main game economy control surface.

It manages:
- `minStake`
- `maxStake`
- `houseFee`
- `priceVex`
- `freePlayLimit`
- `freePlayPeriod`
- `status`
- `displayLocations`
- visual identity / icons / colors

### B. Investment Administration
Files:
- `client/src/pages/admin/admin-investments.tsx`
- `server/routes/investments.ts`
- `shared/investments.ts`

Manages:
- investment stocks
- payment methods
- order review and moderation
- stock lifecycle and visibility

### C. Marketer / Commission Administration
File:
- `client/src/pages/admin/admin-marketers.tsx`

Manages:
- CPA
- RevShare
- commission hold days
- commission scheduler runs
- marketer badges
- performance metrics

### D. Currency Administration
The sidebar includes:
- `/admin/currency`

This file path was not present in the workspace path that was queried, but the schema confirms the existence of the project currency layer:
- `projectCurrencySettings`
- `projectCurrencyWallets`
- `projectCurrencyLedger`

---

## 7) Relevant Routes and Settlement Flows

### A. Deposits and Withdrawals
File:
- `server/routes/transaction-user.ts`

Handles:
- deposit configuration
- currency validation
- FX conversion
- primary balance updates
- sub-wallet updates
- transaction creation
- audit logs
- admin alerts
- user notifications

### B. Agent Transaction Processing
File:
- `server/routes/transaction-agent.ts`

Handles:
- transaction approval/rejection/completion
- balance updates
- notifications
- agent routing logic

### C. Challenge Settlement
Challenge payout settlement is handled by:
- `server/lib/payout`
- `server/setup/schedulers.ts`

Watchdogs and timeout flows call:
- `settleChallengePayout`
- `settleDrawPayout`

These are invoked for:
- chess
- domino
- language duel
- baloot
- tarneeb

### D. Arcade Session Settlement
File:
- `server/routes/arcade-sessions.ts`

Handles:
- session save
- reward decision
- balance mutation
- session history
- personal bests
- anti-cheat validation

---

## 8) Gameplay vs Money Responsibility Split

### Game engines do not own money
Examples:
- `server/game-engines/ludo/engine.ts`
- other game engines

They handle:
- move validation
- turn order
- scoring
- winner detection
- game-state transitions

They do **not** directly manage money settlement.

### Money is handled in routes/services
Settlement and balance changes happen in:
- route handlers
- storage services
- wallet helpers
- payout logic
- scheduler/watchdog jobs

This separation is important and should be preserved.

---

## 9) Known Gaps

### A. No single unified finance dashboard
There is no one admin page that fully combines:
- cash balances
- VEX balances
- multi-currency wallets
- stakes
- wins
- refunds
- commission settlements
- investments
- payout history

### B. Distributed economic logic
Financial logic is spread across:
- schema
- routes
- storage modules
- websocket handlers
- scheduler jobs
- admin pages

This is operationally functional, but it makes the system harder to reason about without a reference like this file.

### C. Game money flow is not always visible in UI
Some money flows are back-end only and not exposed clearly in admin views:
- settlement events
- wallet ledger events
- project currency conversions
- arbitration / timeout settlements

---

## 10) File Map for Future Work

### Core schema
- `shared/schema.ts`
- `shared/investments.ts`
- `shared/arcade-games.ts`

### Game economy and admin
- `client/src/pages/admin/admin-unified-games.tsx`
- `client/src/pages/admin/admin-investments.tsx`
- `client/src/pages/admin/admin-marketers.tsx`
- `client/src/pages/admin/admin-layout.tsx`

### User-facing money pages
- `client/src/pages/play.tsx`
- `client/src/pages/coin.tsx`
- `client/src/pages/wallet.tsx`
- `client/src/pages/p2p.tsx`
- `client/src/pages/challenges.tsx`
- `client/src/pages/challenge-watch.tsx`

### Routes and settlement
- `server/routes/transaction-user.ts`
- `server/routes/transaction-agent.ts`
- `server/routes/arcade-sessions.ts`
- `server/routes/investments.ts`
- `server/setup/schedulers.ts`

### Storage / wallet services
- `server/storage/project-currency/settings.ts`
- `server/storage/project-currency/wallets.ts`
- `server/storage/project-currency/operations.ts`
- `server/storage/users/settle-project.ts`
- `server/storage/index.ts`

### Tests
- `tests/wallet-balances.test.ts`
- `tests/wallet-routing-end-to-end.test.ts`
- `tests/wallet-conversion-routes-http.test.ts`
- `tests/tournament-refunds-endpoint.test.ts`
- `tests/admin-balance-adjust-validation.test.ts`

---

## 11) Practical Takeaway

If a future task needs financial changes, start with this order:

1. Determine which currency layer is involved:
   - USD
   - VEX
   - multi-currency sub-wallet
   - investment
   - affiliate commission

2. Identify the settlement layer:
   - transactions
   - wallet ledger
   - project currency ledger
   - payout logic
   - scheduler/watchdog

3. Check the admin surface:
   - games
   - currency
   - investments
   - marketers

4. Confirm the user-facing surface:
   - play
   - coin
   - wallet
   - challenges
   - p2p

5. Verify with tests:
   - wallet balances
   - routing
   - conversion
   - refunds
   - payout settlement

---

## 12) Final Summary

This platform has a real but distributed financial architecture.  
The most important truth is:

- **USD** is the base cash layer
- **VEX** is the project currency layer
- **wallets and ledgers** are the truth source
- **admin screens** configure the economy
- **routes/services** perform the actual settlement

Keep this file as the reference before making any future finance, wallet, or game-money change.
