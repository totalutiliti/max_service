CREATE TABLE data_subject_requests (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE CHECK (public_code ~ '^DS-[A-Z0-9]{4,12}$'),
  subject_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (
    request_type IN ('access', 'correction', 'deletion', 'restriction', 'consent_withdrawal')
  ),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_review', 'awaiting_subject', 'fulfilled', 'denied')
  ),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 1000),
  due_at timestamptz NOT NULL,
  assigned_to uuid REFERENCES users(id),
  resolution_note text CHECK (
    resolution_note IS NULL OR char_length(resolution_note) BETWEEN 20 AND 1000
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (
    (status IN ('fulfilled', 'denied') AND completed_at IS NOT NULL AND resolution_note IS NOT NULL)
    OR (status NOT IN ('fulfilled', 'denied') AND completed_at IS NULL)
  )
);

CREATE INDEX data_subject_requests_subject_created_idx
  ON data_subject_requests (subject_id, created_at DESC, id DESC);

CREATE INDEX data_subject_requests_operation_queue_idx
  ON data_subject_requests (status, due_at, created_at, id);

CREATE TABLE data_subject_request_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES data_subject_requests(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'export_generated')),
  from_status text CHECK (
    from_status IS NULL OR from_status IN ('open', 'in_review', 'awaiting_subject', 'fulfilled', 'denied')
  ),
  to_status text NOT NULL CHECK (
    to_status IN ('open', 'in_review', 'awaiting_subject', 'fulfilled', 'denied')
  ),
  request_version integer NOT NULL CHECK (request_version > 0),
  note text NOT NULL CHECK (char_length(note) BETWEEN 20 AND 1000),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_subject_request_events_request_created_idx
  ON data_subject_request_events (request_id, created_at DESC, id DESC);

CREATE TABLE data_subject_export_receipts (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE CHECK (public_code ~ '^PX-[A-Z0-9]{4,12}$'),
  request_id uuid NOT NULL UNIQUE REFERENCES data_subject_requests(id),
  subject_id uuid NOT NULL REFERENCES users(id),
  manifest_version text NOT NULL CHECK (manifest_version = 'privacy-export-1'),
  checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  section_counts jsonb NOT NULL CHECK (jsonb_typeof(section_counts) = 'object'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subject_id <> '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX data_subject_export_receipts_subject_created_idx
  ON data_subject_export_receipts (subject_id, generated_at DESC, id DESC);

CREATE FUNCTION current_data_subject_identity()
RETURNS TABLE (
  public_code text,
  role text,
  display_name text,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_actor_id uuid;
BEGIN
  current_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  IF current_actor_id IS NULL
    OR current_setting('app.actor_role', true) NOT IN ('customer', 'provider', 'partner', 'advertiser')
  THEN
    RAISE EXCEPTION 'data subject identity is restricted to the current subject'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    users.public_code,
    users.role,
    users.display_name,
    users.email,
    users.created_at
  FROM users
  WHERE users.id = current_actor_id;
END;
$$;

REVOKE ALL ON FUNCTION current_data_subject_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_data_subject_identity() TO max_service_app;

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE data_subject_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_request_events FORCE ROW LEVEL SECURITY;
ALTER TABLE data_subject_export_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_export_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY data_subject_requests_read_policy
  ON data_subject_requests
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY data_subject_requests_subject_insert_policy
  ON data_subject_requests
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) IN ('customer', 'provider', 'partner', 'advertiser')
    AND subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND assigned_to IS NULL
    AND status = 'open'
    AND version = 1
  );

CREATE POLICY data_subject_requests_operation_update_policy
  ON data_subject_requests
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND assigned_to IS NOT NULL
  );

CREATE POLICY data_subject_requests_access_export_update_policy
  ON data_subject_requests
  FOR UPDATE
  USING (
    subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND request_type = 'access'
    AND status = 'open'
  )
  WITH CHECK (
    subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND request_type = 'access'
    AND status = 'fulfilled'
    AND assigned_to IS NULL
  );

CREATE POLICY data_subject_request_events_read_policy
  ON data_subject_request_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR EXISTS (
      SELECT 1
      FROM data_subject_requests request
      WHERE request.id = data_subject_request_events.request_id
        AND request.subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY data_subject_request_events_insert_policy
  ON data_subject_request_events
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND (
      current_setting('app.actor_role', true) = 'operation'
      OR EXISTS (
        SELECT 1
        FROM data_subject_requests request
        WHERE request.id = data_subject_request_events.request_id
          AND request.subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
    )
  );

CREATE POLICY data_subject_export_receipts_read_policy
  ON data_subject_export_receipts
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY data_subject_export_receipts_subject_insert_policy
  ON data_subject_export_receipts
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) IN ('customer', 'provider', 'partner', 'advertiser')
    AND subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM data_subject_requests request
      WHERE request.id = data_subject_export_receipts.request_id
        AND request.subject_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
        AND request.request_type = 'access'
        AND request.status = 'fulfilled'
    )
  );

GRANT SELECT, INSERT ON data_subject_requests TO max_service_app;
GRANT UPDATE (
  status,
  assigned_to,
  resolution_note,
  version,
  updated_at,
  completed_at
) ON data_subject_requests TO max_service_app;
GRANT SELECT, INSERT ON data_subject_request_events TO max_service_app;
GRANT SELECT, INSERT ON data_subject_export_receipts TO max_service_app;
