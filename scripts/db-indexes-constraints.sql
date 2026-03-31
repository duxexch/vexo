-- ============================================================
-- VEX Platform: Critical Database Indexes & Constraints
-- Run this migration against PostgreSQL to add missing indexes
-- and CHECK constraints for data integrity.
-- ============================================================

-- ===================== INDEXES ==============================

-- liveGameSessions: player lookup indexes (critical for game queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_player2 ON live_game_sessions (player2_id) WHERE player2_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_player3 ON live_game_sessions (player3_id) WHERE player3_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_player4 ON live_game_sessions (player4_id) WHERE player4_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_winner ON live_game_sessions (winner_id) WHERE winner_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_status ON live_game_sessions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_game_sessions_challenge ON live_game_sessions (challenge_id) WHERE challenge_id IS NOT NULL;

-- notifications: composite for user notification queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read, created_at DESC);

-- challenges: game type lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_game_type ON challenges (game_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_winner ON challenges (winner_id) WHERE winner_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_status ON challenges (status);

-- spectatorSupports: session lookup (critical for settlement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spectator_supports_session ON spectator_supports (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spectator_supports_status ON spectator_supports (status);

-- matchedSupports: winner and support lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matched_supports_winner ON matched_supports (winner_id) WHERE winner_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matched_supports_winner_support ON matched_supports (winner_support_id) WHERE winner_support_id IS NOT NULL;

-- transactions: processed by agent lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_processed_by ON transactions (processed_by) WHERE processed_by IS NOT NULL;

-- complaints: transaction and escalation lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_transaction ON complaints (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_escalated ON complaints (escalated_to) WHERE escalated_to IS NOT NULL;

-- p2pDisputes: participant lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_p2p_disputes_initiator ON p2p_disputes (initiator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_p2p_disputes_respondent ON p2p_disputes (respondent_id);

-- gameMatches: winner lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_matches_winner ON game_matches (winner_id) WHERE winner_id IS NOT NULL;

-- challengeSpectatorBets: backed player
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenge_spectator_bets_backed ON challenge_spectator_bets (backed_player_id);

-- challengeGameSessions: winner and turn
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenge_game_sessions_winner ON challenge_game_sessions (winner_id) WHERE winner_id IS NOT NULL;

-- gameMoves: session lookup for replay  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_moves_session ON game_moves (session_id, move_number);

-- gameSpectators: session lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_spectators_session ON game_spectators (session_id);

-- projectCurrencyWallets: user lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_currency_wallets_user ON project_currency_wallets (user_id);

-- projectCurrencyLedger: wallet lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_currency_ledger_wallet ON project_currency_ledger (wallet_id);

-- ===================== CHECK CONSTRAINTS ====================

-- User balance must not go negative
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_balance_non_negative CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_total_deposited_non_negative CHECK (total_deposited >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_total_withdrawn_non_negative CHECK (total_withdrawn >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent balances
DO $$ BEGIN
  ALTER TABLE agents ADD CONSTRAINT chk_agents_balance_non_negative CHECK (current_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE agents ADD CONSTRAINT chk_agents_daily_limit_non_negative CHECK (daily_limit >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Affiliate commissions
DO $$ BEGIN
  ALTER TABLE affiliates ADD CONSTRAINT chk_affiliates_commission_non_negative CHECK (total_commission_earned >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE affiliates ADD CONSTRAINT chk_affiliates_pending_non_negative CHECK (pending_commission >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction amounts must be positive
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Challenge bet amounts must be non-negative
DO $$ BEGIN
  ALTER TABLE challenges ADD CONSTRAINT chk_challenges_bet_non_negative CHECK (bet_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- P2P offer/trade amounts must be positive
DO $$ BEGIN
  ALTER TABLE p2p_offers ADD CONSTRAINT chk_p2p_offers_price_positive CHECK (price > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE p2p_offers ADD CONSTRAINT chk_p2p_offers_amount_positive CHECK (available_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE p2p_trades ADD CONSTRAINT chk_p2p_trades_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deposit amounts must be positive
DO $$ BEGIN
  ALTER TABLE deposit_requests ADD CONSTRAINT chk_deposit_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Game bet amounts must be non-negative
DO $$ BEGIN
  ALTER TABLE game_sessions ADD CONSTRAINT chk_game_sessions_bet_non_negative CHECK (bet_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Spectator support amounts must be positive
DO $$ BEGIN
  ALTER TABLE spectator_supports ADD CONSTRAINT chk_spectator_support_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Gift prices must be non-negative
DO $$ BEGIN
  ALTER TABLE gift_items ADD CONSTRAINT chk_gift_items_price_non_negative CHECK (price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Project currency wallet balances
DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_pcw_purchased_non_negative CHECK (purchased_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_pcw_earned_non_negative CHECK (earned_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_pcw_total_non_negative CHECK (total_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_pcw_locked_non_negative CHECK (locked_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===================== DONE =================================
-- All indexes created with CONCURRENTLY (non-blocking on live DB)
-- All constraints use DO/EXCEPTION to be idempotent
