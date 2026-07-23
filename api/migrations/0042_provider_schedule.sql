CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN scheduled_until timestamptz;

UPDATE bookings booking
SET scheduled_until = booking.scheduled_for + make_interval(mins => proposal.estimated_minutes)
FROM proposals proposal
WHERE proposal.id = booking.proposal_id;

ALTER TABLE bookings
  ALTER COLUMN scheduled_for SET NOT NULL,
  ALTER COLUMN scheduled_until SET NOT NULL,
  ADD CONSTRAINT bookings_schedule_range_check
    CHECK (scheduled_until > scheduled_for),
  ADD CONSTRAINT bookings_provider_schedule_exclusion
    EXCLUDE USING gist (
      provider_id WITH =,
      tstzrange(scheduled_for, scheduled_until, '[)') WITH &&
    )
    WHERE (status IN ('scheduled', 'in_progress'));

CREATE TABLE provider_schedule_settings (
  provider_id uuid PRIMARY KEY REFERENCES users(id),
  time_zone text NOT NULL DEFAULT 'America/Sao_Paulo'
    CHECK (time_zone = 'America/Sao_Paulo'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_weekly_availability (
  provider_id uuid NOT NULL REFERENCES users(id),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, day_of_week),
  CHECK (end_time > start_time)
);

CREATE TABLE provider_schedule_blocks (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 160),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (ends_at - starts_at <= interval '14 days'),
  CHECK (
    (status = 'active' AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
  ),
  EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'active')
);

CREATE INDEX provider_schedule_blocks_provider_starts_idx
  ON provider_schedule_blocks (provider_id, starts_at, status);

CREATE TABLE provider_schedule_events (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (
    event_type IN ('weekly_updated', 'block_created', 'block_cancelled')
  ),
  schedule_version integer NOT NULL CHECK (schedule_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_schedule_events_provider_created_idx
  ON provider_schedule_events (provider_id, created_at DESC, id DESC);

INSERT INTO provider_schedule_settings (provider_id)
SELECT id
FROM users
WHERE role = 'provider';

INSERT INTO provider_weekly_availability (
  provider_id,
  day_of_week,
  start_time,
  end_time,
  active
)
SELECT
  provider.id,
  day.day_of_week,
  time '08:00',
  time '18:00',
  day.day_of_week BETWEEN 1 AND 6
FROM users provider
CROSS JOIN generate_series(1, 7) AS day(day_of_week)
WHERE provider.role = 'provider';

CREATE FUNCTION enforce_booking_provider_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  schedule provider_schedule_settings%ROWTYPE;
  local_start timestamp;
  local_end timestamp;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.provider_id::text, 0));

  SELECT *
  INTO schedule
  FROM provider_schedule_settings settings
  WHERE settings.provider_id = NEW.provider_id;

  IF schedule.provider_id IS NULL THEN
    RAISE EXCEPTION 'O profissional ainda não configurou a agenda.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.scheduled_for < now() + interval '90 minutes'
    OR NEW.scheduled_for > now() + interval '31 days'
  THEN
    RAISE EXCEPTION 'Escolha um horário futuro dentro dos próximos 31 dias.'
      USING ERRCODE = '23514';
  END IF;

  local_start := NEW.scheduled_for AT TIME ZONE schedule.time_zone;
  local_end := NEW.scheduled_until AT TIME ZONE schedule.time_zone;

  IF date_trunc('minute', local_start) <> local_start
    OR extract(minute FROM local_start)::integer NOT IN (0, 30)
  THEN
    RAISE EXCEPTION 'O horário deve iniciar em intervalo de 30 minutos.'
      USING ERRCODE = '23514';
  END IF;

  IF local_start::date <> local_end::date THEN
    RAISE EXCEPTION 'O serviço precisa terminar no mesmo dia da agenda.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM provider_weekly_availability weekly
    WHERE weekly.provider_id = NEW.provider_id
      AND weekly.day_of_week = extract(isodow FROM local_start)::integer
      AND weekly.active = true
      AND local_start::time >= weekly.start_time
      AND local_end::time <= weekly.end_time
  ) THEN
    RAISE EXCEPTION 'O horário está fora da disponibilidade semanal do profissional.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM provider_schedule_blocks block
    WHERE block.provider_id = NEW.provider_id
      AND block.status = 'active'
      AND tstzrange(block.starts_at, block.ends_at, '[)')
        && tstzrange(NEW.scheduled_for, NEW.scheduled_until, '[)')
  ) THEN
    RAISE EXCEPTION 'O profissional bloqueou esse período na agenda.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_booking_provider_schedule() FROM PUBLIC;

CREATE TRIGGER bookings_provider_schedule_guard
  BEFORE INSERT OR UPDATE OF provider_id, scheduled_for, scheduled_until
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_booking_provider_schedule();

