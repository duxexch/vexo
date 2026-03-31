# Atomic Stats and Payout Guarantees

## Overview

This document outlines the atomicity guarantees for player statistics and financial payouts in the VEX gaming platform. These guarantees are critical for maintaining data integrity, financial accuracy, and audit compliance.

## Core Guarantees

### 1. Paid Game Settlement

For paid games (games with stakes via challenges), the following operations occur within a **single database transaction**:

- Winner balance credit (stake minus platform fee)
- Winner stats update (gamesPlayed, gamesWon, per-game stats, win streak, totalEarnings)
- Loser stats update (gamesPlayed, gamesLost, per-game stats, win streak reset)
- Transaction records creation (win/loss entries with balance snapshots)
- Game session status update (completed, winnerId, endedAt)

**Key Implementation**: `storage.settleGamePayout()` in `server/storage.ts`

```typescript
async settleGamePayout(
  sessionId: string,
  winnerId: string,
  loserId: string,
  stakeAmount: string,
  platformFeePercent: number = 0,
  gameType: string = 'chess'
): Promise<{ success: boolean; error?: string }>
```

### 2. Row-Level Locking

All financial and stats operations use PostgreSQL's `SELECT ... FOR UPDATE` to prevent race conditions:

```typescript
// Lock users in consistent order to prevent deadlocks
const [id1, id2] = [winnerId, loserId].sort();
const [user1] = await tx.select().from(users).where(eq(users.id, id1)).for('update');
const [user2] = await tx.select().from(users).where(eq(users.id, id2)).for('update');
```

### 3. Rollback on Failure

If any operation within the transaction fails:
- All balance changes are rolled back
- All stats changes are rolled back
- No partial updates are committed
- Error is logged and returned to caller

### 4. Non-Paid Game Stats

For free games (no stake), stats are updated via `storage.updateGameStats()`:

- Uses separate transaction with row-level locking
- Updates gamesPlayed, gamesWon/Lost/Draw, per-game stats, win streaks
- No balance changes for free games

### 5. Separation of Concerns

Paid games and non-paid games have separate code paths:

```typescript
// In handleGameOver:
const isPaidGame = session.challengeId && !isDraw;
if (!statsUpdatedInPayout && !isPaidGame) {
  // Only update stats for non-paid games here
  await storage.updateGameStats(...);
}
```

This ensures paid game stats are ONLY updated within the payout transaction.

## Game Type Validation

Both `settleGamePayout` and `updateGameStats` validate game types before updating per-game statistics:

```typescript
const validGameTypes = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];
const isValidGameType = validGameTypes.includes(gameType);
```

Only valid game types receive per-game stat updates (e.g., `chessWon`, `backgammonPlayed`).

## Statistics Fields Updated

### Per-Game Completion
| Field | Winner | Loser | Draw |
|-------|--------|-------|------|
| gamesPlayed | +1 | +1 | +1 |
| gamesWon | +1 | - | - |
| gamesLost | - | +1 | - |
| gamesDraw | - | - | +1 |
| currentWinStreak | +1 | 0 | 0 |
| longestWinStreak | max(current, streak+1) | - | - |
| totalEarnings | +winAmount | - | - |
| {gameType}Played | +1 | +1 | +1 |
| {gameType}Won | +1 | - | - |

## Database Indexes for Leaderboard Performance

The following indexes are maintained for efficient leaderboard queries:

```typescript
index("idx_users_games_won").on(table.gamesWon),
index("idx_users_total_earnings").on(table.totalEarnings),
index("idx_users_longest_win_streak").on(table.longestWinStreak),
index("idx_users_chess_won").on(table.chessWon),
index("idx_users_backgammon_won").on(table.backgammonWon),
index("idx_users_domino_won").on(table.dominoWon),
index("idx_users_tarneeb_won").on(table.tarneebWon),
index("idx_users_baloot_won").on(table.balootWon),
```

## Error Handling

### Payout Failure Scenarios
1. **User not found**: Transaction rolls back, error returned
2. **Insufficient balance**: Prevented at challenge join time (balance verified before game starts)
3. **Database error**: Transaction rolls back, error logged with session ID

### Logging
All payout operations are logged:
```
[WS] Game payout and stats settled: winner=<id>, stake=<amount>
[WS] Stats not updated for paid game <sessionId> due to payout failure
```

## Audit Trail

Every successful payout creates transaction records with:
- `balanceBefore` and `balanceAfter` snapshots
- `referenceId` linking to game session
- `processedAt` timestamp
- Transaction type (`win` for winner, `stake` for loser)

## Testing

Regression tests are available in `server/tests/payout-stats-atomicity-test.ts`:

```bash
npx tsx server/tests/payout-stats-atomicity-test.ts
```

Test coverage includes:
1. Atomic payout + stats updates
2. Transaction rollback on failure
3. Non-paid game stats updates
4. Draw game handling
5. Concurrent payout integrity

## Version History

| Date | Change |
|------|--------|
| 2026-01-16 | Initial implementation of atomic stats in payout |
| 2026-01-16 | Added gameType validation |
| 2026-01-16 | Added leaderboard indexes |
