ALTER TABLE p2p_trader_profiles
  ADD COLUMN IF NOT EXISTS p2p_username TEXT;

ALTER TABLE p2p_trader_profiles
  ADD COLUMN IF NOT EXISTS p2p_username_change_count INTEGER NOT NULL DEFAULT 0;

WITH normalized AS (
  SELECT
    id,
    lower(
      regexp_replace(
        coalesce(
          nullif(trim(p2p_username), ''),
          concat('trader_', right(regexp_replace(user_id, '[^a-zA-Z0-9]', '', 'g'), 8))
        ),
        '[^a-zA-Z0-9_]',
        '_',
        'g'
      )
    ) AS candidate
  FROM p2p_trader_profiles
),
cleaned AS (
  SELECT
    id,
    trim(both '_' from regexp_replace(candidate, '_+', '_', 'g')) AS base_name
  FROM normalized
),
finalized AS (
  SELECT
    id,
    CASE
      WHEN base_name = '' THEN concat('trader_', substr(md5(id), 1, 8))
      ELSE left(base_name, 24)
    END AS base_name
  FROM cleaned
),
ranked AS (
  SELECT
    id,
    base_name,
    row_number() OVER (PARTITION BY base_name ORDER BY id) AS rn
  FROM finalized
)
UPDATE p2p_trader_profiles profile
SET p2p_username = CASE
  WHEN ranked.rn = 1 THEN ranked.base_name
  ELSE left(
    ranked.base_name,
    greatest(4, 24 - length(ranked.rn::text) - 1)
  ) || '_' || ranked.rn::text
END
FROM ranked
WHERE profile.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_p2p_trader_profiles_p2p_username
  ON p2p_trader_profiles (p2p_username);
