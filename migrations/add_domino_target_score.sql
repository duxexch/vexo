ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS domino_target_score INTEGER;

ALTER TABLE challenges
DROP CONSTRAINT IF EXISTS chk_challenges_domino_target_score;

ALTER TABLE challenges
ADD CONSTRAINT chk_challenges_domino_target_score
CHECK (domino_target_score IS NULL OR domino_target_score IN (101, 201));
