-- Security CHECK constraints -- prevent negative balances at DB level
-- Run this migration manually: psql $DATABASE_URL -f migrations/security_check_constraints.sql

-- Prevent negative user balance
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_balance_non_negative CHECK (CAST(balance AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent negative wallet balances
DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_wallet_purchased_non_negative CHECK (CAST(purchased_balance AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_wallet_earned_non_negative CHECK (CAST(earned_balance AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_currency_wallets ADD CONSTRAINT chk_wallet_total_non_negative CHECK (CAST(total_balance AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent negative transaction amounts
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT chk_transaction_amount_positive CHECK (CAST(amount AS DECIMAL) > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent negative deposited/withdrawn totals
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_total_deposited_non_negative CHECK (CAST(total_deposited AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_total_withdrawn_non_negative CHECK (CAST(total_withdrawn AS DECIMAL) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
