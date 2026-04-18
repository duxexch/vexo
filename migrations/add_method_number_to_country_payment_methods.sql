ALTER TABLE country_payment_methods
  ADD COLUMN IF NOT EXISTS method_number TEXT NOT NULL DEFAULT '';

UPDATE country_payment_methods
SET method_number = ''
WHERE method_number IS NULL;
