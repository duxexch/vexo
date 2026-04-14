ALTER TABLE marketer_commission_scheduler_runs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketer_scheduler_runs_idempotency_key
  ON marketer_commission_scheduler_runs(idempotency_key);
