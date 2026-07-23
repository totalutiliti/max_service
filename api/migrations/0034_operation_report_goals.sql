CREATE TABLE operation_report_goals (
  period_days integer PRIMARY KEY CHECK (period_days IN (7, 30, 90)),
  proposal_coverage_target_bps integer NOT NULL CHECK (proposal_coverage_target_bps BETWEEN 0 AND 10000),
  booking_conversion_target_bps integer NOT NULL CHECK (booking_conversion_target_bps BETWEEN 0 AND 10000),
  first_proposal_target_minutes integer NOT NULL CHECK (first_proposal_target_minutes BETWEEN 1 AND 10080),
  overdue_case_limit integer NOT NULL CHECK (overdue_case_limit BETWEEN 0 AND 10000),
  unreconciled_limit integer NOT NULL CHECK (unreconciled_limit BETWEEN 0 AND 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_report_goal_events (
  id uuid PRIMARY KEY,
  period_days integer NOT NULL REFERENCES operation_report_goals(period_days),
  actor_id uuid NOT NULL REFERENCES users(id),
  previous_values jsonb NOT NULL CHECK (jsonb_typeof(previous_values) = 'object'),
  next_values jsonb NOT NULL CHECK (jsonb_typeof(next_values) = 'object'),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operation_report_goal_events_period_created_idx
  ON operation_report_goal_events (period_days, created_at DESC, id DESC);

INSERT INTO operation_report_goals (
  period_days,
  proposal_coverage_target_bps,
  booking_conversion_target_bps,
  first_proposal_target_minutes,
  overdue_case_limit,
  unreconciled_limit,
  updated_by
) VALUES
  (7, 7000, 3500, 120, 0, 0, '00000000-0000-4000-8000-000000000401'),
  (30, 7500, 4000, 90, 0, 0, '00000000-0000-4000-8000-000000000401'),
  (90, 8000, 4500, 60, 0, 0, '00000000-0000-4000-8000-000000000401');

ALTER TABLE operation_report_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_report_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_report_goal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_report_goal_events FORCE ROW LEVEL SECURITY;

CREATE POLICY operation_report_goals_operation_read_policy
  ON operation_report_goals
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_report_goals_operation_update_policy
  ON operation_report_goals
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND updated_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY operation_report_goal_events_operation_read_policy
  ON operation_report_goal_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_report_goal_events_operation_insert_policy
  ON operation_report_goal_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT SELECT ON operation_report_goals TO max_service_app;
GRANT UPDATE (
  proposal_coverage_target_bps,
  booking_conversion_target_bps,
  first_proposal_target_minutes,
  overdue_case_limit,
  unreconciled_limit,
  version,
  updated_by,
  updated_at
) ON operation_report_goals TO max_service_app;
GRANT SELECT, INSERT ON operation_report_goal_events TO max_service_app;
