ALTER TABLE country_payment_methods
  ADD COLUMN IF NOT EXISTS is_withdrawal_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_country_payment_methods_withdrawal_enabled
  ON country_payment_methods (is_withdrawal_enabled);
