CREATE TABLE api_idempotency_records (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role text NOT NULL CHECK (
    actor_role IN ('customer', 'provider', 'partner', 'operation')
  ),
  method text NOT NULL CHECK (method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  route text NOT NULL CHECK (
    route LIKE '/api/v1/%'
    AND char_length(route) BETWEEN 8 AND 240
  ),
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'
  ),
  request_hash text NOT NULL CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL CHECK (
    status IN ('processing', 'completed')
  ),
  response_status smallint CHECK (
    response_status BETWEEN 200 AND 599
  ),
  response_body jsonb CHECK (
    response_body IS NULL OR jsonb_typeof(response_body) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (actor_id, method, route, idempotency_key),
  CHECK (
    (status = 'processing' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX api_idempotency_records_expires_idx
  ON api_idempotency_records (expires_at);

ALTER TABLE api_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_idempotency_records FORCE ROW LEVEL SECURITY;

CREATE POLICY api_idempotency_records_select_policy
  ON api_idempotency_records
  FOR SELECT
  USING (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_role = current_setting('app.actor_role', true)
  );

CREATE POLICY api_idempotency_records_insert_policy
  ON api_idempotency_records
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_role = current_setting('app.actor_role', true)
    AND status = 'processing'
  );

CREATE POLICY api_idempotency_records_update_policy
  ON api_idempotency_records
  FOR UPDATE
  USING (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_role = current_setting('app.actor_role', true)
    AND status = 'processing'
  )
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_role = current_setting('app.actor_role', true)
    AND status = 'completed'
  );

GRANT SELECT, INSERT ON api_idempotency_records TO max_service_app;
GRANT UPDATE (
  status,
  response_status,
  response_body,
  completed_at
) ON api_idempotency_records TO max_service_app;
