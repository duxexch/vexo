DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'p2p_freeze_request_status') THEN
    CREATE TYPE p2p_freeze_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'exhausted');
  END IF;
END
$$;

ALTER TABLE p2p_trades
  ADD COLUMN IF NOT EXISTS freeze_hours_applied integer,
  ADD COLUMN IF NOT EXISTS freeze_reduction_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS freeze_until timestamp,
  ADD COLUMN IF NOT EXISTS freeze_benefit_source_request_id varchar;

CREATE INDEX IF NOT EXISTS idx_p2p_trades_freeze_until
  ON p2p_trades (freeze_until);

CREATE TABLE IF NOT EXISTS p2p_freeze_program_configs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  benefit_rate_percent numeric(6,3) NOT NULL DEFAULT 0.000,
  base_reduction_percent numeric(5,2) NOT NULL DEFAULT 50.00,
  max_reduction_percent numeric(5,2) NOT NULL DEFAULT 90.00,
  min_amount numeric(15,8) NOT NULL DEFAULT 10.00000000,
  max_amount numeric(15,8),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_p2p_freeze_program_configs_benefit_rate_range CHECK (benefit_rate_percent >= 0 AND benefit_rate_percent <= 100),
  CONSTRAINT chk_p2p_freeze_program_configs_base_reduction_range CHECK (base_reduction_percent >= 0 AND base_reduction_percent <= 100),
  CONSTRAINT chk_p2p_freeze_program_configs_max_reduction_range CHECK (max_reduction_percent >= 0 AND max_reduction_percent <= 100),
  CONSTRAINT chk_p2p_freeze_program_configs_amount_range CHECK (max_amount IS NULL OR max_amount >= min_amount)
);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_program_configs_currency
  ON p2p_freeze_program_configs (currency_code);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_program_configs_enabled
  ON p2p_freeze_program_configs (is_enabled);

CREATE TABLE IF NOT EXISTS p2p_freeze_program_methods (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id varchar NOT NULL REFERENCES p2p_freeze_program_configs(id) ON DELETE CASCADE,
  country_payment_method_id varchar NOT NULL REFERENCES country_payment_methods(id),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_program_methods_config
  ON p2p_freeze_program_methods (config_id);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_program_methods_method
  ON p2p_freeze_program_methods (country_payment_method_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_p2p_freeze_program_method
  ON p2p_freeze_program_methods (config_id, country_payment_method_id);

CREATE TABLE IF NOT EXISTS p2p_freeze_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  currency_code text NOT NULL,
  amount numeric(15,8) NOT NULL,
  approved_amount numeric(15,8) NOT NULL DEFAULT 0.00000000,
  remaining_amount numeric(15,8) NOT NULL DEFAULT 0.00000000,
  benefit_rate_percent_snapshot numeric(6,3) NOT NULL DEFAULT 0.000,
  status p2p_freeze_request_status NOT NULL DEFAULT 'pending',
  country_payment_method_id varchar NOT NULL REFERENCES country_payment_methods(id),
  payer_name text,
  payment_reference text,
  request_note text,
  admin_note text,
  approved_by varchar REFERENCES users(id),
  approved_at timestamp,
  rejected_at timestamp,
  rejection_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_p2p_freeze_requests_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_p2p_freeze_requests_approved_non_negative CHECK (approved_amount >= 0),
  CONSTRAINT chk_p2p_freeze_requests_remaining_non_negative CHECK (remaining_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_requests_user
  ON p2p_freeze_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_requests_status
  ON p2p_freeze_requests (status);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_requests_currency
  ON p2p_freeze_requests (currency_code);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_requests_created_at
  ON p2p_freeze_requests (created_at);

CREATE TABLE IF NOT EXISTS p2p_freeze_benefit_consumptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar NOT NULL REFERENCES p2p_freeze_requests(id) ON DELETE CASCADE,
  trade_id varchar NOT NULL REFERENCES p2p_trades(id),
  amount_covered numeric(15,8) NOT NULL,
  reduction_percent numeric(5,2) NOT NULL,
  freeze_hours_applied integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_p2p_freeze_benefit_consumptions_amount_positive CHECK (amount_covered > 0),
  CONSTRAINT chk_p2p_freeze_benefit_consumptions_reduction_range CHECK (reduction_percent >= 0 AND reduction_percent <= 100),
  CONSTRAINT chk_p2p_freeze_benefit_consumptions_hours_positive CHECK (freeze_hours_applied > 0)
);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_benefit_consumptions_request
  ON p2p_freeze_benefit_consumptions (request_id);

CREATE INDEX IF NOT EXISTS idx_p2p_freeze_benefit_consumptions_trade
  ON p2p_freeze_benefit_consumptions (trade_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_p2p_freeze_benefit_trade
  ON p2p_freeze_benefit_consumptions (trade_id);

INSERT INTO p2p_freeze_program_configs (
  currency_code,
  is_enabled,
  benefit_rate_percent,
  base_reduction_percent,
  max_reduction_percent,
  min_amount
)
SELECT currency_code, false, 0.000, 50.00, 90.00, 10.00000000
FROM unnest(ARRAY['USD', 'USDT', 'EUR', 'GBP', 'SAR', 'AED', 'EGP']) AS currency_code
ON CONFLICT (currency_code) DO NOTHING;

WITH base_freeze AS (
  SELECT coalesce((SELECT escrow_timeout_hours FROM p2p_settings LIMIT 1), 24) AS freeze_hours
)
UPDATE p2p_trades
SET freeze_hours_applied = base_freeze.freeze_hours,
    freeze_reduction_percent = coalesce(freeze_reduction_percent, 0),
    freeze_until = completed_at + (base_freeze.freeze_hours || ' hour')::interval
FROM base_freeze
WHERE status = 'completed'
  AND completed_at IS NOT NULL
  AND freeze_until IS NULL;
