CREATE TABLE private_storage_reconciliation_runs (
  id uuid PRIMARY KEY,
  policy_version text NOT NULL CHECK (char_length(policy_version) BETWEEN 10 AND 80),
  mode text NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  cutoff_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  listed_objects integer NOT NULL DEFAULT 0 CHECK (listed_objects >= 0),
  referenced_objects integer NOT NULL DEFAULT 0 CHECK (referenced_objects >= 0),
  managed_orphans integer NOT NULL DEFAULT 0 CHECK (managed_orphans >= 0),
  eligible_orphans integer NOT NULL DEFAULT 0 CHECK (eligible_orphans >= 0),
  recent_orphans integer NOT NULL DEFAULT 0 CHECK (recent_orphans >= 0),
  missing_references integer NOT NULL DEFAULT 0 CHECK (missing_references >= 0),
  size_mismatches integer NOT NULL DEFAULT 0 CHECK (size_mismatches >= 0),
  ignored_objects integer NOT NULL DEFAULT 0 CHECK (ignored_objects >= 0),
  deleted_objects integer NOT NULL DEFAULT 0 CHECK (deleted_objects >= 0),
  race_protected_objects integer NOT NULL DEFAULT 0 CHECK (race_protected_objects >= 0),
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX private_storage_reconciliation_runs_completed_idx
  ON private_storage_reconciliation_runs (completed_at DESC NULLS LAST, started_at DESC);

ALTER TABLE private_storage_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_storage_reconciliation_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY private_storage_reconciliation_runs_operation_read_policy
  ON private_storage_reconciliation_runs
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

GRANT SELECT ON private_storage_reconciliation_runs TO max_service_app;
