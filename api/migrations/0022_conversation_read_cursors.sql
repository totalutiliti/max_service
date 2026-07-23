ALTER TABLE messages
  ADD CONSTRAINT messages_id_conversation_unique UNIQUE (id, conversation_id);

ALTER TABLE conversation_members
  ADD COLUMN last_read_message_id uuid,
  ADD COLUMN last_read_at timestamptz;

UPDATE conversation_members member
SET
  last_read_message_id = (
    SELECT message.id
    FROM messages message
    WHERE message.conversation_id = member.conversation_id
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT 1
  ),
  last_read_at = COALESCE((
    SELECT message.created_at
    FROM messages message
    WHERE message.conversation_id = member.conversation_id
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT 1
  ), member.joined_at);

ALTER TABLE conversation_members
  ALTER COLUMN last_read_at SET DEFAULT now(),
  ALTER COLUMN last_read_at SET NOT NULL,
  ADD CONSTRAINT conversation_members_read_cursor_fk
    FOREIGN KEY (last_read_message_id, conversation_id)
    REFERENCES messages(id, conversation_id);

CREATE POLICY members_update_read_cursor_policy ON conversation_members FOR UPDATE
USING (
  current_setting('app.actor_role', true) IN ('customer', 'provider')
  AND user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND member_role = current_setting('app.actor_role', true)
)
WITH CHECK (
  current_setting('app.actor_role', true) IN ('customer', 'provider')
  AND user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND member_role = current_setting('app.actor_role', true)
);

GRANT UPDATE (last_read_message_id, last_read_at) ON conversation_members TO max_service_app;
