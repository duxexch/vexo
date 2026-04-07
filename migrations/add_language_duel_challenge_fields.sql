ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS native_language_code TEXT,
  ADD COLUMN IF NOT EXISTS target_language_code TEXT,
  ADD COLUMN IF NOT EXISTS language_duel_mode TEXT,
  ADD COLUMN IF NOT EXISTS language_duel_points_to_win INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_language_duel_mode'
  ) THEN
    ALTER TABLE challenges
      ADD CONSTRAINT chk_challenges_language_duel_mode
      CHECK (language_duel_mode IS NULL OR language_duel_mode IN ('typed', 'spoken', 'mixed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_language_duel_points_to_win'
  ) THEN
    ALTER TABLE challenges
      ADD CONSTRAINT chk_challenges_language_duel_points_to_win
      CHECK (language_duel_points_to_win IS NULL OR (language_duel_points_to_win >= 3 AND language_duel_points_to_win <= 30));
  END IF;
END $$;
