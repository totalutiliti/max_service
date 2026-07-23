ALTER TABLE partner_support_events
  ADD CONSTRAINT partner_support_events_id_case_actor_unique
    UNIQUE (id, case_id, actor_id);

CREATE TABLE partner_support_attachments (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  case_id uuid NOT NULL,
  uploader_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 20 AND 500),
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 120),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 4 AND 2097152),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text NOT NULL DEFAULT 'not_scanned' CHECK (scan_status = 'not_scanned'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, case_id, uploader_id)
    REFERENCES partner_support_events(id, case_id, actor_id)
);

CREATE INDEX partner_support_attachments_case_created_idx
  ON partner_support_attachments (case_id, created_at, id);

ALTER TABLE partner_support_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_support_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_support_attachments_read_policy
  ON partner_support_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM partner_support_cases support
      WHERE support.id = partner_support_attachments.case_id
        AND (
          current_setting('app.actor_role', true) = 'operation'
          OR (
            current_setting('app.actor_role', true) = 'partner'
            AND support.partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
          )
        )
    )
  );

CREATE POLICY partner_support_attachments_insert_policy
  ON partner_support_attachments
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) IN ('partner', 'operation')
    AND uploader_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM partner_support_events event
      JOIN partner_support_cases support ON support.id = event.case_id
      WHERE event.id = partner_support_attachments.event_id
        AND event.case_id = partner_support_attachments.case_id
        AND event.actor_id = partner_support_attachments.uploader_id
        AND event.event_type = 'message'
        AND support.status <> 'resolved'
        AND (
          current_setting('app.actor_role', true) = 'operation'
          OR support.partner_id = partner_support_attachments.uploader_id
        )
    )
  );

GRANT SELECT, INSERT ON partner_support_attachments TO max_service_app;
