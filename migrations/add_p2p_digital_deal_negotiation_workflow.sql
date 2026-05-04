DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'p2p_deal_kind') THEN
    CREATE TYPE p2p_deal_kind AS ENUM ('standard_asset', 'digital_product');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'p2p_execution_mode') THEN
    CREATE TYPE p2p_execution_mode AS ENUM ('instant', 'negotiated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'p2p_offer_negotiation_status') THEN
    CREATE TYPE p2p_offer_negotiation_status AS ENUM ('pending', 'accepted', 'rejected');
  END IF;
END
$$;

ALTER TABLE p2p_offers
  ADD COLUMN IF NOT EXISTS deal_kind p2p_deal_kind NOT NULL DEFAULT 'standard_asset',
  ADD COLUMN IF NOT EXISTS execution_mode p2p_execution_mode,
  ADD COLUMN IF NOT EXISTS digital_product_type text,
  ADD COLUMN IF NOT EXISTS exchange_offered text,
  ADD COLUMN IF NOT EXISTS exchange_requested text,
  ADD COLUMN IF NOT EXISTS support_mediation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requested_admin_fee_percentage numeric(5,4);

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS chk_p2p_offers_requested_admin_fee_percentage;

ALTER TABLE p2p_offers
  ADD CONSTRAINT chk_p2p_offers_requested_admin_fee_percentage
  CHECK (
    requested_admin_fee_percentage IS NULL
    OR (
      requested_admin_fee_percentage >= 0
      AND requested_admin_fee_percentage <= 0.2000
    )
  );

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS chk_p2p_offers_execution_mode_required_for_digital;

ALTER TABLE p2p_offers
  ADD CONSTRAINT chk_p2p_offers_execution_mode_required_for_digital
  CHECK (
    deal_kind <> 'digital_product'
    OR execution_mode IS NOT NULL
  );

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS chk_p2p_offers_execution_mode_null_for_standard;

ALTER TABLE p2p_offers
  ADD CONSTRAINT chk_p2p_offers_execution_mode_null_for_standard
  CHECK (
    deal_kind <> 'standard_asset'
    OR execution_mode IS NULL
  );

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS chk_p2p_offers_execution_mode_values;

ALTER TABLE p2p_offers
  ADD CONSTRAINT chk_p2p_offers_execution_mode_values
  CHECK (
    execution_mode IS NULL
    OR execution_mode IN ('instant', 'negotiated')
  );

ALTER TABLE p2p_offers
  DROP CONSTRAINT IF EXISTS chk_p2p_offers_digital_required_fields;

ALTER TABLE p2p_offers
  ADD CONSTRAINT chk_p2p_offers_digital_required_fields
  CHECK (
    deal_kind <> 'digital_product'
    OR (
      execution_mode IS NOT NULL
      AND digital_product_type IS NOT NULL
      AND length(trim(digital_product_type)) > 0
      AND exchange_offered IS NOT NULL
      AND length(trim(exchange_offered)) > 0
      AND exchange_requested IS NOT NULL
      AND length(trim(exchange_requested)) > 0
    )
  );

CREATE TABLE IF NOT EXISTS p2p_offer_negotiations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id varchar NOT NULL REFERENCES p2p_offers(id) ON DELETE CASCADE,
  offer_owner_id varchar NOT NULL REFERENCES users(id),
  counterparty_user_id varchar NOT NULL REFERENCES users(id),
  proposer_id varchar NOT NULL REFERENCES users(id),
  previous_negotiation_id varchar REFERENCES p2p_offer_negotiations(id),
  status p2p_offer_negotiation_status NOT NULL DEFAULT 'pending',
  exchange_offered text NOT NULL,
  exchange_requested text NOT NULL,
  proposed_terms text NOT NULL,
  support_mediation_requested boolean NOT NULL DEFAULT false,
  admin_fee_percentage numeric(5,4),
  rejection_reason text,
  responded_by varchar REFERENCES users(id),
  responded_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_p2p_offer_negotiations_admin_fee
    CHECK (
      admin_fee_percentage IS NULL
      OR (
        admin_fee_percentage >= 0
        AND admin_fee_percentage <= 0.2000
      )
    ),
  CONSTRAINT chk_p2p_offer_negotiations_no_self_counterparty
    CHECK (offer_owner_id <> counterparty_user_id)
);

ALTER TABLE p2p_trades
  ADD COLUMN IF NOT EXISTS deal_kind p2p_deal_kind NOT NULL DEFAULT 'standard_asset',
  ADD COLUMN IF NOT EXISTS digital_product_type text,
  ADD COLUMN IF NOT EXISTS exchange_offered text,
  ADD COLUMN IF NOT EXISTS exchange_requested text,
  ADD COLUMN IF NOT EXISTS negotiated_terms text,
  ADD COLUMN IF NOT EXISTS support_mediation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negotiated_admin_fee_percentage numeric(5,4),
  ADD COLUMN IF NOT EXISTS negotiation_id varchar REFERENCES p2p_offer_negotiations(id);

ALTER TABLE p2p_trades
  DROP CONSTRAINT IF EXISTS chk_p2p_trades_negotiated_admin_fee_percentage;

ALTER TABLE p2p_trades
  ADD CONSTRAINT chk_p2p_trades_negotiated_admin_fee_percentage
  CHECK (
    negotiated_admin_fee_percentage IS NULL
    OR (
      negotiated_admin_fee_percentage >= 0
      AND negotiated_admin_fee_percentage <= 0.2000
    )
  );

CREATE INDEX IF NOT EXISTS idx_p2p_offers_deal_kind ON p2p_offers(deal_kind);
CREATE INDEX IF NOT EXISTS idx_p2p_offers_execution_mode ON p2p_offers(execution_mode);

CREATE INDEX IF NOT EXISTS idx_p2p_offer_negotiations_offer_id
  ON p2p_offer_negotiations(offer_id);

CREATE INDEX IF NOT EXISTS idx_p2p_offer_negotiations_owner_counterparty
  ON p2p_offer_negotiations(offer_owner_id, counterparty_user_id);

CREATE INDEX IF NOT EXISTS idx_p2p_offer_negotiations_status
  ON p2p_offer_negotiations(status);

CREATE INDEX IF NOT EXISTS idx_p2p_offer_negotiations_created_at
  ON p2p_offer_negotiations(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_p2p_offer_negotiations_single_pending
  ON p2p_offer_negotiations(offer_id, offer_owner_id, counterparty_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_p2p_trades_deal_kind ON p2p_trades(deal_kind);
CREATE INDEX IF NOT EXISTS idx_p2p_trades_negotiation_id ON p2p_trades(negotiation_id);
