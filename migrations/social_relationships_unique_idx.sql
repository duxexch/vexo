-- Enforce one relationship row per (user, target, type).
-- Safe deduplication keeps the most recently updated row.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, target_user_id, type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM user_relationships
)
DELETE FROM user_relationships ur
USING ranked r
WHERE ur.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_relationships_unique
  ON user_relationships(user_id, target_user_id, type);
