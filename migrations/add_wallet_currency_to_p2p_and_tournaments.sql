-- Multi-currency wallet routing for P2P and tournament money paths.
--
-- Adds a nullable `wallet_currency` column to:
--   * p2p_offers              (which sub-wallet escrow is held in)
--   * p2p_trades              (carried from offer for refund/payout symmetry)
--   * tournament_participants (which wallet the entry fee was paid from)
--
-- NULL means "use the user's primary balance" (`users.balance`) — preserves
-- the legacy single-currency behaviour for existing rows and for users who
-- did not opt into multi-currency wallets.

ALTER TABLE p2p_offers
  ADD COLUMN IF NOT EXISTS wallet_currency text;

ALTER TABLE p2p_trades
  ADD COLUMN IF NOT EXISTS wallet_currency text;

ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS wallet_currency text;
