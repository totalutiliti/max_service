CREATE INDEX messages_conversation_cursor_idx
  ON messages (conversation_id, created_at, id);
