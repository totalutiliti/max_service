CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_marketplace boolean NOT NULL DEFAULT true,
  push_messages boolean NOT NULL DEFAULT true,
  push_support boolean NOT NULL DEFAULT true,
  push_system boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start time NOT NULL DEFAULT time '22:00',
  quiet_end time NOT NULL DEFAULT time '07:00',
  time_zone text NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (
    time_zone IN (
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Belem',
      'America/Boa_Vista',
      'America/Campo_Grande',
      'America/Cuiaba',
      'America/Fortaleza',
      'America/Maceio',
      'America/Manaus',
      'America/Noronha',
      'America/Porto_Velho',
      'America/Recife',
      'America/Rio_Branco'
    )
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quiet_start <> quiet_end)
);

CREATE TABLE notification_preference_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL CHECK (version > 1),
  previous_preferences jsonb NOT NULL,
  preferences jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_id = user_id),
  CHECK (jsonb_typeof(previous_preferences) = 'object'),
  CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE INDEX notification_preference_events_user_created_idx
  ON notification_preference_events (user_id, created_at DESC, id DESC);

INSERT INTO notification_preferences (user_id)
SELECT id
FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE FUNCTION seed_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seed_notification_preferences() FROM PUBLIC;

CREATE TRIGGER users_seed_notification_preferences_trigger
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION seed_notification_preferences();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preference_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference_events FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_read_policy
  ON notification_preferences
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid);

CREATE POLICY notification_preferences_insert_policy
  ON notification_preferences
  FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid);

CREATE POLICY notification_preferences_update_policy
  ON notification_preferences
  FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid);

CREATE POLICY notification_preference_events_read_policy
  ON notification_preference_events
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid);

CREATE POLICY notification_preference_events_insert_policy
  ON notification_preference_events
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON notification_preferences TO max_service_app;
GRANT UPDATE (
  push_marketplace,
  push_messages,
  push_support,
  push_system,
  quiet_hours_enabled,
  quiet_start,
  quiet_end,
  time_zone,
  version,
  updated_at
) ON notification_preferences TO max_service_app;
GRANT SELECT, INSERT ON notification_preference_events TO max_service_app;

CREATE FUNCTION notification_push_category(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_type IN (
      'proposal_received',
      'proposal_accepted',
      'booking_started',
      'booking_completed',
      'booking_cancelled',
      'review_received'
    ) THEN 'marketplace'
    WHEN p_type = 'message_received' THEN 'messages'
    WHEN p_type IN (
      'case_opened',
      'case_updated',
      'referral_reviewed',
      'support_message'
    ) THEN 'support'
    ELSE 'system'
  END;
$$;

REVOKE ALL ON FUNCTION notification_push_category(text) FROM PUBLIC;

CREATE FUNCTION notification_push_category_enabled(p_user_id uuid, p_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT CASE notification_push_category(p_type)
        WHEN 'marketplace' THEN preference.push_marketplace
        WHEN 'messages' THEN preference.push_messages
        WHEN 'support' THEN preference.push_support
        ELSE preference.push_system
      END
      FROM notification_preferences preference
      WHERE preference.user_id = p_user_id
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION notification_push_category_enabled(uuid, text) FROM PUBLIC;

CREATE FUNCTION notification_push_quiet_until(
  p_user_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  preference notification_preferences%ROWTYPE;
  local_timestamp timestamp;
  local_time time;
  quiet_end_local timestamp;
BEGIN
  SELECT *
  INTO preference
  FROM notification_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND OR NOT preference.quiet_hours_enabled THEN
    RETURN p_at;
  END IF;

  local_timestamp := p_at AT TIME ZONE preference.time_zone;
  local_time := local_timestamp::time;

  IF preference.quiet_start < preference.quiet_end THEN
    IF local_time < preference.quiet_start OR local_time >= preference.quiet_end THEN
      RETURN p_at;
    END IF;
    quiet_end_local := local_timestamp::date + preference.quiet_end;
  ELSE
    IF local_time >= preference.quiet_start THEN
      quiet_end_local := local_timestamp::date + 1 + preference.quiet_end;
    ELSIF local_time < preference.quiet_end THEN
      quiet_end_local := local_timestamp::date + preference.quiet_end;
    ELSE
      RETURN p_at;
    END IF;
  END IF;

  RETURN quiet_end_local AT TIME ZONE preference.time_zone;
END;
$$;

REVOKE ALL ON FUNCTION notification_push_quiet_until(uuid, timestamptz) FROM PUBLIC;

ALTER TABLE notification_push_deliveries
  DROP CONSTRAINT notification_push_deliveries_outcome_check;

ALTER TABLE notification_push_deliveries
  ADD CONSTRAINT notification_push_deliveries_outcome_check CHECK (
    outcome IN ('sent', 'subscription_revoked', 'failed', 'suppressed')
  );

CREATE OR REPLACE FUNCTION queue_notification_push_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT notification_push_category_enabled(NEW.user_id, NEW.type) THEN
    RETURN NEW;
  END IF;

  INSERT INTO notification_push_deliveries (
    notification_id,
    subscription_id,
    available_at
  )
  SELECT
    NEW.id,
    subscription.id,
    notification_push_quiet_until(NEW.user_id, now())
  FROM push_subscriptions subscription
  WHERE subscription.user_id = NEW.user_id
    AND subscription.revoked_at IS NULL
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION reconcile_notification_push_deliveries(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  suppressed_count integer;
BEGIN
  IF NULLIF(current_setting('app.actor_id', true), '')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'notification preferences can only reconcile the current actor'
      USING ERRCODE = '42501';
  END IF;

  WITH suppressed AS (
    UPDATE notification_push_deliveries delivery
    SET locked_at = NULL,
        completed_at = now(),
        outcome = 'suppressed',
        last_error = 'suppressed by recipient preference'
    FROM notifications notification
    WHERE notification.id = delivery.notification_id
      AND notification.user_id = p_user_id
      AND delivery.completed_at IS NULL
      AND NOT notification_push_category_enabled(notification.user_id, notification.type)
    RETURNING delivery.notification_id
  )
  SELECT count(*)::integer
  INTO suppressed_count
  FROM suppressed;

  UPDATE notification_push_deliveries delivery
  SET available_at = GREATEST(
        delivery.available_at,
        notification_push_quiet_until(notification.user_id, now())
      )
  FROM notifications notification
  WHERE notification.id = delivery.notification_id
    AND notification.user_id = p_user_id
    AND delivery.completed_at IS NULL;

  RETURN suppressed_count;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_notification_push_deliveries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_notification_push_deliveries(uuid) TO max_service_app;

CREATE OR REPLACE FUNCTION claim_notification_push_deliveries(p_limit integer DEFAULT 20)
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
    JOIN notifications notification ON notification.id = delivery.notification_id
    WHERE delivery.completed_at IS NULL
      AND delivery.attempts < 5
      AND delivery.available_at <= now()
      AND (delivery.locked_at IS NULL OR delivery.locked_at < now() - interval '5 minutes')
      AND notification_push_category_enabled(notification.user_id, notification.type)
      AND notification_push_quiet_until(notification.user_id, now()) <= now()
    ORDER BY delivery.available_at, delivery.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE OF delivery SKIP LOCKED
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
