CREATE OR REPLACE FUNCTION enforce_demo_session_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'demo session identity and validity are immutable';
  END IF;

  IF NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'demo session last_seen_at cannot move backwards';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'demo session revocation is irreversible';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_demo_session_immutability() FROM PUBLIC;

CREATE TRIGGER demo_sessions_immutability
BEFORE UPDATE ON demo_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_demo_session_immutability();
