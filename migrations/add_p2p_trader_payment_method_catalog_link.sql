-- Link trader P2P payment methods to admin-managed country payment method catalog.
ALTER TABLE p2p_trader_payment_methods
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_payment_method_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'p2p_trader_payment_methods_country_payment_method_id_fkey'
  ) THEN
    ALTER TABLE p2p_trader_payment_methods
      ADD CONSTRAINT p2p_trader_payment_methods_country_payment_method_id_fkey
      FOREIGN KEY (country_payment_method_id)
      REFERENCES country_payment_methods(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_p2p_trader_payment_methods_country_code
  ON p2p_trader_payment_methods(country_code);

CREATE INDEX IF NOT EXISTS idx_p2p_trader_payment_methods_country_payment_method_id
  ON p2p_trader_payment_methods(country_payment_method_id);
