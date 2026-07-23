ALTER TABLE messages
  ADD CONSTRAINT messages_id_conversation_sender_unique UNIQUE (id, conversation_id, sender_id);

CREATE TABLE message_attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL UNIQUE,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL UNIQUE CHECK (char_length(object_key) BETWEEN 20 AND 500),
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 120),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 524288),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (message_id, conversation_id, sender_id)
    REFERENCES messages(id, conversation_id, sender_id),
  CHECK (sender_id = uploaded_by)
);

CREATE INDEX message_attachments_conversation_created_idx
  ON message_attachments (conversation_id, created_at, id);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY message_attachments_member_read_policy ON message_attachments FOR SELECT USING (
  current_setting('app.actor_role', true) IN ('customer', 'provider')
  AND EXISTS (
    SELECT 1
    FROM conversation_members member
    WHERE member.conversation_id = message_attachments.conversation_id
      AND member.user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

CREATE POLICY message_attachments_member_insert_policy ON message_attachments FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) IN ('customer', 'provider')
  AND sender_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND uploaded_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM conversation_members member
    WHERE member.conversation_id = message_attachments.conversation_id
      AND member.user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      AND member.member_role = current_setting('app.actor_role', true)
  )
);

GRANT SELECT, INSERT ON message_attachments TO max_service_app;
