-- Add per-user P2P trading permission and optional monthly trading cap
ALTER TABLE p2p_trader_profiles
ADD COLUMN IF NOT EXISTS can_trade_p2p boolean NOT NULL DEFAULT false;

UPDATE p2p_trader_profiles
SET can_trade_p2p = can_create_offers
WHERE can_trade_p2p = false
	AND can_create_offers = true;

ALTER TABLE p2p_trader_profiles
ADD COLUMN IF NOT EXISTS monthly_trade_limit numeric(15,2);

ALTER TABLE p2p_trader_profiles
DROP CONSTRAINT IF EXISTS chk_p2p_trader_profiles_monthly_trade_limit_non_negative;

ALTER TABLE p2p_trader_profiles
ADD CONSTRAINT chk_p2p_trader_profiles_monthly_trade_limit_non_negative
CHECK (monthly_trade_limit IS NULL OR monthly_trade_limit >= 0);
