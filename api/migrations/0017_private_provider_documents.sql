ALTER TABLE provider_document_checks
  ADD CONSTRAINT provider_document_checks_id_verification_unique UNIQUE (id, verification_id);

CREATE TABLE provider_document_files (
  id uuid PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES provider_verifications(id),
  document_check_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 20 AND 500),
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 120),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_check_id, verification_id)
    REFERENCES provider_document_checks(id, verification_id),
  CHECK (provider_id = uploaded_by)
);

CREATE INDEX provider_document_files_check_uploaded_idx
  ON provider_document_files (document_check_id, uploaded_at DESC);
CREATE INDEX provider_document_files_provider_uploaded_idx
  ON provider_document_files (provider_id, uploaded_at DESC);

ALTER TABLE provider_document_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_document_files FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_document_files_read_policy ON provider_document_files FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY provider_document_files_provider_insert_policy ON provider_document_files FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND uploaded_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM provider_verifications verification
    WHERE verification.id = provider_document_files.verification_id
      AND verification.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

ALTER TABLE provider_verification_events
  DROP CONSTRAINT provider_verification_events_event_type_check;
ALTER TABLE provider_verification_events
  ADD CONSTRAINT provider_verification_events_event_type_check CHECK (
    event_type IN ('submitted', 'review_started', 'document_uploaded', 'document_reviewed', 'approved', 'changes_requested')
  );

GRANT SELECT, INSERT ON provider_document_files TO max_service_app;
