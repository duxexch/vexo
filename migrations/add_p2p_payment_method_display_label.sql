-- Add optional trader-defined display label for P2P payment methods.
ALTER TABLE p2p_trader_payment_methods
  ADD COLUMN IF NOT EXISTS display_label text;
