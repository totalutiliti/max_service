CREATE INDEX audit_events_created_idx
  ON audit_events (created_at DESC, id DESC);
