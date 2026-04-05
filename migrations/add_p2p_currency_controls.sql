-- Add admin-controlled currency governance for P2P buy/sell and deposit flows.
ALTER TABLE p2p_settings
  ADD COLUMN IF NOT EXISTS p2p_buy_currencies text[] NOT NULL DEFAULT ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP'],
  ADD COLUMN IF NOT EXISTS p2p_sell_currencies text[] NOT NULL DEFAULT ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP'],
  ADD COLUMN IF NOT EXISTS deposit_enabled_currencies text[] NOT NULL DEFAULT ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP'];

UPDATE p2p_settings
SET p2p_buy_currencies = ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']
WHERE p2p_buy_currencies IS NULL;

UPDATE p2p_settings
SET p2p_sell_currencies = ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']
WHERE p2p_sell_currencies IS NULL;

UPDATE p2p_settings
SET deposit_enabled_currencies = ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']
WHERE deposit_enabled_currencies IS NULL;
