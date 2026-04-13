DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_reward_type') THEN
    CREATE TYPE referral_reward_type AS ENUM ('cpa', 'revshare', 'adjustment');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_reward_status') THEN
    CREATE TYPE referral_reward_status AS ENUM ('on_hold', 'released', 'paid', 'reversed');
  END IF;
END
$$;

ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS marketer_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS marketer_badge_granted_at timestamp,
  ADD COLUMN IF NOT EXISTS marketer_badge_granted_by varchar,
  ADD COLUMN IF NOT EXISTS cpa_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cpa_amount numeric(15,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS revshare_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revshare_rate numeric(7,4) NOT NULL DEFAULT 10.0000,
  ADD COLUMN IF NOT EXISTS commission_hold_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS min_qualified_deposits numeric(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS min_qualified_wagered numeric(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS min_qualified_games integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cpa_earned numeric(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_revshare_earned numeric(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_withdrawable_commission numeric(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_paid_commission numeric(15,2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'affiliates'
      AND constraint_name = 'affiliates_marketer_badge_granted_by_fkey'
  ) THEN
    ALTER TABLE affiliates
      ADD CONSTRAINT affiliates_marketer_badge_granted_by_fkey
      FOREIGN KEY (marketer_badge_granted_by) REFERENCES users(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_affiliates_marketer_status ON affiliates(marketer_status);

ALTER TABLE referral_rewards_log
  ADD COLUMN IF NOT EXISTS reward_type referral_reward_type NOT NULL DEFAULT 'cpa',
  ADD COLUMN IF NOT EXISTS reward_status referral_reward_status NOT NULL DEFAULT 'released',
  ADD COLUMN IF NOT EXISTS hold_until timestamp,
  ADD COLUMN IF NOT EXISTS released_at timestamp,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS event_reference text,
  ADD COLUMN IF NOT EXISTS metadata text;

UPDATE referral_rewards_log
SET reward_type = 'cpa', reward_status = 'released'
WHERE reward_type IS NULL OR reward_status IS NULL;

CREATE INDEX IF NOT EXISTS referral_rewards_type_idx ON referral_rewards_log(reward_type);
CREATE INDEX IF NOT EXISTS referral_rewards_status_idx ON referral_rewards_log(reward_status);
CREATE INDEX IF NOT EXISTS referral_rewards_hold_until_idx ON referral_rewards_log(hold_until);
CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_event_ref_unique ON referral_rewards_log(event_reference);

CREATE TABLE IF NOT EXISTS affiliate_referral_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id varchar NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_net_revenue numeric(15,2) NOT NULL DEFAULT 0.00,
  last_synced_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT idx_affiliate_referral_snapshots_unique UNIQUE (affiliate_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referral_snapshots_affiliate ON affiliate_referral_snapshots(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referral_snapshots_referred ON affiliate_referral_snapshots(referred_id);
