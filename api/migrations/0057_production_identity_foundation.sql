ALTER TABLE users
  ADD COLUMN account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('pending_verification', 'active', 'locked', 'suspended', 'closed')),
  ADD COLUMN contact_verified_at timestamptz;

CREATE UNIQUE INDEX users_email_normalized_unique_idx
  ON users (lower(btrim(email)));

CREATE TABLE identity_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  subject_digest char(64) NOT NULL CHECK (subject_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'locked', 'suspended', 'closed')),
  contact_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, subject_digest),
  CHECK (
    status = 'pending_verification'
    OR contact_verified_at IS NOT NULL
  )
);

CREATE TABLE identity_authentication_state (
  subject_digest char(64) PRIMARY KEY CHECK (subject_digest ~ '^[a-f0-9]{64}$'),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  failed_attempt_count integer NOT NULL DEFAULT 0 CHECK (failed_attempt_count >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_succeeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity_sessions (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL,
  parent_session_id uuid REFERENCES identity_sessions(id),
  replaced_by_session_id uuid REFERENCES identity_sessions(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'provider', 'partner', 'advertiser', 'operation')),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  assurance_level text NOT NULL CHECK (assurance_level IN ('contact_verified', 'mfa')),
  mfa_completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text CHECK (
    revocation_reason IS NULL
    OR revocation_reason IN (
      'logout',
      'global_logout',
      'credential_changed',
      'account_disabled',
      'token_reuse_detected',
      'expired',
      'administrative'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (idle_expires_at > created_at AND idle_expires_at <= expires_at),
  CHECK (
    (parent_session_id IS NULL AND generation = 0)
    OR (parent_session_id IS NOT NULL AND generation > 0)
  ),
  CHECK (
    (rotated_at IS NULL AND replaced_by_session_id IS NULL)
    OR (rotated_at IS NOT NULL AND replaced_by_session_id IS NOT NULL)
  ),
  CHECK (
    role <> 'operation'
    OR (assurance_level = 'mfa' AND mfa_completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX identity_sessions_replacement_unique_idx
  ON identity_sessions (replaced_by_session_id)
  WHERE replaced_by_session_id IS NOT NULL;

CREATE INDEX identity_sessions_user_created_idx
  ON identity_sessions (user_id, created_at DESC);

CREATE INDEX identity_sessions_active_family_idx
  ON identity_sessions (family_id, generation DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX identity_sessions_active_token_idx
  ON identity_sessions (token_hash, idle_expires_at, expires_at)
  WHERE revoked_at IS NULL AND rotated_at IS NULL;

CREATE TABLE identity_contact_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('contact_verification', 'account_recovery')),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX identity_contact_challenges_user_created_idx
  ON identity_contact_challenges (user_id, created_at DESC);

CREATE TABLE identity_security_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject_digest char(64) CHECK (
    subject_digest IS NULL OR subject_digest ~ '^[a-f0-9]{64}$'
  ),
  session_id uuid REFERENCES identity_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'account_registered',
      'contact_challenge_created',
      'contact_verified',
      'authentication_succeeded',
      'authentication_failed',
      'authentication_locked',
      'account_recovery_requested',
      'credential_changed',
      'mfa_required',
      'mfa_succeeded',
      'mfa_failed',
      'session_issued',
      'session_rotated',
      'session_revoked',
      'session_family_revoked',
      'session_reuse_detected'
    )
  ),
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'rejected', 'blocked')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(details) = 'object'
    AND NOT (
      details ?| ARRAY[
        'password',
        'token',
        'authorization',
        'cookie',
        'email',
        'phone',
        'ip',
        'userAgent'
      ]
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_security_events_actor_created_idx
  ON identity_security_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX identity_security_events_subject_created_idx
  ON identity_security_events (subject_digest, created_at DESC)
  WHERE subject_digest IS NOT NULL;

CREATE INDEX identity_security_events_type_created_idx
  ON identity_security_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION identity_session_subject_allowed(
  target_user_id uuid,
  target_role text,
  target_assurance_level text,
  target_mfa_completed_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users
    JOIN identity_accounts account ON account.user_id = users.id
    WHERE users.id = target_user_id
      AND users.role = target_role
      AND users.account_status = 'active'
      AND users.contact_verified_at IS NOT NULL
      AND account.status = 'active'
      AND account.contact_verified_at IS NOT NULL
      AND (
        target_role <> 'operation'
        OR (
          target_assurance_level = 'mfa'
          AND target_mfa_completed_at IS NOT NULL
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION identity_session_subject_allowed(uuid, text, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity_session_subject_allowed(uuid, text, text, timestamptz)
  TO max_service_app;

CREATE OR REPLACE FUNCTION current_identity_profile()
RETURNS TABLE (
  display_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT users.display_name, users.email
  FROM users
  WHERE users.id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION current_identity_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_identity_profile() TO max_service_app;

CREATE OR REPLACE FUNCTION enforce_identity_session_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.family_id IS DISTINCT FROM OLD.family_id
    OR NEW.parent_session_id IS DISTINCT FROM OLD.parent_session_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.generation IS DISTINCT FROM OLD.generation
    OR NEW.assurance_level IS DISTINCT FROM OLD.assurance_level
    OR NEW.mfa_completed_at IS DISTINCT FROM OLD.mfa_completed_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'production session identity and validity are immutable';
  END IF;

  IF NEW.last_seen_at < OLD.last_seen_at
    OR NEW.idle_expires_at < OLD.idle_expires_at
    OR NEW.idle_expires_at > NEW.expires_at
  THEN
    RAISE EXCEPTION 'production session activity cannot move backwards or exceed absolute validity';
  END IF;

  IF OLD.rotated_at IS NOT NULL AND (
    NEW.rotated_at IS DISTINCT FROM OLD.rotated_at
    OR NEW.replaced_by_session_id IS DISTINCT FROM OLD.replaced_by_session_id
  ) THEN
    RAISE EXCEPTION 'production session rotation is irreversible';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND (
    NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
  ) THEN
    RAISE EXCEPTION 'production session revocation is irreversible';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_identity_session_invariants() FROM PUBLIC;

CREATE TRIGGER identity_sessions_invariants
BEFORE UPDATE ON identity_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_identity_session_invariants();

ALTER TABLE identity_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_authentication_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_authentication_state FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_contact_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_contact_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE identity_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_security_events FORCE ROW LEVEL SECURITY;

CREATE POLICY identity_accounts_read_policy
  ON identity_accounts
  FOR SELECT
  USING (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    OR subject_digest = NULLIF(current_setting('app.identity_subject_digest', true), '')
  );

CREATE POLICY identity_accounts_security_insert_policy
  ON identity_accounts
  FOR INSERT
  WITH CHECK (current_setting('app.identity_security_write', true) = '1');

CREATE POLICY identity_accounts_security_update_policy
  ON identity_accounts
  FOR UPDATE
  USING (current_setting('app.identity_security_write', true) = '1')
  WITH CHECK (current_setting('app.identity_security_write', true) = '1');

CREATE POLICY identity_authentication_state_security_policy
  ON identity_authentication_state
  FOR ALL
  USING (
    current_setting('app.identity_security_write', true) = '1'
    OR subject_digest = NULLIF(current_setting('app.identity_subject_digest', true), '')
  )
  WITH CHECK (current_setting('app.identity_security_write', true) = '1');

CREATE POLICY identity_sessions_read_policy
  ON identity_sessions
  FOR SELECT
  USING (
    token_hash = NULLIF(current_setting('app.identity_session_hash', true), '')
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY identity_sessions_insert_policy
  ON identity_sessions
  FOR INSERT
  WITH CHECK (
    (
      token_hash = NULLIF(current_setting('app.identity_session_hash', true), '')
      OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
    AND identity_session_subject_allowed(
      user_id,
      role,
      assurance_level,
      mfa_completed_at
    )
  );

CREATE POLICY identity_sessions_update_policy
  ON identity_sessions
  FOR UPDATE
  USING (
    token_hash = NULLIF(current_setting('app.identity_session_hash', true), '')
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    OR token_hash = NULLIF(current_setting('app.identity_session_hash', true), '')
  );

CREATE POLICY identity_contact_challenges_read_policy
  ON identity_contact_challenges
  FOR SELECT
  USING (
    token_hash = NULLIF(current_setting('app.identity_challenge_hash', true), '')
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY identity_contact_challenges_security_insert_policy
  ON identity_contact_challenges
  FOR INSERT
  WITH CHECK (current_setting('app.identity_security_write', true) = '1');

CREATE POLICY identity_contact_challenges_security_update_policy
  ON identity_contact_challenges
  FOR UPDATE
  USING (
    current_setting('app.identity_security_write', true) = '1'
    OR token_hash = NULLIF(current_setting('app.identity_challenge_hash', true), '')
  )
  WITH CHECK (current_setting('app.identity_security_write', true) = '1');

CREATE POLICY identity_security_events_operation_read_policy
  ON identity_security_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY identity_security_events_insert_policy
  ON identity_security_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.identity_security_write', true) = '1'
    AND (
      actor_id IS NULL
      OR actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      OR current_setting('app.actor_role', true) = 'operation'
    )
  );

GRANT SELECT, INSERT, UPDATE ON identity_accounts TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON identity_authentication_state TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON identity_sessions TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON identity_contact_challenges TO max_service_app;
GRANT SELECT, INSERT ON identity_security_events TO max_service_app;
