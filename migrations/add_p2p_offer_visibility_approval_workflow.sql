ALTER TYPE p2p_offer_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE p2p_offer_status ADD VALUE IF NOT EXISTS 'rejected';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'p2p_offer_visibility') THEN
    CREATE TYPE p2p_offer_visibility AS ENUM ('public', 'private_friend');
  END IF;
END
$$;

ALTER TABLE p2p_offers
  ADD COLUMN IF NOT EXISTS visibility p2p_offer_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS target_user_id varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS counter_response text,
  ADD COLUMN IF NOT EXISTS reviewed_by varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS approved_at timestamp,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp;

ALTER TABLE p2p_offers
  ALTER COLUMN status SET DEFAULT 'pending_approval';

UPDATE p2p_offers
SET approved_at = COALESCE(approved_at, created_at),
    reviewed_at = COALESCE(reviewed_at, created_at)
WHERE visibility = 'public'
  AND status = 'active';

UPDATE p2p_offers
SET submitted_for_review_at = COALESCE(submitted_for_review_at, created_at)
WHERE visibility = 'public'
  AND status = 'pending_approval';

ALTER TABLE p2p_offers
DROP CONSTRAINT IF EXISTS chk_p2p_offers_private_friend_target;

ALTER TABLE p2p_offers
ADD CONSTRAINT chk_p2p_offers_private_friend_target
CHECK (visibility <> 'private_friend' OR target_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_p2p_offers_visibility ON p2p_offers(visibility);
CREATE INDEX IF NOT EXISTS idx_p2p_offers_target_user_id ON p2p_offers(target_user_id);
