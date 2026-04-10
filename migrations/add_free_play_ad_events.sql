DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'free_play_ad_event_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE free_play_ad_event_type AS ENUM ('view', 'click', 'reward_claim');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS free_play_ad_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  advertisement_id varchar REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type free_play_ad_event_type NOT NULL,
  reward_amount numeric(10,2),
  source text,
  ip_address text,
  user_agent text,
  metadata text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_play_ad_events_ad_id ON free_play_ad_events(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_free_play_ad_events_user_id ON free_play_ad_events(user_id);
CREATE INDEX IF NOT EXISTS idx_free_play_ad_events_type ON free_play_ad_events(event_type);
CREATE INDEX IF NOT EXISTS idx_free_play_ad_events_created_at ON free_play_ad_events(created_at);
