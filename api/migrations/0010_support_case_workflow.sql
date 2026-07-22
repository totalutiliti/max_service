ALTER TABLE support_cases
  ADD COLUMN assigned_to uuid REFERENCES users(id),
  ADD COLUMN resolution text CHECK (resolution IS NULL OR char_length(resolution) BETWEEN 10 AND 1000),
  ADD COLUMN resolved_at timestamptz;

CREATE TABLE support_case_events (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES support_cases(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('opened', 'note', 'status_changed')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('open', 'in_review', 'resolved')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('open', 'in_review', 'resolved')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'opened' AND from_status IS NULL AND to_status = 'open')
    OR (event_type = 'note' AND from_status IS NULL AND to_status IS NULL)
    OR (event_type = 'status_changed' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status <> to_status)
  )
);

CREATE INDEX support_case_events_case_created_idx ON support_case_events (case_id, created_at);

INSERT INTO support_case_events (id, case_id, actor_id, event_type, to_status, note, created_at)
SELECT gen_random_uuid(), id, opened_by, 'opened', 'open', 'Chamado aberto automaticamente após o cancelamento.', created_at
FROM support_cases;

ALTER TABLE support_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_events FORCE ROW LEVEL SECURITY;

CREATE POLICY support_case_events_operation_read_policy ON support_case_events FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY support_case_events_operation_insert_policy ON support_case_events FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY support_cases_operation_update_policy ON support_cases FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

GRANT SELECT, INSERT ON support_case_events TO max_service_app;
GRANT UPDATE ON support_cases TO max_service_app;
