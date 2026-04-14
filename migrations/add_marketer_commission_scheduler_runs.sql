DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketer_scheduler_run_status') THEN
    CREATE TYPE marketer_scheduler_run_status AS ENUM ('running', 'success', 'failed', 'skipped');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketer_scheduler_run_trigger') THEN
    CREATE TYPE marketer_scheduler_run_trigger AS ENUM ('auto', 'manual');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS marketer_commission_scheduler_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger marketer_scheduler_run_trigger NOT NULL DEFAULT 'auto',
  status marketer_scheduler_run_status NOT NULL DEFAULT 'running',
  run_key text,
  node_id text,
  attempt_count integer NOT NULL DEFAULT 1,
  retry_count integer NOT NULL DEFAULT 0,
  generated_events integer NOT NULL DEFAULT 0,
  generated_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  released_events integer NOT NULL DEFAULT 0,
  released_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  error_message text,
  metadata text,
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketer_scheduler_runs_status ON marketer_commission_scheduler_runs(status);
CREATE INDEX IF NOT EXISTS idx_marketer_scheduler_runs_trigger ON marketer_commission_scheduler_runs(trigger);
CREATE INDEX IF NOT EXISTS idx_marketer_scheduler_runs_started_at ON marketer_commission_scheduler_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_marketer_scheduler_runs_run_key ON marketer_commission_scheduler_runs(run_key);