CREATE FUNCTION enforce_schedule_block_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.provider_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM bookings booking
    WHERE booking.provider_id = NEW.provider_id
      AND booking.status IN ('scheduled', 'in_progress')
      AND tstzrange(booking.scheduled_for, booking.scheduled_until, '[)')
        && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Já existe um serviço agendado nesse período.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_schedule_block_conflict() FROM PUBLIC;

CREATE TRIGGER provider_schedule_blocks_conflict_guard
  BEFORE INSERT OR UPDATE OF starts_at, ends_at, status
  ON provider_schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_schedule_block_conflict();

CREATE FUNCTION proposal_available_slots(
  target_customer_id uuid,
  target_proposal_id uuid
)
RETURNS TABLE (
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH proposal_context AS (
    SELECT
      proposal.provider_id,
      proposal.estimated_minutes,
      settings.time_zone
    FROM proposals proposal
    JOIN service_requests request ON request.id = proposal.request_id
    JOIN provider_schedule_settings settings
      ON settings.provider_id = proposal.provider_id
    JOIN provider_matching_profiles matching
      ON matching.provider_id = proposal.provider_id
    WHERE proposal.id = target_proposal_id
      AND request.customer_id = target_customer_id
      AND request.status = 'proposals_received'
      AND proposal.status = 'sent'
      AND matching.availability_status <> 'paused'
      AND current_setting('app.actor_role', true) = 'customer'
      AND target_customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  ),
  candidates AS (
    SELECT
      context.provider_id,
      slot.local_start AT TIME ZONE context.time_zone AS starts_at,
      (
        slot.local_start
        + make_interval(mins => context.estimated_minutes)
      ) AT TIME ZONE context.time_zone AS ends_at
    FROM proposal_context context
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', now() AT TIME ZONE context.time_zone),
      date_trunc('day', now() AT TIME ZONE context.time_zone) + interval '14 days',
      interval '30 minutes'
    ) AS slot(local_start)
    JOIN provider_weekly_availability weekly
      ON weekly.provider_id = context.provider_id
      AND weekly.day_of_week = extract(isodow FROM slot.local_start)::integer
      AND weekly.active = true
      AND slot.local_start::time >= weekly.start_time
      AND (
        slot.local_start + make_interval(mins => context.estimated_minutes)
      )::time <= weekly.end_time
      AND slot.local_start::date = (
        slot.local_start + make_interval(mins => context.estimated_minutes)
      )::date
    WHERE slot.local_start >= (
      now() + interval '90 minutes'
    ) AT TIME ZONE context.time_zone
  )
  SELECT candidate.starts_at, candidate.ends_at
  FROM candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM bookings booking
    WHERE booking.provider_id = candidate.provider_id
      AND booking.status IN ('scheduled', 'in_progress')
      AND tstzrange(booking.scheduled_for, booking.scheduled_until, '[)')
        && tstzrange(candidate.starts_at, candidate.ends_at, '[)')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM provider_schedule_blocks block
    WHERE block.provider_id = candidate.provider_id
      AND block.status = 'active'
      AND tstzrange(block.starts_at, block.ends_at, '[)')
        && tstzrange(candidate.starts_at, candidate.ends_at, '[)')
  )
  ORDER BY candidate.starts_at
  LIMIT 72
$$;

REVOKE ALL ON FUNCTION proposal_available_slots(uuid, uuid) FROM PUBLIC;

ALTER TABLE provider_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_schedule_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_weekly_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_weekly_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_schedule_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_schedule_events FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_schedule_settings_read_policy
  ON provider_schedule_settings
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_schedule_settings_update_policy
  ON provider_schedule_settings
  FOR UPDATE
  USING (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_weekly_availability_read_policy
  ON provider_weekly_availability
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_weekly_availability_insert_policy
  ON provider_weekly_availability
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_weekly_availability_update_policy
  ON provider_weekly_availability
  FOR UPDATE
  USING (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_schedule_blocks_read_policy
  ON provider_schedule_blocks
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_schedule_blocks_insert_policy
  ON provider_schedule_blocks
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_schedule_blocks_update_policy
  ON provider_schedule_blocks
  FOR UPDATE
  USING (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_schedule_events_read_policy
  ON provider_schedule_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_schedule_events_insert_policy
  ON provider_schedule_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = provider_id
  );

GRANT SELECT, UPDATE (version, updated_at)
  ON provider_schedule_settings TO max_service_app;
GRANT SELECT, INSERT, UPDATE (start_time, end_time, active, updated_at)
  ON provider_weekly_availability TO max_service_app;
GRANT SELECT, INSERT, UPDATE (status, cancelled_at, updated_at)
  ON provider_schedule_blocks TO max_service_app;
GRANT SELECT, INSERT ON provider_schedule_events TO max_service_app;
GRANT EXECUTE ON FUNCTION proposal_available_slots(uuid, uuid) TO max_service_app;
