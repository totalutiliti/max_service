CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 20 AND 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 120),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 64),
  expiration_time bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX push_subscriptions_active_user_idx
  ON push_subscriptions (user_id, updated_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_read_policy ON push_subscriptions FOR SELECT USING (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY push_subscriptions_insert_policy ON push_subscriptions FOR INSERT WITH CHECK (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY push_subscriptions_update_policy ON push_subscriptions FOR UPDATE USING (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
) WITH CHECK (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

GRANT SELECT, INSERT ON push_subscriptions TO max_service_app;
GRANT UPDATE (p256dh, auth, expiration_time, updated_at, revoked_at) ON push_subscriptions TO max_service_app;

CREATE TABLE notification_push_deliveries (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  outcome text CHECK (outcome IN ('sent', 'subscription_revoked', 'failed')),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, subscription_id)
);

CREATE INDEX notification_push_deliveries_pending_idx
  ON notification_push_deliveries (available_at, created_at)
  WHERE completed_at IS NULL;

CREATE FUNCTION finalize_revoked_push_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    UPDATE notification_push_deliveries
    SET locked_at = NULL,
        completed_at = now(),
        outcome = 'subscription_revoked',
        last_error = 'subscription revoked by user'
    WHERE subscription_id = NEW.id
      AND completed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finalize_revoked_push_deliveries() FROM PUBLIC;

CREATE TRIGGER push_subscriptions_finalize_deliveries_trigger
AFTER UPDATE OF revoked_at ON push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION finalize_revoked_push_deliveries();

CREATE FUNCTION queue_notification_push_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO notification_push_deliveries (notification_id, subscription_id)
  SELECT NEW.id, subscription.id
  FROM push_subscriptions subscription
  WHERE subscription.user_id = NEW.user_id
    AND subscription.revoked_at IS NULL
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION queue_notification_push_deliveries() FROM PUBLIC;

CREATE TRIGGER notifications_queue_push_trigger
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION queue_notification_push_deliveries();

CREATE FUNCTION claim_notification_push_deliveries(p_limit integer DEFAULT 20)
RETURNS TABLE (
  notification_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT delivery.notification_id, delivery.subscription_id
    FROM notification_push_deliveries delivery
    WHERE delivery.completed_at IS NULL
      AND delivery.attempts < 5
      AND delivery.available_at <= now()
      AND (delivery.locked_at IS NULL OR delivery.locked_at < now() - interval '5 minutes')
    ORDER BY delivery.available_at, delivery.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE notification_push_deliveries delivery
    SET locked_at = now(),
        attempts = delivery.attempts + 1
    FROM due
    WHERE delivery.notification_id = due.notification_id
      AND delivery.subscription_id = due.subscription_id
    RETURNING delivery.notification_id, delivery.subscription_id, delivery.attempts
  )
  SELECT
    claimed.notification_id,
    claimed.subscription_id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
    notification.title,
    notification.body,
    notification.entity_type,
    notification.entity_id,
    claimed.attempts
  FROM claimed
  JOIN push_subscriptions subscription ON subscription.id = claimed.subscription_id
  JOIN notifications notification ON notification.id = claimed.notification_id
  WHERE subscription.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION claim_notification_push_deliveries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_notification_push_deliveries(integer) TO max_service_app;

CREATE FUNCTION finish_notification_push_delivery(
  p_notification_id uuid,
  p_subscription_id uuid,
  p_result text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_attempts integer;
BEGIN
  IF p_result NOT IN ('sent', 'gone', 'retry') THEN
    RAISE EXCEPTION 'invalid push delivery result';
  END IF;

  SELECT delivery.attempts
  INTO current_attempts
  FROM notification_push_deliveries delivery
  WHERE delivery.notification_id = p_notification_id
    AND delivery.subscription_id = p_subscription_id
    AND delivery.completed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_result = 'retry' AND current_attempts < 5 THEN
    UPDATE notification_push_deliveries
    SET locked_at = NULL,
        available_at = now() + make_interval(secs => LEAST(3600, 10 * (2 ^ current_attempts))),
        last_error = LEFT(COALESCE(p_error, 'temporary push delivery failure'), 500)
    WHERE notification_id = p_notification_id
      AND subscription_id = p_subscription_id;
    RETURN;
  END IF;

  UPDATE notification_push_deliveries
  SET locked_at = NULL,
      completed_at = now(),
      outcome = CASE
        WHEN p_result = 'sent' THEN 'sent'
        WHEN p_result = 'gone' THEN 'subscription_revoked'
        ELSE 'failed'
      END,
      last_error = CASE
        WHEN p_result = 'sent' THEN NULL
        ELSE LEFT(COALESCE(p_error, 'push delivery failed'), 500)
      END
  WHERE notification_id = p_notification_id
    AND subscription_id = p_subscription_id;

  IF p_result = 'gone' THEN
    UPDATE push_subscriptions
    SET revoked_at = COALESCE(revoked_at, now()),
        updated_at = now()
    WHERE id = p_subscription_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION finish_notification_push_delivery(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_notification_push_delivery(uuid, uuid, text, text) TO max_service_app;
