ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS region_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS address_line text;

CREATE INDEX IF NOT EXISTS idx_user_preferences_language ON user_preferences (language);
CREATE INDEX IF NOT EXISTS idx_user_preferences_country_code ON user_preferences (country_code);
CREATE INDEX IF NOT EXISTS idx_user_preferences_region_code ON user_preferences (region_code);
