ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS share_slug TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS promo_video_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_start_on_full BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_start_player_count INTEGER,
  ADD COLUMN IF NOT EXISTS prize_distribution_method TEXT NOT NULL DEFAULT 'top_3',
  ADD COLUMN IF NOT EXISTS prizes_settled_at TIMESTAMP;

UPDATE tournaments
SET published_at = COALESCE(published_at, created_at)
WHERE is_published = TRUE;

UPDATE tournaments
SET share_slug = CONCAT(
  COALESCE(
    NULLIF(
      trim(both '-' from regexp_replace(lower(COALESCE(name, 'tournament')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'tournament'
  ),
  '-',
  substring(id from 1 for 8)
)
WHERE share_slug IS NULL OR btrim(share_slug) = '';

CREATE INDEX IF NOT EXISTS idx_tournaments_is_published ON tournaments(is_published);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_share_slug_unique ON tournaments(share_slug);
