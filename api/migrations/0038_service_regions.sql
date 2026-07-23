CREATE TABLE service_regions (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{3,20}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  state char(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_regions_sort_order_unique UNIQUE (sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE service_region_neighborhoods (
  id uuid PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES service_regions(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,80}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, slug),
  UNIQUE (region_id, sort_order)
);

CREATE TABLE service_region_events (
  id uuid PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES service_regions(id),
  neighborhood_id uuid REFERENCES service_region_neighborhoods(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (
    event_type IN (
      'region_activated',
      'region_deactivated',
      'neighborhood_activated',
      'neighborhood_deactivated'
    )
  ),
  from_active boolean NOT NULL,
  to_active boolean NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_active <> to_active),
  CHECK (
    (event_type LIKE 'region_%' AND neighborhood_id IS NULL)
    OR (event_type LIKE 'neighborhood_%' AND neighborhood_id IS NOT NULL)
  )
);

CREATE INDEX service_region_events_region_created_idx
  ON service_region_events (region_id, created_at DESC, id DESC);

CREATE TABLE provider_service_regions (
  provider_id uuid NOT NULL REFERENCES users(id),
  region_id uuid NOT NULL REFERENCES service_regions(id),
  source text NOT NULL CHECK (source IN ('pilot_seed', 'onboarding', 'operation')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, region_id)
);

CREATE INDEX provider_service_regions_region_active_idx
  ON provider_service_regions (region_id, provider_id)
  WHERE active = true;

CREATE TABLE provider_service_region_events (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES users(id),
  region_id uuid NOT NULL REFERENCES service_regions(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('added', 'removed')),
  source text NOT NULL CHECK (source IN ('pilot_seed', 'onboarding', 'operation')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_service_region_events_provider_created_idx
  ON provider_service_region_events (provider_id, created_at DESC, id DESC);

INSERT INTO service_regions (
  id, code, name, city, state, active, sort_order
) VALUES
  (
    'b2000000-0000-4000-8000-000000000001',
    'SOR-SP',
    'Sorocaba',
    'Sorocaba',
    'SP',
    true,
    1
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'VOT-SP',
    'Votorantim',
    'Votorantim',
    'SP',
    false,
    2
  );

INSERT INTO service_region_neighborhoods (
  id, region_id, slug, name, active, sort_order
) VALUES
  ('b2100000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'jardim-europa', 'Jardim Europa', true, 1),
  ('b2100000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'vila-carvalho', 'Vila Carvalho', true, 2),
  ('b2100000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'campolim', 'Campolim', true, 3),
  ('b2100000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'centro', 'Centro', true, 4),
  ('b2100000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', 'eden', 'Éden', true, 5),
  ('b2100000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000002', 'centro', 'Centro', true, 1),
  ('b2100000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000002', 'parque-bela-vista', 'Parque Bela Vista', true, 2);

INSERT INTO provider_service_regions (
  provider_id, region_id, source
) VALUES
  ('00000000-0000-4000-8000-000000000201', 'b2000000-0000-4000-8000-000000000001', 'pilot_seed'),
  ('00000000-0000-4000-8000-000000000202', 'b2000000-0000-4000-8000-000000000001', 'pilot_seed');

ALTER TABLE onboarding_profiles
  ADD COLUMN region_id uuid REFERENCES service_regions(id),
  ADD COLUMN neighborhood_id uuid REFERENCES service_region_neighborhoods(id);

UPDATE onboarding_profiles profile
SET
  region_id = region.id,
  neighborhood_id = CASE
    WHEN profile.profile_type = 'customer' THEN COALESCE((
      SELECT neighborhood.id
      FROM service_region_neighborhoods neighborhood
      WHERE neighborhood.region_id = region.id
        AND lower(neighborhood.name) = lower(profile.neighborhood)
      LIMIT 1
    ), 'b2100000-0000-4000-8000-000000000001'::uuid)
    ELSE NULL
  END,
  city = region.city,
  state = region.state,
  neighborhood = CASE
    WHEN profile.profile_type = 'customer' THEN COALESCE((
      SELECT neighborhood.name
      FROM service_region_neighborhoods neighborhood
      WHERE neighborhood.region_id = region.id
        AND lower(neighborhood.name) = lower(profile.neighborhood)
      LIMIT 1
    ), 'Jardim Europa')
    ELSE NULL
  END
FROM service_regions region
WHERE region.code = 'SOR-SP';

ALTER TABLE onboarding_profiles
  ALTER COLUMN region_id SET NOT NULL,
  ADD CONSTRAINT onboarding_profile_region_shape CHECK (
    (profile_type = 'customer' AND neighborhood_id IS NOT NULL)
    OR (profile_type = 'provider' AND neighborhood_id IS NULL)
  );

INSERT INTO provider_service_regions (provider_id, region_id, source)
SELECT user_id, region_id, 'onboarding'
FROM onboarding_profiles
WHERE profile_type = 'provider'
ON CONFLICT (provider_id, region_id) DO UPDATE SET active = true, updated_at = now();

ALTER TABLE service_requests
  ADD COLUMN region_id uuid REFERENCES service_regions(id),
  ADD COLUMN neighborhood_id uuid REFERENCES service_region_neighborhoods(id);

UPDATE service_requests request
SET
  region_id = region.id,
  neighborhood_id = COALESCE((
    SELECT neighborhood.id
    FROM service_region_neighborhoods neighborhood
    WHERE neighborhood.region_id = region.id
      AND lower(neighborhood.name) = lower(request.neighborhood)
    LIMIT 1
  ), 'b2100000-0000-4000-8000-000000000001'::uuid),
  city = region.city,
  state = region.state
FROM service_regions region
WHERE region.code = 'SOR-SP';

ALTER TABLE service_requests
  ALTER COLUMN region_id SET NOT NULL,
  ALTER COLUMN neighborhood_id SET NOT NULL;

CREATE INDEX service_requests_region_status_created_idx
  ON service_requests (region_id, status, created_at DESC);

CREATE FUNCTION protect_service_region_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.active = true AND NEW.active = false
    AND NOT EXISTS (
      SELECT 1
      FROM service_regions region
      WHERE region.id <> OLD.id AND region.active = true
    )
  THEN
    RAISE EXCEPTION 'O piloto precisa manter ao menos uma região ativa.'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.active = false AND NEW.active = true
    AND NOT EXISTS (
      SELECT 1
      FROM service_region_neighborhoods neighborhood
      WHERE neighborhood.region_id = OLD.id AND neighborhood.active = true
    )
  THEN
    RAISE EXCEPTION 'Ative ao menos um bairro antes de ativar a região.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_regions_availability_guard
  BEFORE UPDATE OF active ON service_regions
  FOR EACH ROW
  EXECUTE FUNCTION protect_service_region_availability();

CREATE FUNCTION protect_service_region_neighborhood_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.active = true AND NEW.active = false
    AND EXISTS (
      SELECT 1 FROM service_regions region
      WHERE region.id = OLD.region_id AND region.active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM service_region_neighborhoods neighborhood
      WHERE neighborhood.region_id = OLD.region_id
        AND neighborhood.id <> OLD.id
        AND neighborhood.active = true
    )
  THEN
    RAISE EXCEPTION 'Uma região ativa precisa manter ao menos um bairro ativo.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_region_neighborhoods_availability_guard
  BEFORE UPDATE OF active ON service_region_neighborhoods
  FOR EACH ROW
  EXECUTE FUNCTION protect_service_region_neighborhood_availability();

ALTER TABLE service_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_regions FORCE ROW LEVEL SECURITY;
ALTER TABLE service_region_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_region_neighborhoods FORCE ROW LEVEL SECURITY;
ALTER TABLE service_region_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_region_events FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_service_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_service_regions FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_service_region_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_service_region_events FORCE ROW LEVEL SECURITY;

CREATE POLICY service_regions_read_policy
  ON service_regions
  FOR SELECT
  USING (
    active = true
    OR current_setting('app.actor_role', true) = 'operation'
  );

CREATE POLICY service_regions_operation_update_policy
  ON service_regions
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY service_region_neighborhoods_read_policy
  ON service_region_neighborhoods
  FOR SELECT
  USING (
    (
      active = true
      AND EXISTS (
        SELECT 1
        FROM service_regions region
        WHERE region.id = service_region_neighborhoods.region_id
          AND region.active = true
      )
    )
    OR current_setting('app.actor_role', true) = 'operation'
  );

CREATE POLICY service_region_neighborhoods_operation_update_policy
  ON service_region_neighborhoods
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY service_region_events_operation_read_policy
  ON service_region_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY service_region_events_operation_insert_policy
  ON service_region_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_service_regions_read_policy
  ON provider_service_regions
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_service_regions_insert_policy
  ON provider_service_regions
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      AND source = 'onboarding'
      AND EXISTS (
        SELECT 1 FROM service_regions region
        WHERE region.id = provider_service_regions.region_id AND region.active = true
      )
    )
  );

CREATE POLICY provider_service_regions_update_policy
  ON provider_service_regions
  FOR UPDATE
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      AND source = 'onboarding'
    )
  );

CREATE POLICY provider_service_region_events_read_policy
  ON provider_service_region_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_service_region_events_insert_policy
  ON provider_service_region_events
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND (
      current_setting('app.actor_role', true) = 'operation'
      OR (
        current_setting('app.actor_role', true) = 'provider'
        AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
        AND source = 'onboarding'
      )
    )
  );

DROP POLICY requests_read_policy ON service_requests;
CREATE POLICY requests_read_policy ON service_requests FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR (
    current_setting('app.actor_role', true) = 'provider'
    AND (
      (
        status IN ('open', 'proposals_received')
        AND EXISTS (
          SELECT 1
          FROM provider_service_regions coverage
          JOIN service_regions region ON region.id = coverage.region_id
          WHERE coverage.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
            AND coverage.region_id = service_requests.region_id
            AND coverage.active = true
            AND region.active = true
        )
      )
      OR EXISTS (
        SELECT 1
        FROM bookings booking
        WHERE booking.request_id = service_requests.id
          AND booking.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
    )
  )
);

DROP POLICY requests_insert_policy ON service_requests;
CREATE POLICY requests_insert_policy ON service_requests FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM service_regions region
    JOIN service_region_neighborhoods neighborhood
      ON neighborhood.region_id = region.id
    WHERE region.id = service_requests.region_id
      AND neighborhood.id = service_requests.neighborhood_id
      AND region.active = true
      AND neighborhood.active = true
  )
);

GRANT SELECT, UPDATE (active, version, updated_at) ON service_regions TO max_service_app;
GRANT SELECT, UPDATE (active, version, updated_at) ON service_region_neighborhoods TO max_service_app;
GRANT SELECT, INSERT ON service_region_events TO max_service_app;
GRANT SELECT, INSERT, UPDATE (active, source, updated_at) ON provider_service_regions TO max_service_app;
GRANT SELECT, INSERT ON provider_service_region_events TO max_service_app;
GRANT SELECT (region_id, neighborhood_id), UPDATE (region_id, neighborhood_id)
  ON onboarding_profiles TO max_service_app;
