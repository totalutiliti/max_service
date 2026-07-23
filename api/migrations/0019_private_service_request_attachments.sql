ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_id_customer_unique UNIQUE (id, customer_id);

CREATE TABLE service_request_attachments (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 20 AND 500),
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 120),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 524288),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id, customer_id) REFERENCES service_requests(id, customer_id),
  CHECK (customer_id = uploaded_by)
);

CREATE INDEX service_request_attachments_request_created_idx
  ON service_request_attachments (request_id, created_at, id);

CREATE FUNCTION enforce_service_request_attachment_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.request_id::text));
  IF (SELECT count(*) FROM service_request_attachments attachment WHERE attachment.request_id = NEW.request_id) >= 3 THEN
    RAISE EXCEPTION 'service_request_attachment_limit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_attachments_limit_trigger
BEFORE INSERT ON service_request_attachments
FOR EACH ROW EXECUTE FUNCTION enforce_service_request_attachment_limit();

ALTER TABLE service_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY service_request_attachments_read_policy ON service_request_attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM service_requests request
    WHERE request.id = service_request_attachments.request_id
  )
);

CREATE POLICY service_request_attachments_customer_insert_policy ON service_request_attachments FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND uploaded_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM service_requests request
    WHERE request.id = service_request_attachments.request_id
      AND request.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      AND request.status IN ('open', 'proposals_received')
  )
);

GRANT SELECT, INSERT ON service_request_attachments TO max_service_app;
