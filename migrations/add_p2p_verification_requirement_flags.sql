ALTER TABLE p2p_settings
  ADD COLUMN IF NOT EXISTS require_identity_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_phone_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_email_verification boolean NOT NULL DEFAULT false;

UPDATE p2p_settings
SET require_identity_verification = false
WHERE require_identity_verification IS NULL;

UPDATE p2p_settings
SET require_phone_verification = false
WHERE require_phone_verification IS NULL;

UPDATE p2p_settings
SET require_email_verification = false
WHERE require_email_verification IS NULL;
