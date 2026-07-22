CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'provider', 'partner', 'operation')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX demo_sessions_active_idx ON demo_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX demo_sessions_user_idx ON demo_sessions (user_id, created_at DESC);

ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY demo_sessions_insert_policy ON demo_sessions FOR INSERT WITH CHECK (
  token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
  AND (
    (role = 'customer' AND user_id = '00000000-0000-4000-8000-000000000101'::uuid)
    OR (role = 'provider' AND user_id = '00000000-0000-4000-8000-000000000201'::uuid)
    OR (role = 'partner' AND user_id = '00000000-0000-4000-8000-000000000301'::uuid)
    OR (role = 'operation' AND user_id = '00000000-0000-4000-8000-000000000401'::uuid)
  )
);

CREATE POLICY demo_sessions_token_read_policy ON demo_sessions FOR SELECT USING (
  token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
);

CREATE POLICY demo_sessions_token_update_policy ON demo_sessions FOR UPDATE USING (
  token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
) WITH CHECK (
  token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
);

GRANT SELECT, INSERT, UPDATE ON demo_sessions TO max_service_app;
